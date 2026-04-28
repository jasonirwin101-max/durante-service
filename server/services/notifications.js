const fs = require('fs');
const path = require('path');
const { sendSMS } = require('./ringcentral');
const { sendEmail, sendEmailWithAttachment } = require('./outlook');
const { deriveSubmitterEmail } = require('../utils/emailDeriver');
const { generateAndSavePDF } = require('./pdf');
const { getStatusHistoryBySrId } = require('./sheets');

// ─── Customer SMS Templates ─────────────────────────────────
// Professional, customer-facing. Takes (sr, name) so the greeting
// personalizes to Contact_Name.

const CUSTOMER_SMS_TEMPLATES = {
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
  'Complete': (sr, name, currentNote) =>
    `Hi ${name}, service has been completed on your equipment for SR ${sr.SR_ID}. Summary: ${stripTimestamps(currentNote || 'Resolved')}. We hope everything is working well! Please take a moment to rate our service: ${sr._ratingUrl || sr.Tracking_URL}`,
  'Follow-Up Required': (sr, name) =>
    `Hi ${name}, a follow-up visit is required for SR ${sr.SR_ID}. Our office will contact you shortly to schedule a return visit. Questions? Call ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Cannot Repair': (sr, name) =>
    `Hi ${name}, unfortunately our technician was unable to complete the repair for SR ${sr.SR_ID}. Please contact our office to discuss next steps: ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
  'Cancelled': (sr, name) =>
    `Hi ${name}, your service request SR ${sr.SR_ID} has been cancelled. If you have any questions please contact us at ${formatPhoneDisplay(process.env.DURANTE_OFFICE_PHONE)}.`,
};

// ─── Submitter SMS Templates ────────────────────────────────
// Brief internal-update tone for the DE employee who submitted the SR.

const SUBMITTER_SMS_TEMPLATES = {
  'Received': (sr) =>
    `${sr.SR_ID} New SR submitted for ${sr.Company_Name}. Equipment: ${sr.Equipment_Description}. Assigned to: ${sr.Assigned_Tech || 'Unassigned'}.`,
  'Acknowledged': (sr) =>
    `${sr.SR_ID} - ${sr.Company_Name} SR has been acknowledged by the office team.`,
  'Scheduled': (sr) =>
    `${sr.SR_ID} - ${sr.Company_Name} SR scheduled for ${formatETA(sr.Scheduled_Date)}.`,
  'Dispatched': (sr) =>
    `${sr.SR_ID} - Tech ${sr.Assigned_Tech || 'TBD'} dispatched to ${sr.Company_Name}. ETA: ${formatETA(sr.ETA)}.`,
  'On Site': (sr) =>
    `${sr.SR_ID} - Tech ${sr.Assigned_Tech || 'TBD'} has arrived on site at ${sr.Company_Name}.`,
  'Diagnosing': (sr) =>
    `${sr.SR_ID} - Tech is diagnosing the issue at ${sr.Company_Name}.`,
  'In Progress': (sr) =>
    `${sr.SR_ID} - Work is in progress at ${sr.Company_Name}.`,
  'Parts Needed': (sr) =>
    `${sr.SR_ID} - Tech has identified parts needed at ${sr.Company_Name}. Office to follow up on ordering.`,
  'Parts Ordered': (sr) =>
    `${sr.SR_ID} - Parts have been ordered for ${sr.Company_Name} SR.`,
  'Parts Arrived': (sr) =>
    `${sr.SR_ID} - Parts have arrived for ${sr.Company_Name}. Return visit being scheduled.`,
  'Left Site - Will Schedule Return': (sr) =>
    `${sr.SR_ID} - Tech has left ${sr.Company_Name} site. Return visit to be scheduled.`,
  'Unit to be Swapped': (sr) =>
    `${sr.SR_ID} - Unit swap scheduled for ${sr.Company_Name}. ETA: ${formatETA(sr.ETA)}.`,
  'Unit Has Been Swapped': (sr) =>
    `${sr.SR_ID} - Unit has been swapped at ${sr.Company_Name}.`,
  'Complete': (sr) =>
    `${sr.SR_ID} - Service COMPLETE at ${sr.Company_Name}. Tech: ${sr.Assigned_Tech || 'TBD'}. Summary: ${stripTimestamps(sr.Tech_Notes || 'Resolved')}.`,
  'Follow-Up Required': (sr) =>
    `${sr.SR_ID} - Follow-up required at ${sr.Company_Name}. Office to contact customer.`,
  'Cannot Repair': (sr) =>
    `${sr.SR_ID} - Unable to repair at ${sr.Company_Name}. Office to contact customer.`,
  'Cancelled': (sr) =>
    `${sr.SR_ID} - SR for ${sr.Company_Name} has been cancelled.`,
};

// ─── Status badge colors for email HTML ─────────────────────
const STATUS_HEX = {
  'Received': '#6b7280', 'Acknowledged': '#3b82f6', 'Scheduled': '#f97316',
  'Dispatched': '#f97316', 'On Site': '#16a34a', 'Diagnosing': '#2563eb',
  'In Progress': '#16a34a', 'Parts Needed': '#f97316', 'Parts Ordered': '#f97316',
  'Parts Arrived': '#22c55e', 'Left Site - Will Schedule Return': '#3b82f6',
  'Unit to be Swapped': '#9333ea', 'Unit Has Been Swapped': '#7e22ce',
  'Complete': '#15803d', 'Follow-Up Required': '#ea580c',
  'Cannot Repair': '#dc2626', 'Cancelled': '#9ca3af',
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

function renderTemplate(html, sr, extras = {}) {
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
    ...extras,
  };

  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

function buildTimelineHtml(history) {
  if (!history || history.length === 0) {
    return '<tr><td style="padding:10px 14px;color:#6b7280;font-size:13px;">No history yet.</td></tr>';
  }
  const last3 = history.slice(-3).reverse();
  return last3.map(h => {
    const color = STATUS_HEX[h.Status] || '#6b7280';
    const ts = formatTimestampDisplay(h.Timestamp);
    const notes = stripTimestamps(h.Notes || '');
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top;width:180px;">
        <span style="display:inline-block;padding:3px 10px;background-color:${color};color:#ffffff;border-radius:10px;font-size:11px;font-weight:600;">${escapeHtml(h.Status)}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">
        <div>${escapeHtml(h.Updated_By || '')} <span style="color:#9ca3af;">· ${ts}</span></div>
        ${notes ? `<div style="margin-top:4px;color:#4b5563;">${escapeHtml(notes)}</div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function formatTimestampDisplay(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      hour12: true, timeZone: 'America/New_York',
    });
  } catch { return iso; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function loadInternalTemplate() {
  const filePath = path.join(__dirname, '..', 'templates', 'emails', 'internal_update.html');
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Failed to load internal_update.html:', err.message);
    return null;
  }
}

function loadNewRequestTemplate() {
  const filePath = path.join(__dirname, '..', 'templates', 'emails', 'internal_new_request.html');
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Failed to load internal_new_request.html:', err.message);
    return null;
  }
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
async function sendCustomerNotification(sr, status, currentNote = '') {
  const out = { notified: false, smsSent: false, emailSent: false };

  // Acknowledged is submitter-only per spec — customer is not notified.
  if (status === 'Acknowledged') return out;

  // SMS — customer-facing. Templates that reference notes use ONLY this update's
  // currentNote, never the full Tech_Notes history. Gate on TCPA consent.
  const smsBuilder = CUSTOMER_SMS_TEMPLATES[status];
  const smsText = smsBuilder ? smsBuilder(sr, sr.Contact_Name || 'there', currentNote) : null;
  if (sr.SMS_Consent === 'Yes') {
    console.log(`[Notify:Customer] SMS — phone: "${sr.Contact_Phone}", hasTemplate: ${!!smsText}`);
    if (smsText && sr.Contact_Phone) {
      if (await sendSMS(sr.Contact_Phone, smsText)) {
        out.smsSent = true;
        out.notified = true;
      }
    }
  } else {
    console.log(`[SMS] Skipped — customer opted out: ${sr.Contact_Name || sr.SR_ID}`);
  }

  // Email — customer-facing template. Override {{TECH_NOTES}} and {{SUMMARY}} so
  // they resolve to ONLY this update's note, not the accumulated Tech_Notes blob.
  // Also inject a "Technician Update" block before the Questions footer line so
  // the note appears in EVERY status email, not only those whose template
  // happened to reference {{TECH_NOTES}}.
  const html = loadEmailTemplate(status);
  if (html && sr.Contact_Email) {
    const customerExtras = {
      '{{TECH_NOTES}}': stripTimestamps(currentNote || ''),
      '{{SUMMARY}}': stripTimestamps(currentNote || sr.Problem_Description || ''),
    };
    let rendered = renderTemplate(html, sr, customerExtras);
    rendered = injectTechUpdateBlock(rendered, currentNote);
    const subjectFn = EMAIL_SUBJECTS[status];
    const subject = subjectFn ? subjectFn(sr) : `Service Request ${sr.SR_ID} — Update`;
    const sendFn = (status === 'Complete' && sr._pdfBuffer)
      ? (to, sb, ht) => sendEmailWithAttachment(to, sb, ht, sr._pdfBuffer, sr._pdfName)
      : sendEmail;
    if (await sendFn(sr.Contact_Email, subject, rendered)) {
      out.emailSent = true;
      out.notified = true;
    }
  }

  return out;
}

function injectTechUpdateBlock(html, currentNote) {
  if (!currentNote || !currentNote.trim()) return html;
  // Convert newlines in the note to <br> so multi-line notes render in email clients.
  const noteHtml = escapeHtml(currentNote.trim()).replace(/\n/g, '<br>');
  const block = `
<div style="margin:20px 0;padding:14px 18px;background-color:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;font-family:Arial,Helvetica,sans-serif;">
  <div style="font-size:11px;font-weight:bold;color:#92400E;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Technician Update</div>
  <div style="font-size:14px;color:#78350F;line-height:1.5;">${noteHtml}</div>
</div>
`;
  // Inject right before the "Questions?" footer line — every customer template
  // shares this pattern, so the block lands in the main content area.
  const marker = /<p style="color:#666;font-size:13px;">Questions\?/i;
  if (marker.test(html)) {
    return html.replace(marker, `${block}<p style="color:#666;font-size:13px;">Questions?`);
  }
  // Fallback: inject before </body> for any template that doesn't follow the pattern.
  if (html.includes('</body>')) {
    return html.replace('</body>', `${block}</body>`);
  }
  return html + block;
}

async function sendSubmitterNotification(sr, status) {
  const out = { notified: false, smsSent: false, emailSent: false };

  // SMS — brief internal update
  const smsBuilder = SUBMITTER_SMS_TEMPLATES[status];
  const smsText = smsBuilder ? smsBuilder(sr) : null;
  console.log(`[Notify:Submitter] SMS — phone: "${sr.Submitter_Phone}", hasTemplate: ${!!smsText}`);
  if (smsText && sr.Submitter_Phone) {
    if (await sendSMS(sr.Submitter_Phone, smsText)) {
      out.smsSent = true;
      out.notified = true;
    }
  }

  // Email — internal_update.html template, always, regardless of status
  const submitterEmail = deriveSubmitterEmail(sr.Submitter_Name);
  const html = loadInternalTemplate();
  if (html && submitterEmail) {
    const history = await getStatusHistoryBySrId(sr.SR_ID).catch(() => []);
    const color = STATUS_HEX[status] || '#6b7280';
    const dashboardUrl = process.env.OFFICE_DASHBOARD_URL
      ? `${process.env.OFFICE_DASHBOARD_URL}/sr/${sr.SR_ID}`
      : '';
    const extras = {
      '{{STATUS}}': status,
      '{{STATUS_COLOR}}': color,
      '{{CONTACT_PHONE}}': formatPhoneDisplay(sr.Contact_Phone) || sr.Contact_Phone || '',
      '{{SITE_ADDRESS}}': sr.Site_Address || '',
      '{{ASSET_NUMBER}}': sr.Asset_Number || '',
      '{{UNIT_NUMBER}}': sr.Unit_Number || '',
      '{{ASSIGNED_TECH}}': sr.Assigned_Tech || 'Unassigned',
      // Render multi-line accumulated notes with <br> so each timestamped
      // entry lands on its own line even in email clients that ignore CSS.
      '{{INTERNAL_NOTES}}': escapeHtml(sr.Internal_Notes || '').replace(/\n/g, '<br>'),
      '{{TIMELINE_HTML}}': buildTimelineHtml(history),
      '{{DASHBOARD_URL}}': dashboardUrl,
      '{{TECH_NOTES_FULL}}': escapeHtml(stripTimestamps(sr.Tech_Notes || '')).replace(/\n/g, '<br>'),
    };
    const rendered = renderTemplate(html, sr, extras);
    const subject = `${sr.SR_ID} - ${sr.Company_Name} - Status: ${status}`;
    if (await sendEmail(submitterEmail, subject, rendered)) {
      out.emailSent = true;
      out.notified = true;
    }
  }

  return out;
}

async function fireNotifications(sr, status, currentNotes = {}) {
  const result = {
    customerNotified: false,
    submitterNotified: false,
    smsSent: false,
    emailSent: false,
    pdfUrl: null,
    ratingToken: null,
  };

  // Generate PDF + rating token on COMPLETE — stash on sr for downstream use
  if (status === 'Complete') {
    const crypto = require('crypto');
    const token = crypto.randomBytes(24).toString('hex');
    result.ratingToken = token;
    sr._ratingUrl = `${process.env.BASE_URL}/rate/${sr.SR_ID}/${token}`;
    try {
      const { pdfUrl, pdfBuffer } = await generateAndSavePDF(sr);
      result.pdfUrl = pdfUrl;
      sr._pdfBuffer = pdfBuffer;
      sr._pdfName = `${sr.SR_ID}-completion-report.pdf`;
    } catch (err) {
      console.error('PDF generation failed:', err.message);
    }
  }

  const custRes = await sendCustomerNotification(sr, status, currentNotes.customerNote || '');
  const submRes = await sendSubmitterNotification(sr, status);

  result.customerNotified = custRes.notified;
  result.submitterNotified = submRes.notified;
  result.smsSent = custRes.smsSent || submRes.smsSent;
  result.emailSent = custRes.emailSent || submRes.emailSent;

  // Service team email on RECEIVED only — internal alert with full details
  if (status === 'Received') {
    const html = loadNewRequestTemplate();
    if (html) {
      const dashboardUrl = process.env.OFFICE_DASHBOARD_URL
        ? `${process.env.OFFICE_DASHBOARD_URL}/sr/${sr.SR_ID}`
        : '';
      const extras = {
        '{{SUBMITTED_ON}}': formatTimestampDisplay(sr.Submitted_On),
        '{{CONTACT_PHONE}}': formatPhoneDisplay(sr.Contact_Phone) || sr.Contact_Phone || '',
        '{{CONTACT_EMAIL}}': sr.Contact_Email || '',
        '{{SITE_ADDRESS}}': sr.Site_Address || '',
        '{{CUSTOMERS_NEED}}': sr.Customers_Need || '',
        '{{ASSET_NUMBER}}': sr.Asset_Number || '',
        '{{PROBLEM}}': sr.Problem_Description || '',
        '{{SUBMITTER_NAME}}': sr.Submitter_Name || '',
        '{{SUBMITTER_PHONE}}': formatPhoneDisplay(sr.Submitter_Phone) || sr.Submitter_Phone || '',
        '{{DASHBOARD_URL}}': dashboardUrl,
      };
      const rendered = renderTemplate(html, sr, extras);
      const subject = `New Service Request — ${sr.SR_ID} — ${sr.Company_Name}`;
      sendEmail('service@duranteequip.com', subject, rendered).catch(err =>
        console.error('[Notify] service@ email failed:', err.message)
      );
      console.log('[Notify] RECEIVED internal alert sent to service@duranteequip.com');
    }
  }

  console.log(`Notifications fired for ${sr.SR_ID} → ${status}:`, result);
  return result;
}

module.exports = {
  fireNotifications,
  sendCustomerNotification,
  sendSubmitterNotification,
  renderTemplate,
  loadEmailTemplate,
  CUSTOMER_SMS_TEMPLATES,
  SUBMITTER_SMS_TEMPLATES,
};
