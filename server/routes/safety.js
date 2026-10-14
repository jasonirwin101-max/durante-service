// Safety Training Portal event endpoint.
// Receives start/complete events from the safety portal and emails the manager
// via the existing Outlook (Microsoft Graph) sender. Public (portal is static,
// cross-origin), lightly guarded by a shared key. Never blocks the portal.
//
//   PASS  -> the branded "You Passed" poster (rendered per person) shown inline,
//            plus a Certificate of Completion PDF attached.
//   FAIL  -> a clean branded HTML alert (no poster, no certificate).
//   START -> a clean branded HTML alert.
//
//   Env: SAFETY_ALERT_TO (manager email), SAFETY_KEY (shared token),
//        OUTLOOK_FROM_EMAIL (existing)
const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const router = express.Router();
const { sendRich } = require('../services/outlook');
const { renderPassPoster } = require('../utils/safety-poster');

const KEY = process.env.SAFETY_KEY || '';
const TO = process.env.SAFETY_ALERT_TO || '';

const RED = '#C4242A';
const INK = '#16181d';
const BODY = '#232323';
const MUTE = '#6b7280';
const HEADBG = '#000000';

const ASSET_DIR = path.join(__dirname, '..', 'assets');
const LOGO_PLATE_PATH = path.join(ASSET_DIR, 'durante-logo.png');        // dark-plate logo (cert, on white)
const LOGO_TRANS_PATH = path.join(ASSET_DIR, 'durante-logo-trans.png');  // transparent logo (email header, on black)
let LOGO_PLATE_B64 = '', LOGO_TRANS_B64 = '';
try { LOGO_PLATE_B64 = fs.readFileSync(LOGO_PLATE_PATH).toString('base64'); } catch (e) { console.warn('[safety] plate logo missing:', e.message); }
try { LOGO_TRANS_B64 = fs.readFileSync(LOGO_TRANS_PATH).toString('base64'); } catch (e) { console.warn('[safety] trans logo missing:', e.message); }

const esc = (v) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function fmtDur(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

// ---- clean branded HTML (used for START and FAIL) ----
const row = (label, val) => `<tr>
  <td style="padding:10px 0;color:${MUTE};font-size:12.5px;vertical-align:top;border-bottom:1px solid #e9ebee">${label}</td>
  <td style="padding:10px 0;color:${INK};font-size:13.5px;font-weight:bold;text-align:right;vertical-align:top;border-bottom:1px solid #e9ebee">${val}</td></tr>`;

function htmlShell(bannerColor, bannerBg, bannerLabel, title, rowsHtml, note) {
  const logo = LOGO_TRANS_B64
    ? `<img src="cid:durantelogo" width="230" alt="Durante Equipment" style="display:block;margin:0 auto;max-width:230px;height:auto"/>`
    : `<div style="font-size:22px;font-weight:bold;color:#fff">DURANTE EQUIPMENT</div>`;
  return `<div style="margin:0;padding:0;background:#eceef1">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef1;padding:26px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="564" cellpadding="0" cellspacing="0" style="width:564px;max-width:564px;background:#fff;border:1px solid #e3e6ea;border-radius:14px;overflow:hidden">
        <tr><td style="background:${HEADBG};padding:26px 28px;text-align:center">${logo}</td></tr>
        <tr><td style="height:4px;background:${RED};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="background:${bannerBg};border-left:5px solid ${bannerColor};padding:16px 30px">
          <div style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:${bannerColor};font-weight:bold">${bannerLabel}</div>
          <div style="font-size:20px;font-weight:bold;color:${INK};margin-top:3px">${title}</div>
        </td></tr>
        <tr><td style="padding:18px 30px 6px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rowsHtml}</table>
        </td></tr>
        ${note ? `<tr><td style="padding:6px 30px 20px"><div style="background:#f7f8fa;border:1px solid #eceef1;border-radius:10px;padding:13px 15px;font-size:12.5px;color:${BODY};line-height:1.5">${note}</div></td></tr>` : `<tr><td style="height:16px"></td></tr>`}
        <tr><td style="background:${HEADBG};padding:20px 28px;text-align:center">
          <div style="color:#9aa0a8;font-size:11px;line-height:1.8;letter-spacing:.5px">DURANTE EQUIPMENT &nbsp;&middot;&nbsp; SAFETY TRAINING PORTAL<br/><span style="color:#c7ccd3">safety.duranteops.com</span> &nbsp;&middot;&nbsp; Automated notification</div>
        </td></tr>
      </table>
    </td></tr>
  </table></div>`;
}

// ---- Certificate of Completion PDF (attached on PASS) ----
function buildCertPdf({ operator, moduleName, score, total, pct, dateStr, isEquip }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0 });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const W = doc.page.width, H = doc.page.height;
      doc.rect(0, 0, W, H).fill('#ffffff');
      doc.lineWidth(3).strokeColor(RED).rect(26, 26, W - 52, H - 52).stroke();
      doc.lineWidth(1).strokeColor(RED).rect(34, 34, W - 68, H - 68).stroke();
      if (LOGO_PLATE_B64) { try { doc.image(LOGO_PLATE_PATH, (W - 230) / 2, 58, { width: 230 }); } catch (e) {} }
      else { doc.fillColor(RED).font('Helvetica-Bold').fontSize(24).text('DURANTE EQUIPMENT', 0, 70, { align: 'center' }); }
      let y = 172;
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(30).text('Certificate of Completion', 0, y, { align: 'center' }); y += 46;
      doc.fillColor(MUTE).font('Helvetica').fontSize(12).text('This certifies that', 0, y, { align: 'center' }); y += 26;
      doc.fillColor(RED).font('Helvetica-Bold').fontSize(32).text(operator, 0, y, { align: 'center' }); y += 50;
      doc.fillColor(INK).font('Helvetica').fontSize(13).text('has successfully passed the safety certification test for', 0, y, { align: 'center' }); y += 24;
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(moduleName, 0, y, { align: 'center' }); y += 40;
      doc.fillColor(MUTE).font('Helvetica').fontSize(12).text(`Score: ${score}/${total}  (${pct}%)   ·   Passing score 80%   ·   ${dateStr}`, 0, y, { align: 'center' });
      if (isEquip) { y += 20; doc.fillColor(MUTE).font('Helvetica-Oblique').fontSize(10).text('Equipment operation also requires a hands-on practical skills evaluation.', 0, y, { align: 'center' }); }
      const sy = H - 118, colW = 230, leftX = W / 2 - colW - 24, rightX = W / 2 + 24;
      doc.lineWidth(1).strokeColor('#9ca3af');
      doc.moveTo(leftX, sy).lineTo(leftX + colW, sy).stroke();
      doc.moveTo(rightX, sy).lineTo(rightX + colW, sy).stroke();
      doc.fillColor(MUTE).font('Helvetica').fontSize(10).text('Instructor Signature', leftX, sy + 7, { width: colW, align: 'center' }).text('Date', rightX, sy + 7, { width: colW, align: 'center' });
      doc.fillColor(MUTE).font('Helvetica').fontSize(9).text('Durante Equipment  ·  Safety Training Portal  ·  safety.duranteops.com', 0, H - 56, { align: 'center' });
      doc.end();
    } catch (e) { reject(e); }
  });
}

router.post('/', async (req, res) => {
  try {
    if (KEY && req.get('X-Safety-Key') !== KEY) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!TO) { console.warn('[safety] SAFETY_ALERT_TO not set — event received but no recipient'); return res.json({ ok: true, skipped: 'no-recipient' }); }

    const b = req.body || {};
    const type = b.type === 'start' ? 'start' : 'complete';
    const moduleName = esc(b.module || 'Safety');
    const operator = esc(b.operator || 'Unknown operator');
    const now = new Date();
    const when = now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
    const dateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' });
    const emp = b.employeeId ? esc(b.employeeId) : '';
    const lang = b.language ? esc(b.language) : '';

    const attachments = [];
    let subject, html;

    if (type === 'start') {
      if (LOGO_TRANS_B64) attachments.push({ name: 'durante-logo.png', contentType: 'image/png', contentBytes: LOGO_TRANS_B64, inline: true, contentId: 'durantelogo' });
      subject = `Safety Test STARTED — ${operator} — ${moduleName}`;
      const rows = row('Operator', operator) + (emp ? row('Employee ID', emp) : '') + row('Module', moduleName) + (lang ? row('Language', lang) : '') + row('Started', when);
      html = htmlShell('#334155', '#eef1f5', 'Test Started', `${operator} started the ${moduleName} test`, rows, '');
    } else {
      const passed = !!b.passed;
      const scoreText = `${esc(b.score)} / ${esc(b.total)} (${esc(b.pct)}%)`;

      if (passed) {
        subject = `Safety Test PASSED — ${operator} — ${moduleName} (${esc(b.pct)}%)`;
        // 1) render the branded poster with this person's data
        try {
          const poster = await renderPassPoster({
            operator, employeeId: emp || '—', module: moduleName,
            scoreText, language: lang || 'English', completed: when, pct: esc(b.pct),
          });
          attachments.push({ name: 'durante-safety-passed.jpg', contentType: 'image/jpeg', contentBytes: poster.toString('base64'), inline: true, contentId: 'duranteimg' });
        } catch (e) { console.error('[safety] poster render failed:', e.message); }
        // 2) certificate PDF
        try {
          const isEquip = /forklift|aerial|heavy|driver/i.test(moduleName);
          const pdf = await buildCertPdf({ operator, moduleName, score: esc(b.score), total: esc(b.total), pct: esc(b.pct), dateStr, isEquip });
          const safeName = `Certificate - ${operator} - ${moduleName}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
          attachments.push({ name: `${safeName}.pdf`, contentType: 'application/pdf', contentBytes: pdf.toString('base64') });
        } catch (e) { console.error('[safety] cert pdf failed:', e.message); }

        const hasPoster = attachments.some(a => a.contentId === 'duranteimg');
        const imgTag = hasPoster
          ? `<img src="cid:duranteimg" width="600" alt="Congratulations ${operator} — you passed your ${moduleName} safety test (${esc(b.pct)}%)" style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px"/>`
          : `<div style="font-family:Arial,sans-serif"><h2 style="color:#047d34">PASSED — ${esc(b.pct)}%</h2><p>${operator} passed the ${moduleName} test (${scoreText}).</p></div>`;
        html = `<div style="margin:0;padding:0;background:#eceef1">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef1;padding:24px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif">
            <tr><td align="center">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">
                <tr><td>${imgTag}</td></tr>
                <tr><td style="padding:14px 6px 2px;color:#374151;font-size:13px;line-height:1.6">
                  <b style="color:${INK}">${operator}</b> passed the <b>${moduleName}</b> test &mdash; ${scoreText}, completed ${when}.
                  A <b>Certificate of Completion</b> is attached as a PDF.
                </td></tr>
                <tr><td style="padding:10px 6px;color:#9aa0a8;font-size:11px;letter-spacing:.4px">DURANTE EQUIPMENT &middot; SAFETY TRAINING PORTAL &middot; safety.duranteops.com</td></tr>
              </table>
            </td></tr>
          </table></div>`;
      } else {
        if (LOGO_TRANS_B64) attachments.push({ name: 'durante-logo.png', contentType: 'image/png', contentBytes: LOGO_TRANS_B64, inline: true, contentId: 'durantelogo' });
        subject = `Safety Test FAILED — ${operator} — ${moduleName} (${esc(b.pct)}%)`;
        const rows = row('Operator', operator) + (emp ? row('Employee ID', emp) : '') + row('Module', moduleName)
          + row('Result', `<span style="color:${RED}">${scoreText}</span>`)
          + row('Time reading material', fmtDur(b.studySeconds)) + row('Time on the test', fmtDur(b.testSeconds))
          + (lang ? row('Language', lang) : '') + row('Completed', when);
        html = htmlShell(RED, '#fdecec', 'Did Not Pass', `${operator} — ${moduleName}`, rows,
          'A passing score of 80% is required. The operator should review the training material and retake the test. No certificate is issued until they pass.');
      }
    }

    const fromSet = !!process.env.OUTLOOK_FROM_EMAIL;
    let emailed = false;
    try { emailed = await sendRich(TO, subject, html, attachments); } catch (e) { console.error('[safety] email failed:', e.message); }
    res.json({ ok: true, emailed: emailed, fromSet: fromSet });
  } catch (e) {
    console.error('[safety] error:', e.message);
    res.json({ ok: true });
  }
});

module.exports = router;
