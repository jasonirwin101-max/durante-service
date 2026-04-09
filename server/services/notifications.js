const fs = require('fs');
const path = require('path');
const { sendSMS } = require('./ringcentral');
const { sendEmail, sendEmailWithAttachment } = require('./outlook');
const { deriveSubmitterEmail } = require('../utils/emailDeriver');
const { generateAndSavePDF } = require('./pdf');

// ─── SMS Templates (from CLAUDE.md spec) ────────────────────

const SMS_TEMPLATES = {
  'Received': (sr) => `Durante Equipment received ${sr.SR_ID} for ${sr.Equipment_Description}. Track: ${sr.Tracking_URL}`,
  'Acknowledged': (sr) => `${sr.SR_ID} acknowledged. A tech will be scheduled shortly.`,
  'Scheduled': (sr) => `Service scheduled for ${sr.Scheduled_Date}. ${sr.SR_ID}. Track: ${sr.Tracking_URL}`,
  'Dispatched': (sr) => `Tech ${getTechFirstName(sr.Assigned_Tech)} is on the way. ETA: ${sr.ETA}. ${sr.SR_ID}`,
  'On Site': (sr) => `Your Durante technician has arrived on site. ${sr.SR_ID}`,
  'Diagnosing': (sr) => `Our tech is diagnosing your equipment. ${sr.SR_ID}`,
  'In Progress': (sr) => `Work is underway on your equipment. ${sr.SR_ID}`,
  'Parts Ordered': (sr) => `Parts ordered. Est. arrival: ${sr.ETA}. ${sr.SR_ID}`,
  'Parts Arrived': (sr) => `Parts arrived — rescheduling your service. ${sr.SR_ID}`,
  'Complete': (sr) => `Service complete on ${sr.Equipment_Description}. Issue: ${sr.Tech_Notes || 'Resolved'}. Rate us: ${sr._ratingUrl || sr.Tracking_URL}`,
  'Follow-Up Required': (sr) => `A follow-up visit is needed: ${sr.Tech_Notes || 'See details'}. We will be in touch. ${sr.SR_ID}`,
  'Cannot Repair': (sr) => `Unable to complete repair on ${sr.SR_ID}. Please call: ${process.env.DURANTE_OFFICE_PHONE}`,
  'Cancelled': (sr) => `${sr.SR_ID} has been cancelled. Questions? Call ${process.env.DURANTE_OFFICE_PHONE}`,
};

// ─── Email Template File Map ────────────────────────────────

const EMAIL_TEMPLATE_MAP = {
  'Received': 'received.html',
  'Acknowledged': 'acknowledged.html',
  'Scheduled': 'scheduled.html',
  'Dispatched': 'dispatched.html',
  'On Site': 'on_site.html',
  'Diagnosing': 'diagnosing.html',
  'In Progress': 'in_progress.html',
  'Parts Ordered': 'parts_ordered.html',
  'Parts Arrived': 'parts_arrived.html',
  'Complete': 'complete.html',
  'Follow-Up Required': 'follow_up_required.html',
  'Cannot Repair': 'cannot_repair.html',
  'Cancelled': 'cancelled.html',
};

const EMAIL_SUBJECTS = {
  'Received': (sr) => `Service Request ${sr.SR_ID} — Received`,
  'Acknowledged': (sr) => `Service Request ${sr.SR_ID} — Acknowledged`,
  'Scheduled': (sr) => `Service Request ${sr.SR_ID} — Scheduled`,
  'Dispatched': (sr) => `Service Request ${sr.SR_ID} — Tech Dispatched`,
  'On Site': (sr) => `Service Request ${sr.SR_ID} — Technician On Site`,
  'Diagnosing': (sr) => `Service Request ${sr.SR_ID} — Diagnosing`,
  'In Progress': (sr) => `Service Request ${sr.SR_ID} — In Progress`,
  'Parts Ordered': (sr) => `Service Request ${sr.SR_ID} — Parts Ordered`,
  'Parts Arrived': (sr) => `Service Request ${sr.SR_ID} — Parts Arrived`,
  'Complete': (sr) => `Service Request ${sr.SR_ID} — Complete`,
  'Follow-Up Required': (sr) => `Service Request ${sr.SR_ID} — Follow-Up Required`,
  'Cannot Repair': (sr) => `Service Request ${sr.SR_ID} — Cannot Repair`,
  'Cancelled': (sr) => `Service Request ${sr.SR_ID} — Cancelled`,
};

// ─── Template Engine ────────────────────────────────────────

function loadEmailTemplate(status) {
  const filename = EMAIL_TEMPLATE_MAP[status];
  if (!filename) return null;

  const filePath = path.join(__dirname, '..', 'templates', 'emails', filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Failed to load email template: ${filename}`, err.message);
    return null;
  }
}

function renderTemplate(html, sr) {
  const vars = {
    '{{SR_ID}}': sr.SR_ID || '',
    '{{COMPANY_NAME}}': sr.Company_Name || '',
    '{{CONTACT_NAME}}': sr.Contact_Name || '',
    '{{EQUIPMENT}}': sr.Equipment_Description || '',
    '{{TECH_NAME}}': getTechFirstName(sr.Assigned_Tech),
    '{{ETA}}': sr.ETA || 'TBD',
    '{{SCHEDULED_DATE}}': sr.Scheduled_Date || 'TBD',
    '{{SUMMARY}}': sr.Tech_Notes || sr.Problem_Description || '',
    '{{TECH_NOTES}}': sr.Tech_Notes || '',
    '{{TRACKING_URL}}': sr.Tracking_URL || '',
    '{{RATING_URL}}': sr._ratingUrl || sr.Tracking_URL || '',
    '{{OFFICE_PHONE}}': process.env.DURANTE_OFFICE_PHONE || '',
  };

  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

function getTechFirstName(fullName) {
  if (!fullName) return 'a technician';
  return fullName.split(' ')[0];
}

// ─── Dispatch Logic ─────────────────────────────────────────

/**
 * Fire all notifications for a status change.
 *
 * Rules from CLAUDE.md:
 * - Every status change → Customer (email + SMS) + Submitter (email + SMS)
 * - Exception: ACKNOWLEDGED → Submitter only, NOT customer
 *
 * @param {object} sr - Full SR row data from sheets
 * @param {string} status - The new status
 * @returns {object} - { customerNotified, submitterNotified, smsSent, emailSent }
 */
async function fireNotifications(sr, status) {
  const result = {
    customerNotified: false,
    submitterNotified: false,
    smsSent: false,
    emailSent: false,
    pdfUrl: null,
    ratingToken: null,
  };

  const isAcknowledged = status === 'Acknowledged';
  const isComplete = status === 'Complete';

  // Generate PDF and rating token for COMPLETE
  let pdfBuffer = null;
  let pdfName = null;
  if (isComplete) {
    try {
      const { pdfUrl, pdfBuffer: buf } = await generateAndSavePDF(sr);
      pdfBuffer = buf;
      pdfName = `${sr.SR_ID}-completion-report.pdf`;
      result.pdfUrl = pdfUrl;
    } catch (err) {
      console.error('PDF generation failed:', err.message);
    }

    // Generate one-time rating token
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    result.ratingToken = token;

    // Update the SR's rating URL in the template data
    sr._ratingUrl = `${process.env.BASE_URL}/rate/${sr.SR_ID}/${token}`;
  }

  // Build SMS text
  const smsTemplate = SMS_TEMPLATES[status];
  let smsText = smsTemplate ? smsTemplate(sr) : null;

  // Build email HTML
  const emailHtml = loadEmailTemplate(status);
  let renderedHtml = emailHtml ? renderTemplate(emailHtml, sr) : null;
  const subjectFn = EMAIL_SUBJECTS[status];
  const subject = subjectFn ? subjectFn(sr) : `Service Request ${sr.SR_ID} — Update`;

  // For COMPLETE, use the email send function with or without PDF attachment
  const emailSendFn = (isComplete && pdfBuffer)
    ? (to, subj, html) => sendEmailWithAttachment(to, subj, html, pdfBuffer, pdfName)
    : sendEmail;

  // ─── Send to Customer (unless ACKNOWLEDGED) ────────────
  if (!isAcknowledged) {
    if (smsText && sr.Contact_Phone) {
      const smsResult = await sendSMS(sr.Contact_Phone, smsText);
      if (smsResult) {
        result.smsSent = true;
        result.customerNotified = true;
      }
    }

    if (renderedHtml && sr.Contact_Email) {
      const emailResult = await emailSendFn(sr.Contact_Email, subject, renderedHtml);
      if (emailResult) {
        result.emailSent = true;
        result.customerNotified = true;
      }
    }
  }

  // ─── Send to Submitter (always) ────────────────────────
  const submitterEmail = deriveSubmitterEmail(sr.Submitter_Name);

  if (smsText && sr.Submitter_Phone) {
    const smsResult = await sendSMS(sr.Submitter_Phone, smsText);
    if (smsResult) {
      result.smsSent = true;
      result.submitterNotified = true;
    }
  }

  if (renderedHtml && submitterEmail) {
    const emailResult = await emailSendFn(submitterEmail, subject, renderedHtml);
    if (emailResult) {
      result.emailSent = true;
      result.submitterNotified = true;
    }
  }

  console.log(`Notifications fired for ${sr.SR_ID} → ${status}:`, result);
  return result;
}

module.exports = { fireNotifications, renderTemplate, loadEmailTemplate, SMS_TEMPLATES };
