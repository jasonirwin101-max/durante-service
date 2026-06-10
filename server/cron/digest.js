const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const sheets = require('../services/sheets');
const { sendEmail } = require('../services/outlook');
const { formatTimestampShort } = require('../utils/datetime');

const DIGEST_RECIPIENT = 'service@duranteequip.com';
const TZ = 'America/New_York';
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

// SRs in the active ServiceRequests sheet are by definition still open —
// Complete/Cancelled/Resolved via the Phone are archived to CompletedRequests
// at the status-change step. The user's spec is explicit: presence in the
// active sheet IS "open", with no further status filtering.

function buildDashboardUrl(srId) {
  const base = process.env.OFFICE_DASHBOARD_URL || 'https://durante-office.netlify.app';
  return `${base}/sr/${encodeURIComponent(srId)}`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return days === 1 ? '1 day' : `${days} days`;
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / 60000);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ageRowBg(ms) {
  if (ms >= 3 * DAY_MS) return '#fee2e2'; // red — 3+ days
  if (ms >= DAY_MS) return '#fef3c7';     // yellow — 24-72h
  return '#dcfce7';                       // green — <24h
}

function loadTemplate() {
  const filePath = path.join(__dirname, '..', 'templates', 'emails', 'daily_open_sr_digest.html');
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('[DAILY_DIGEST] Failed to load template:', err.message);
    return null;
  }
}

function statusBadge(status) {
  if (status === 'Pending Approval') {
    return `<span style="display:inline-block;padding:3px 10px;background:#facc15;color:#713f12;border-radius:12px;font-size:11px;font-weight:bold;white-space:nowrap;">&#9203; Awaiting Approval</span>`;
  }
  return escapeHtml(status || '—');
}

// Compact 4-col row for activity sections (completed yesterday, new, escalated).
function compactRow(sr) {
  return `<tr>
    <td style="padding:5px 10px;font-family:monospace;font-size:12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(sr.SR_ID)}</td>
    <td style="padding:5px 10px;font-size:13px;border-bottom:1px solid #f1f5f9;">${escapeHtml(sr.Company_Name || '—')}</td>
    <td style="padding:5px 10px;font-size:13px;border-bottom:1px solid #f1f5f9;">${escapeHtml(sr.Equipment_Description || '—')}</td>
    <td style="padding:5px 10px;font-size:13px;border-bottom:1px solid #f1f5f9;">${escapeHtml(sr.Assigned_Tech || 'Unassigned')}</td>
  </tr>`;
}

function activityBlock(title, rows, color = '#1A1A1A') {
  if (rows.length === 0) return '';
  return `<tr><td style="padding:24px 30px 0;">
    <h2 style="color:${color};margin:0 0 12px;font-size:16px;">${escapeHtml(title)} (${rows.length})</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${rows.map(compactRow).join('')}</tbody>
    </table>
  </td></tr>`;
}

async function runDailyDigest() {
  console.log('[DAILY_DIGEST] Running daily digest...');
  let allSRs;
  try {
    allSRs = await sheets.getAllServiceRequests();
  } catch (err) {
    console.error('[DAILY_DIGEST] Failed to fetch ServiceRequests — aborting today, will retry tomorrow:', err.message);
    return;
  }

  try {
    const now = new Date();
    const nowMs = now.getTime();

    const openSRs = allSRs.slice();
    const total = openSRs.length;

    // Sort oldest first — surface stale work at the top.
    const sortedSRs = openSRs.slice().sort((a, b) => {
      const aMs = new Date(a.Submitted_On).getTime() || 0;
      const bMs = new Date(b.Submitted_On).getTime() || 0;
      return aMs - bMs;
    });

    const pendingApproval = openSRs.filter(sr => sr.Current_Status === 'Pending Approval').length;
    const stat24h = openSRs.filter(sr => {
      const subMs = new Date(sr.Submitted_On).getTime();
      return Number.isFinite(subMs) && (nowMs - subMs) >= DAY_MS;
    }).length;
    const stat3d = openSRs.filter(sr => {
      const subMs = new Date(sr.Submitted_On).getTime();
      return Number.isFinite(subMs) && (nowMs - subMs) >= 3 * DAY_MS;
    }).length;

    // Main detailed table — sorted oldest first with row coloring by age.
    let openSrTable;
    if (sortedSRs.length === 0) {
      openSrTable = `<div style="padding:30px;text-align:center;background:#dcfce7;border-radius:6px;color:#15803d;font-weight:bold;">All caught up &mdash; no open service requests at this time.</div>`;
    } else {
      const rows = sortedSRs.map(sr => {
        const subMs = new Date(sr.Submitted_On).getTime();
        const validSub = Number.isFinite(subMs);
        const ageMs = validSub ? (nowMs - subMs) : 0;
        const bg = ageRowBg(ageMs);
        const ageStr = validSub ? formatAge(ageMs) : '—';
        const submitted = validSub ? `${formatTimestampShort(sr.Submitted_On)} ET` : 'Not specified';
        const dashUrl = buildDashboardUrl(sr.SR_ID);
        return `<tr style="background:${bg};">
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-family:monospace;font-size:12px;"><a href="${dashUrl}" style="color:#CC0000;text-decoration:underline;font-weight:bold;">${escapeHtml(sr.SR_ID)}</a></td>
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-size:13px;">${escapeHtml(sr.Company_Name || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-size:13px;">${escapeHtml(sr.Equipment_Description || '—')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-size:12px;">${statusBadge(sr.Current_Status)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-size:13px;">${escapeHtml(sr.Assigned_Tech || 'Unassigned')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-size:12px;color:#374151;white-space:nowrap;">${escapeHtml(submitted)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #ffffff;font-size:12px;font-weight:bold;white-space:nowrap;">${escapeHtml(ageStr)}</td>
        </tr>`;
      }).join('');
      openSrTable = `<table style="width:100%;border-collapse:collapse;border-radius:6px;overflow:hidden;">
        <thead><tr style="background:#1A1A1A;color:#ffffff;">
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">SR#</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Company</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Equipment</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Tech</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Submitted</th>
          <th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Age</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }

    // Existing Path-B sections: status counts, completed yesterday, new today, escalated.
    const statusGroups = {};
    for (const sr of openSRs) {
      const s = sr.Current_Status || 'Unknown';
      statusGroups[s] = (statusGroups[s] || 0) + 1;
    }
    let statusRows = '';
    for (const [status, count] of Object.entries(statusGroups).sort()) {
      statusRows += `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(status)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:13px;font-weight:bold;">${count}</td>
      </tr>`;
    }
    const statusCountsBlock = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#f5f5f5;">
        <th style="padding:6px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
        <th style="padding:6px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Count</th>
      </tr></thead>
      <tbody>${statusRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">No open SRs.</td></tr>'}</tbody>
    </table>`;

    const yesterdayStart = new Date(now); yesterdayStart.setDate(yesterdayStart.getDate() - 1); yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart); yesterdayEnd.setHours(23, 59, 59, 999);

    // Completed yesterday — pull from the archive, since finished SRs no
    // longer live in the active sheet.
    let completedYesterday = [];
    try {
      const completedAll = await sheets.getAllCompletedRequests();
      completedYesterday = completedAll.filter(sr => {
        const updated = new Date(sr.Status_Updated_At).getTime();
        return Number.isFinite(updated) && updated >= yesterdayStart.getTime() && updated <= yesterdayEnd.getTime();
      });
    } catch (err) {
      console.error('[DAILY_DIGEST] Failed to fetch CompletedRequests for yesterday section:', err.message);
    }

    const newSRs = openSRs.filter(sr => {
      const subMs = new Date(sr.Submitted_On).getTime();
      return Number.isFinite(subMs) && subMs >= yesterdayStart.getTime();
    });
    const escalated = openSRs.filter(sr => sr.Escalation_Flag === 'TRUE');

    const completedBlock = activityBlock('Completed Yesterday', completedYesterday);
    const newBlock = activityBlock('New Since Yesterday', newSRs);
    const escalatedBlock = activityBlock('⚠ Escalated (3+ days no update)', escalated, '#CC0000');

    const tpl = loadTemplate();
    if (!tpl) return;

    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ,
    });

    const rendered = tpl
      .split('{{DIGEST_DATE}}').join(escapeHtml(dateStr))
      .split('{{STAT_TOTAL}}').join(String(total))
      .split('{{STAT_PENDING_APPROVAL}}').join(String(pendingApproval))
      .split('{{STAT_24H}}').join(String(stat24h))
      .split('{{STAT_3D}}').join(String(stat3d))
      .split('{{OPEN_SR_TABLE}}').join(openSrTable)
      .split('{{STATUS_COUNTS_BLOCK}}').join(statusCountsBlock)
      .split('{{COMPLETED_YESTERDAY_BLOCK}}').join(completedBlock)
      .split('{{NEW_TODAY_BLOCK}}').join(newBlock)
      .split('{{ESCALATED_BLOCK}}').join(escalatedBlock);

    const subject = `Durante Service Daily Digest — ${total} open request${total === 1 ? '' : 's'}`;
    const ok = await sendEmail(DIGEST_RECIPIENT, subject, rendered);
    if (ok) {
      console.log(`[DAILY_DIGEST] Sent open SR digest to ${DIGEST_RECIPIENT} — ${total} open SRs`);
    } else {
      console.error(`[DAILY_DIGEST] sendEmail returned false for ${DIGEST_RECIPIENT}`);
    }
  } catch (err) {
    console.error('[DAILY_DIGEST] error:', err.message);
  }
}

function startDigestCron() {
  // Weekdays only — service team doesn't run on weekends; Monday morning's
  // email catches anything from Saturday/Sunday.
  cron.schedule('0 7 * * 1-5', runDailyDigest, { timezone: 'America/New_York' });
  console.log(`Daily digest cron scheduled: weekdays 7:00 AM ET → ${DIGEST_RECIPIENT}`);
}

module.exports = { startDigestCron, runDailyDigest };
