// Safety Training Portal event endpoint.
// Receives start/complete events from the safety portal and emails the manager
// via the existing Outlook (Microsoft Graph) sender. Public (portal is static,
// cross-origin), lightly guarded by a shared key. Never blocks the portal.
//   Env: SAFETY_ALERT_TO (manager email), SAFETY_KEY (shared token), OUTLOOK_FROM_EMAIL (existing)
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../services/outlook');

const KEY = process.env.SAFETY_KEY || '';
const TO = process.env.SAFETY_ALERT_TO || '';

const esc = v => String(v == null ? '' : v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function fmtDur(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}
const row = (label, val) => `<tr><td style="padding:3px 12px 3px 0;color:#6f6f74">${label}</td><td style="padding:3px 0"><b>${val}</b></td></tr>`;

router.post('/', async (req, res) => {
  try {
    if (KEY && req.get('X-Safety-Key') !== KEY) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!TO) { console.warn('[safety] SAFETY_ALERT_TO not set — event received but no recipient'); return res.json({ ok: true, skipped: 'no-recipient' }); }

    const b = req.body || {};
    const type = b.type === 'start' ? 'start' : 'complete';
    const moduleName = esc(b.module || 'Safety');
    const operator = esc(b.operator || 'Unknown operator');
    const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const empRow = b.employeeId ? row('Employee ID', esc(b.employeeId)) : '';
    const langRow = b.language ? row('Language', esc(b.language)) : '';
    let subject, html;

    if (type === 'start') {
      subject = `Safety Test STARTED — ${operator} — ${moduleName}`;
      html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#161616">
        <h2 style="color:#C4242A;margin:0 0 10px;font-size:18px">Safety test started</h2>
        <p style="margin:0 0 12px"><b>${operator}</b> started the <b>${moduleName}</b> certification.</p>
        <table style="border-collapse:collapse;font-size:14px">
          ${row('Operator', operator)}${empRow}${row('Module', moduleName)}${langRow}${row('Started', when + ' ET')}
        </table></div>`;
    } else {
      const passed = !!b.passed;
      const color = passed ? '#1a7f4b' : '#C4242A';
      subject = `Safety Test ${passed ? 'PASSED' : 'FAILED'} — ${operator} — ${moduleName} (${esc(b.pct)}%)`;
      html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#161616">
        <h2 style="color:${color};margin:0 0 10px;font-size:18px">${passed ? 'PASSED' : 'FAILED'} — ${moduleName}</h2>
        <table style="border-collapse:collapse;font-size:14px">
          ${row('Operator', operator)}${empRow}${row('Module', moduleName)}
          ${row('Result', `<span style="color:${color}">${passed ? 'PASS' : 'FAIL'}</span> &nbsp; ${esc(b.score)}/${esc(b.total)} (${esc(b.pct)}%)`)}
          ${row('Time reading material', fmtDur(b.studySeconds))}
          ${row('Time on the test', fmtDur(b.testSeconds))}
          ${langRow}${row('Completed', when + ' ET')}
        </table></div>`;
    }

    const fromSet = !!process.env.OUTLOOK_FROM_EMAIL;
    let emailed = false;
    try { emailed = await sendEmail(TO, subject, html); } catch (e) { console.error('[safety] email failed:', e.message); }
    res.json({ ok: true, emailed: emailed, fromSet: fromSet });
  } catch (e) {
    console.error('[safety] error:', e.message);
    res.json({ ok: true });
  }
});

module.exports = router;
