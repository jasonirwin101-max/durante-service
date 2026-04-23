const fs = require('fs');
const path = require('path');
const { sendSMS } = require('./ringcentral');
const { sendEmail, sendEmailWithAttachment } = require('./outlook');
const { deriveSubmitterEmail } = require('../utils/emailDeriver');
const { generateAndSavePDF } = require('./pdf');

// ─── SMS Templates ──────────────────────────────────────────
// Each template takes (sr, name) so the same template personalizes
// for the customer (Contact_Name) and the submitter (first name).

const SMS_TEMPLATES = {
  'Received': (sr, name) =>
    `Hi ${name}, Durante Equipment has received your service request for ${sr.Equipment_Description} at ${sr.Site_Address}. Your request number is ${sr.SR_ID}. We will be in touch shortly to schedule a technician. Track your request: ${sr.Tracking_URL}`,
  'Acknowledged': (sr, name) =>
    `Hi ${name}, your service request ${sr.SR_ID} has been reviewed and acknowledged by our team. A technician will be scheduled shortly. Questions? Call us at ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Scheduled': (sr, name) =>
    `Hi ${name}, a Durante Equipment technician has been scheduled for your service request ${sr.SR_ID}. Appointment: ${formatETA(sr.Scheduled_Date)}. Track: ${sr.Tracking_URL}`,
  'Dispatched': (sr, name) =>
    `Hi ${name}, your Durante Equipment technician ${getTechFirstName(sr.Assigned_Tech)} is on the way to ${sr.Site_Address}. ETA: ${formatETA(sr.ETA)}. SR: ${sr.SR_ID}. Track: ${sr.Tracking_URL}`,
  'On Site': (sr, name) =>
    `Hi ${name}, your Durante Equipment technician has arrived at ${sr.Site_Address} for SR ${sr.SR_ID}. Track updates: ${sr.Tracking_URL}`,
  'Diagnosing': (sr, name) =>
    `Hi ${name}, our technician is currently diagnosing the issue with your equipment for SR ${sr.SR_ID}. We will update you shortly. Track: ${sr.Tracking_URL}`,
  'In Progress': (sr, name) =>
    `Hi ${name}, work is currently underway on your equipment for SR ${sr.SR_ID}. Track updates: ${sr.Tracking_URL}`,
  'Parts Needed': (sr, name) =>
    `Hi ${name}, our technician has identified that parts are needed for your equipment. Our office will contact you shortly to discuss next steps. SR: ${sr.SR_ID}.`,
  'Parts Ordered': (sr, name) =>
    `Hi ${name}, parts have been ordered for your equipment repair. We will contact you once they arrive to schedule a return visit. SR: ${sr.SR_ID}.`,
  'Parts Arrived': (sr, name) =>
    `Hi ${name}, the parts for your equipment have arrived. We are scheduling a return visit for SR ${sr.SR_ID}. Our office will contact you shortly.`,
  'Left Site - Will Schedule Return': (sr, name) =>
    `Hi ${name}, your Durante Equipment technician has completed the initial visit for SR ${sr.SR_ID}. Our office will contact you to schedule a return visit.`,
  'Unit to be Swapped': (sr, name) =>
    `Hi ${name}, your equipment is scheduled to be swapped for SR ${sr.SR_ID}. Estimated date and time: ${formatETA(sr.ETA)}. Questions? Call us at ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Unit Has Been Swapped': (sr, name) =>
    `Hi ${name}, your Durante Equipment unit has been swapped for SR ${sr.SR_ID}. Please inspect your equipment and contact us if you have any concerns. Call us at ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Complete': (sr, name) =>
    `Hi ${name}, service has been completed on your equipment for SR ${sr.SR_ID}. Summary: ${stripTimestamps(sr.Tech_Notes || 'Resolved')}. We hope everything is working well! Please take a moment to rate our service: ${sr._ratingUrl || sr.Tracking_URL}`,
  'Follow-Up Required': (sr, name) =>
    `Hi ${name}, a follow-up visit is required for SR ${sr.SR_ID}. Our office will contact you shortly to schedule a return visit. Questions? Call ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Cannot Repair': (sr, name) =>
    `Hi ${name}, unfortunately our technician was unable to complete the repair for SR ${sr.SR_ID}. Please contact our office to discuss next steps: ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Cancelled': (sr, name) =>
    `Hi ${name}, your service request SR ${sr.SR_ID} has been cancelled. If you have any questions please contact us at ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
};

function getFirstName(fullName) {
  if (!fullName) return 'there';
  return fullName.trim().split(/\s+/)[0] || 'there';
}

// ─── Email Template File Map ────────────────────────────────

const EMAIL_TEMPLATE_MAP = {
  'Received': 'received.html',
  'Acknowledged': 'acknowledged.html',
  'Scheduled': 'scheduled.html',
  'Dispatched': 'dispatched.html',
  'On Site': 'on_site.html',
  'Diagnosing': 'diagnosing.html',
  'In Progress': 'in_progress.html',
  'Parts Needed': 'parts_ordered.html',
  'Parts Ordered': 'parts_ordered.html',
  'Parts Arrived': 'parts_arrived.html',
  'Left Site - Will Schedule Return': 'follow_up_required.html',
  'Unit to be Swapped': 'scheduled.html',
  'Unit Has Been Swapped': 'complete.html',
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
  'Parts Needed': (sr) => `Service Request ${sr.SR_ID} — Parts Needed`,
  'Parts Ordered': (sr) => `Service Request ${sr.SR_ID} — Parts Ordered`,
  'Parts Arrived': (sr) => `Service Request ${sr.SR_ID} — Parts Arrived`,
  'Left Site - Will Schedule Return': (sr) => `Service Request ${sr.SR_ID} — Tech Left Site, Return Visit Needed`,
  'Unit to be Swapped': (sr) => `Service Request ${sr.SR_ID} — Unit Swap Scheduled`,
  'Unit Has Been Swapped': (sr) => `Service Request ${sr.SR_ID} — Unit Swapped`,
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
    '{{ETA}}': formatETA(sr.ETA),
    '{{SCHEDULED_DATE}}': formatETA(sr.Scheduled_Date),
    '{{SUMMARY}}': stripTimestamps(sr.Tech_Notes || sr.Problem_Description || ''),
    '{{TECH_NOTES}}': stripTimestamps(sr.Tech_Notes || ''),
    '{{TRACKING_URL}}': sr.Tracking_URL || '',
    '{{RATING_URL}}': sr._ratingUrl || sr.Tracking_URL || '',
    '{{OFFICE_PHONE}}': formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE),
    '{{OFFICE_PHONE_TEL}}': formatPhoneTel(process.env.DURANTE_OFFICE_PHONE),
    '{{PHOTOS}}': buildPhotoHtml(sr),
  };

  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

function buildPhotoHtml(sr) {
  const photos = [sr.Photo_1, sr.Photo_2, sr.Photo_3, sr.Photo_4].filter(
    p => p && p.startsWith('http')
  );
  if (photos.length === 0) return '';
  const links = photos.map(
    (url, i) => `<a href="${url}" style="color:#E31837;text-decoration:underline;">Photo ${i + 1}</a>`
  ).join(' &nbsp; ');
  return `<tr><td style="padding:8px 12px;font-weight:bold;">Photos</td><td style="padding:8px 12px;">${links}</td></tr>`;
}

function formatETA(eta) {
  if (!eta || eta === 'undefined' || eta === 'null' || eta === 'Invalid Date' || eta === 'TBD') {
    return 'To be confirmed';
  }
  try {
    const date = new Date(eta);
    if (isNaN(date.getTime())) return eta; // readable string like "Between 2-4 PM"
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
    const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' });
    return `${time} ${dateStr}`;
  } catch {
    return 'To be confirmed';
  }
}

function stripTimestamps(text) {
  if (!text) return '';
  // Remove [2026-04-12T15:44:45.899Z] prefixes from each line
  return text.replace(/\[\d{4}-\d{2}-\d{2}T[\d:.]+Z?\]\s*/g, '').trim();
}

function formatPhoneDisplay(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return phone;
}

function formatPhoneTel(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone;
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

  // Build SMS text — personalized separately for customer and submitter
  const smsTemplate = SMS_TEMPLATES[status];
  const customerSmsText = smsTemplate ? smsTemplate(sr, sr.Contact_Name || 'there') : null;
  const submitterSmsText = smsTemplate ? smsTemplate(sr, getFirstName(sr.Submitter_Name)) : null;

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
    console.log(`[Notify] Customer SMS — phone: "${sr.Contact_Phone}", hasTemplate: ${!!customerSmsText}`);
    if (customerSmsText && sr.Contact_Phone) {
      const smsResult = await sendSMS(sr.Contact_Phone, customerSmsText);
      if (smsResult) {
        result.smsSent = true;
        result.customerNotified = true;
      }
    } else {
      console.log(`[Notify] Customer SMS skipped — phone: "${sr.Contact_Phone}", text: ${customerSmsText ? 'yes' : 'no'}`);
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

  console.log(`[Notify] Submitter SMS — phone: "${sr.Submitter_Phone}", hasTemplate: ${!!submitterSmsText}`);
  if (submitterSmsText && sr.Submitter_Phone) {
    const smsResult = await sendSMS(sr.Submitter_Phone, submitterSmsText);
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

  // ─── Send to service team on RECEIVED only ─────────────
  if (status === 'Received' && renderedHtml) {
    sendEmail('service@duranteequip.com', subject, renderedHtml).catch(err =>
      console.error('[Notify] service@ email failed:', err.message)
    );
    console.log('[Notify] RECEIVED email sent to service@duranteequip.com');
  }

  console.log(`Notifications fired for ${sr.SR_ID} → ${status}:`, result);
  return result;
}

module.exports = { fireNotifications, renderTemplate, loadEmailTemplate, SMS_TEMPLATES };
