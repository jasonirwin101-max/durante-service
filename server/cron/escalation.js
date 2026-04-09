const cron = require('node-cron');
const sheets = require('../services/sheets');
const { sendEmail } = require('../services/outlook');

const ESCALATION_RECIPIENTS = [
  'eddie.rivera@duranteequip.com',
  'nbalmaseda@duranteequip.com',
  'jirwin@duranteequip.com',
];

const CLOSED_STATUSES = ['Complete', 'Cancelled', 'Cannot Repair'];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

async function runEscalationCheck() {
  console.log('[Escalation] Running check...');
  try {
    const allSRs = await sheets.getAllServiceRequests();
    const now = Date.now();
    const toEscalate = [];

    for (const sr of allSRs) {
      if (CLOSED_STATUSES.includes(sr.Current_Status)) continue;
      if (sr.Escalation_Flag === 'TRUE') continue;
      if (!sr.Status_Updated_At) continue;

      const lastUpdate = new Date(sr.Status_Updated_At).getTime();
      if (now - lastUpdate > THREE_DAYS_MS) {
        toEscalate.push(sr);
      }
    }

    if (toEscalate.length === 0) {
      console.log('[Escalation] No SRs to escalate.');
      return;
    }

    console.log(`[Escalation] ${toEscalate.length} SR(s) to escalate.`);

    // Set Escalation_Flag = TRUE for each
    for (const sr of toEscalate) {
      await sheets.updateServiceRequestField(sr.SR_ID, 'Escalation_Flag', 'TRUE');
    }

    // Build alert email
    const rows = toEscalate.map(sr => {
      const days = Math.floor((now - new Date(sr.Status_Updated_At).getTime()) / 86400000);
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;">${sr.SR_ID}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${sr.Company_Name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${sr.Equipment_Description}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${sr.Current_Status}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${sr.Assigned_Tech || '<em>Unassigned</em>'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#E31837;font-weight:bold;">${days} days</td>
      </tr>`;
    }).join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;">
        <div style="background:#E31837;color:#fff;padding:15px 20px;">
          <h2 style="margin:0;">Escalation Alert</h2>
          <p style="margin:4px 0 0;font-size:13px;">${toEscalate.length} service request(s) overdue — no update in 3+ days</p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:15px 0;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:8px;text-align:left;font-size:12px;">SR#</th>
              <th style="padding:8px;text-align:left;font-size:12px;">Company</th>
              <th style="padding:8px;text-align:left;font-size:12px;">Equipment</th>
              <th style="padding:8px;text-align:left;font-size:12px;">Status</th>
              <th style="padding:8px;text-align:left;font-size:12px;">Tech</th>
              <th style="padding:8px;text-align:left;font-size:12px;">Age</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#666;font-size:12px;">This is an automated alert from the Durante Equipment service system.</p>
      </div>
    `;

    const subject = `[ESCALATION] ${toEscalate.length} Overdue Service Request(s)`;
    for (const email of ESCALATION_RECIPIENTS) {
      await sendEmail(email, subject, html);
    }

    console.log(`[Escalation] Alert sent to ${ESCALATION_RECIPIENTS.length} recipients for ${toEscalate.length} SR(s).`);
  } catch (err) {
    console.error('[Escalation] Error:', err.message);
  }
}

function startEscalationCron() {
  // 8:00 AM Eastern — node-cron supports timezone
  cron.schedule('0 8 * * *', runEscalationCheck, {
    timezone: 'America/New_York',
  });
  console.log('Escalation cron scheduled: daily 8:00 AM ET');
}

module.exports = { startEscalationCron, runEscalationCheck };
