const cron = require('node-cron');
const sheets = require('../services/sheets');
const { sendEmail } = require('../services/outlook');

const DIGEST_RECIPIENTS = [
  'eddie.rivera@duranteequip.com',
  'nbalmaseda@duranteequip.com',
];

const CLOSED_STATUSES = ['Complete', 'Cancelled', 'Cannot Repair'];

async function runDailyDigest() {
  console.log('[Digest] Running daily digest...');
  try {
    const allSRs = await sheets.getAllServiceRequests();
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Open SRs grouped by status
    const openSRs = allSRs.filter(sr => !CLOSED_STATUSES.includes(sr.Current_Status));
    const statusGroups = {};
    for (const sr of openSRs) {
      const s = sr.Current_Status || 'Unknown';
      if (!statusGroups[s]) statusGroups[s] = [];
      statusGroups[s].push(sr);
    }

    // Completed yesterday
    const completedYesterday = allSRs.filter(sr => {
      if (sr.Current_Status !== 'Complete') return false;
      const updated = new Date(sr.Status_Updated_At);
      return updated >= yesterdayStart && updated <= yesterdayEnd;
    });

    // New SRs since yesterday
    const newSRs = allSRs.filter(sr => {
      const submitted = new Date(sr.Submitted_On);
      return submitted >= yesterdayStart;
    });

    // Escalated
    const escalated = allSRs.filter(sr => sr.Escalation_Flag === 'TRUE' && !CLOSED_STATUSES.includes(sr.Current_Status));

    // Build email
    let statusTable = '';
    for (const [status, srs] of Object.entries(statusGroups).sort()) {
      statusTable += `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;">${status}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:bold;">${srs.length}</td>
      </tr>`;
    }

    const srRow = (sr) => `<tr>
      <td style="padding:4px 8px;font-family:monospace;font-size:12px;">${sr.SR_ID}</td>
      <td style="padding:4px 8px;">${sr.Company_Name}</td>
      <td style="padding:4px 8px;">${sr.Equipment_Description}</td>
      <td style="padding:4px 8px;">${sr.Assigned_Tech || '—'}</td>
    </tr>`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;">
        <div style="background:#1A1A1A;color:#fff;padding:15px 20px;">
          <h2 style="margin:0;color:#E31837;">Daily Service Digest</h2>
          <p style="margin:4px 0 0;font-size:13px;color:#aaa;">${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        <div style="padding:15px 0;">
          <h3 style="color:#1A1A1A;margin:0 0 8px;">Open SRs by Status (${openSRs.length} total)</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f5f5f5;">
              <th style="padding:6px 12px;text-align:left;font-size:12px;">Status</th>
              <th style="padding:6px 12px;text-align:left;font-size:12px;">Count</th>
            </tr></thead>
            <tbody>${statusTable}</tbody>
          </table>
        </div>

        ${completedYesterday.length > 0 ? `
        <div style="padding:15px 0;border-top:1px solid #eee;">
          <h3 style="color:#1A1A1A;margin:0 0 8px;">Completed Yesterday (${completedYesterday.length})</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${completedYesterday.map(srRow).join('')}</tbody>
          </table>
        </div>` : ''}

        ${newSRs.length > 0 ? `
        <div style="padding:15px 0;border-top:1px solid #eee;">
          <h3 style="color:#1A1A1A;margin:0 0 8px;">New Since Yesterday (${newSRs.length})</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${newSRs.map(srRow).join('')}</tbody>
          </table>
        </div>` : ''}

        ${escalated.length > 0 ? `
        <div style="padding:15px 0;border-top:2px solid #E31837;">
          <h3 style="color:#E31837;margin:0 0 8px;">⚠ Escalated (${escalated.length})</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>${escalated.map(srRow).join('')}</tbody>
          </table>
        </div>` : ''}

        <p style="color:#999;font-size:11px;margin-top:20px;">Automated digest from Durante Equipment service system.</p>
      </div>
    `;

    const subject = `Durante Service Digest — ${openSRs.length} Open, ${newSRs.length} New, ${completedYesterday.length} Completed`;
    for (const email of DIGEST_RECIPIENTS) {
      await sendEmail(email, subject, html);
    }

    console.log(`[Digest] Sent to ${DIGEST_RECIPIENTS.length} recipients.`);
  } catch (err) {
    console.error('[Digest] Error:', err.message);
  }
}

function startDigestCron() {
  cron.schedule('0 7 * * *', runDailyDigest, {
    timezone: 'America/New_York',
  });
  console.log('Daily digest cron scheduled: daily 7:00 AM ET');
}

module.exports = { startDigestCron, runDailyDigest };
