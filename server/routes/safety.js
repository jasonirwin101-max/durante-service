// Safety Training Portal event endpoint.
// Receives start/complete events from the safety portal and emails the manager
// via the existing Outlook (Microsoft Graph) sender. Public (portal is static,
// cross-origin), lightly guarded by a shared key. Never blocks the portal.
//
// Branded email: Durante logo header on every alert; on a PASS it also embeds
// the "One Goal, One Team, One Durante" image and attaches a generated
// Certificate of Completion PDF.
//
//   Env: SAFETY_ALERT_TO (manager email), SAFETY_KEY (shared token),
//        OUTLOOK_FROM_EMAIL (existing)
const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const router = express.Router();
const { sendRich } = require('../services/outlook');

const KEY = process.env.SAFETY_KEY || '';
const TO = process.env.SAFETY_ALERT_TO || '';

// ---- brand palette ----
const RED = '#C4242A';
const INK = '#161616';
const MUTE = '#6b7280';

// ---- load brand assets once at startup ----
const ASSET_DIR = path.join(__dirname, '..', 'assets');
const LOGO_PATH = path.join(ASSET_DIR, 'durante-logo.png');
const PASSED_PATH = path.join(ASSET_DIR, 'safety-passed.jpg');
let LOGO_B64 = '';
let PASSED_B64 = '';
try { LOGO_B64 = fs.readFileSync(LOGO_PATH).toString('base64'); }
catch (e) { console.warn('[safety] logo asset not found:', e.message); }
try { PASSED_B64 = fs.readFileSync(PASSED_PATH).toString('base64'); }
catch (e) { console.warn('[safety] passed image asset not found:', e.message); }

const esc = (v) => String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function fmtDur(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

const row = (label, val) => `<tr>
  <td style="padding:7px 16px 7px 0;color:${MUTE};font-size:13px;white-space:nowrap;vertical-align:top">${label}</td>
  <td style="padding:7px 0;color:${INK};font-size:13px;font-weight:bold">${val}</td></tr>`;

// Branded wrapper: logo header on top, dark footer on bottom.
function shell(inner) {
  const logo = LOGO_B64
    ? `<img src="cid:durantelogo" width="210" alt="Durante Equipment" style="display:block;margin:0 auto;max-width:210px;height:auto"/>`
    : `<div style="font-size:22px;font-weight:bold;color:${RED}">DURANTE EQUIPMENT</div>`;
  return `<div style="margin:0;padding:0;background:#f4f5f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e6e8eb;border-radius:10px;overflow:hidden">
        <tr><td style="padding:22px 28px 16px;text-align:center;border-bottom:3px solid ${RED}">${logo}</td></tr>
        ${inner}
        <tr><td style="padding:16px 28px;background:${INK};text-align:center">
          <div style="color:#c9ccd1;font-size:11px;line-height:1.6">Durante Equipment &middot; Safety Training Portal<br/>safety.duranteops.com &middot; Automated notification</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

// Generate a Certificate of Completion as a PDF buffer (pdfkit).
function buildCertPdf({ operator, moduleName, score, total, pct, dateStr, isEquip }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0 });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;   // 792
      const H = doc.page.height;  // 612

      // background + double border
      doc.rect(0, 0, W, H).fill('#ffffff');
      doc.lineWidth(3).strokeColor(RED).rect(26, 26, W - 52, H - 52).stroke();
      doc.lineWidth(1).strokeColor(RED).rect(34, 34, W - 68, H - 68).stroke();

      // logo
      if (LOGO_B64) {
        try {
          const lw = 230;
          doc.image(LOGO_PATH, (W - lw) / 2, 58, { width: lw });
        } catch (e) { /* ignore */ }
      } else {
        doc.fillColor(RED).font('Helvetica-Bold').fontSize(24).text('DURANTE EQUIPMENT', 0, 70, { align: 'center' });
      }

      let y = 172;
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(30).text('Certificate of Completion', 0, y, { align: 'center' });
      y += 46;
      doc.fillColor(MUTE).font('Helvetica').fontSize(12).text('This certifies that', 0, y, { align: 'center' });
      y += 26;
      doc.fillColor(RED).font('Helvetica-Bold').fontSize(32).text(operator, 0, y, { align: 'center' });
      y += 50;
      doc.fillColor(INK).font('Helvetica').fontSize(13).text('has successfully passed the safety certification test for', 0, y, { align: 'center' });
      y += 24;
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(moduleName, 0, y, { align: 'center' });
      y += 40;
      doc.fillColor(MUTE).font('Helvetica').fontSize(12)
        .text(`Score: ${score}/${total}  (${pct}%)   ·   Passing score 80%   ·   ${dateStr}`, 0, y, { align: 'center' });

      if (isEquip) {
        y += 20;
        doc.fillColor(MUTE).font('Helvetica-Oblique').fontSize(10)
          .text('Equipment operation also requires a hands-on practical skills evaluation.', 0, y, { align: 'center' });
      }

      // signature lines
      const sy = H - 118;
      const colW = 230;
      const leftX = W / 2 - colW - 24;
      const rightX = W / 2 + 24;
      doc.lineWidth(1).strokeColor('#9ca3af');
      doc.moveTo(leftX, sy).lineTo(leftX + colW, sy).stroke();
      doc.moveTo(rightX, sy).lineTo(rightX + colW, sy).stroke();
      doc.fillColor(MUTE).font('Helvetica').fontSize(10)
        .text('Instructor Signature', leftX, sy + 7, { width: colW, align: 'center' })
        .text('Date', rightX, sy + 7, { width: colW, align: 'center' });

      doc.fillColor(MUTE).font('Helvetica').fontSize(9)
        .text('Durante Equipment  ·  Safety Training Portal  ·  safety.duranteops.com', 0, H - 56, { align: 'center' });

      doc.end();
    } catch (e) {
      reject(e);
    }
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
    const when = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const dateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' });
    const empRow = b.employeeId ? row('Employee ID', esc(b.employeeId)) : '';
    const langRow = b.language ? row('Language', esc(b.language)) : '';

    // inline logo rides along on every email
    const attachments = [];
    if (LOGO_B64) attachments.push({ name: 'durante-logo.png', contentType: 'image/png', contentBytes: LOGO_B64, inline: true, contentId: 'durantelogo' });

    let subject, inner;

    if (type === 'start') {
      subject = `Safety Test STARTED — ${operator} — ${moduleName}`;
      inner = `<tr><td style="padding:24px 28px 6px">
          <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTE};font-weight:bold">Test Started</div>
          <div style="font-size:21px;font-weight:bold;color:${INK};margin:5px 0 3px">${operator}</div>
          <div style="font-size:14px;color:${INK}">started the <b>${moduleName}</b> certification.</div>
        </td></tr>
        <tr><td style="padding:10px 28px 26px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${row('Operator', operator)}${empRow}${row('Module', moduleName)}${langRow}${row('Started', when + ' ET')}
          </table>
        </td></tr>`;
    } else {
      const passed = !!b.passed;
      const color = passed ? '#1a7f4b' : RED;
      const bg = passed ? '#eaf6ef' : '#fdecec';
      const label = passed ? 'Passed' : 'Did not pass';
      subject = `Safety Test ${passed ? 'PASSED' : 'FAILED'} — ${operator} — ${moduleName} (${esc(b.pct)}%)`;

      let body = `<tr><td style="padding:0">
          <div style="background:${bg};border-left:5px solid ${color};padding:16px 28px">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${color};font-weight:bold">${label}</div>
            <div style="font-size:21px;font-weight:bold;color:${INK};margin-top:3px">${operator} &mdash; ${moduleName}</div>
          </div>
        </td></tr>
        <tr><td style="padding:18px 28px 6px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${row('Operator', operator)}${empRow}${row('Module', moduleName)}
            ${row('Result', `<span style="color:${color}">${passed ? 'PASS' : 'FAIL'}</span> &nbsp; ${esc(b.score)}/${esc(b.total)} (${esc(b.pct)}%)`)}
            ${row('Time reading material', fmtDur(b.studySeconds))}
            ${row('Time on the test', fmtDur(b.testSeconds))}
            ${langRow}${row('Completed', when + ' ET')}
          </table>
        </td></tr>`;

      if (passed) {
        if (PASSED_B64) {
          attachments.push({ name: 'passed.jpg', contentType: 'image/jpeg', contentBytes: PASSED_B64, inline: true, contentId: 'safetypassed' });
          body += `<tr><td style="padding:6px 28px 18px;text-align:center">
            <img src="cid:safetypassed" width="240" alt="One Goal, One Team, One Durante — Passed" style="display:block;margin:8px auto 0;max-width:240px;height:auto;border-radius:8px"/>
          </td></tr>`;
        }
        // generate + attach the certificate
        try {
          const isEquip = /forklift|aerial|heavy|driver/i.test(moduleName);
          const pdf = await buildCertPdf({
            operator, moduleName,
            score: esc(b.score), total: esc(b.total), pct: esc(b.pct),
            dateStr, isEquip,
          });
          const safeName = `Certificate - ${operator} - ${moduleName}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
          attachments.push({ name: `${safeName}.pdf`, contentType: 'application/pdf', contentBytes: pdf.toString('base64') });
          body += `<tr><td style="padding:0 28px 24px">
            <div style="background:#f4f5f7;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#374151">
              A <b>Certificate of Completion</b> for ${operator} is attached to this email as a PDF.
            </div>
          </td></tr>`;
        } catch (e) {
          console.error('[safety] cert pdf failed:', e.message);
        }
      }

      inner = body;
    }

    const html = shell(inner);
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
