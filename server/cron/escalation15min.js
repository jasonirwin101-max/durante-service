const cron = require('node-cron');
const sheets = require('../services/sheets');
const { sendSMS } = require('../services/ringcentral');
const { sendEscalationWarningEmail } = require('../services/notifications');

function buildTrackingUrl(srId) {
  const base = process.env.BASE_URL || '';
  return `${base}/track/${srId}`;
}

function buildDashboardUrl(srId) {
  const base = process.env.OFFICE_DASHBOARD_URL || 'https://durante-office.netlify.app';
  return `${base}/sr/${srId}`;
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

async function runEscalation15MinCheck() {
  try {
    const allActive = await sheets.getAllServiceRequests();
    const now = Date.now();
    const cutoff = now - FIFTEEN_MIN_MS;

    // Acknowledging an SR moves Current_Status off "Received" — the first
    // clause naturally drops it from the candidate set, so no extra suppression
    // flag is needed for the "acknowledged within 15 min" case.
    // Submitted_On is the row's creation timestamp (ISO from /api/submit).
    const candidates = allActive.filter(sr =>
      sr.Current_Status === 'Received' &&
      sr.Escalation_Sent !== 'TRUE' &&
      sr.Submitted_On &&
      new Date(sr.Submitted_On).getTime() < cutoff
    );

    if (candidates.length === 0) return;

    const recipients = await sheets.getAlertRecipients();
    if (recipients.length === 0) {
      console.warn('[ESCALATION_15M] No alert recipients configured');
      return;
    }

    for (const sr of candidates) {
      const trackingUrl = sr.Tracking_URL || buildTrackingUrl(sr.SR_ID);

      // Fire SMS to every recipient — one failure must not block the others.
      const smsBody =
        `Durante WARNING: SR ${sr.SR_ID} from ${sr.Company_Name} ` +
        `has not been acknowledged for 15+ minutes. Please action. ` +
        `View: ${trackingUrl}`;

      for (const r of recipients) {
        try {
          await sendSMS(r.phone, smsBody);
        } catch (err) {
          console.error(`[ESCALATION_15M] SMS failed for ${r.name}: ${err.message}`);
        }
      }

      // Fire warning email to recipients that have an email on file.
      const emailRecipients = recipients
        .filter(r => r.email)
        .map(r => r.email)
        .join(',');

      try {
        await sendEscalationWarningEmail({
          to: emailRecipients,
          sr,
          dashboardUrl: buildDashboardUrl(sr.SR_ID),
        });
      } catch (err) {
        console.error(`[ESCALATION_15M] email dispatch failed for ${sr.SR_ID}: ${err.message}`);
      }

      // Mark as escalated so a server restart / next cron tick doesn't re-fire.
      try {
        await sheets.updateServiceRequestField(sr.SR_ID, 'Escalation_Sent', 'TRUE');
      } catch (err) {
        console.error(`[ESCALATION_15M] failed to set Escalation_Sent for ${sr.SR_ID}: ${err.message}`);
      }

      console.log(`[ESCALATION_15M] Fired for ${sr.SR_ID} — notified ${recipients.length} recipients`);
    }
  } catch (err) {
    console.error('[ESCALATION_15M] cron error:', err.message);
  }
}

function startEscalation15MinCron() {
  cron.schedule('* * * * *', runEscalation15MinCheck);
  console.log('15-min escalation cron scheduled: every minute');
}

module.exports = { startEscalation15MinCron, runEscalation15MinCheck };
