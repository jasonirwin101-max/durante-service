// =====================================================================
// safety-poster.js — renders the Durante "You Passed" certificate poster.
// Keeps the designed poster as a fixed background and draws only the
// per-person data on top (name, module sentence, big %, PASS, result table)
// with an SVG overlay composited by sharp. Fonts are bundled and registered
// with fontconfig so text renders the same on any host (Railway ships none).
// Returns a JPEG buffer sized for email.
// =====================================================================
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const BASE = path.join(ASSETS, 'safety-poster-base.png');

// --- fontconfig: point librsvg at our bundled Poppins with a writable cache ---
try {
  const cacheDir = path.join(os.tmpdir(), 'durante-safety-fontcache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const confPath = path.join(os.tmpdir(), 'durante-safety-fonts.conf');
  fs.writeFileSync(
    confPath,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${ASSETS}</dir><cachedir>${cacheDir}</cachedir></fontconfig>`
  );
  if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = confPath;
} catch (e) {
  console.warn('[safety-poster] fontconfig setup:', e.message);
}

const W = 1024, H = 1536;
const NUMGREEN = '#047d34';
const LABELV = '#20242a';
const INK = '#141414';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const charW = (ch, size, bold) => (ch === ' ' ? size * 0.28 : size * (bold ? 0.57 : 0.52));
const textW = (str, size, bold) => { let w = 0; for (const c of String(str)) w += charW(c, size, bold); return w; };
const spaceW = (size) => size * 0.28;
function fitSize(str, maxW, start, min, bold) { let s = start; while (s > min && textW(str, s, bold) > maxW) s -= 1; return s; }

function wrap(tokens, size, maxW) {
  const words = [];
  for (const tok of tokens) for (const p of tok.t.split(/\s+/)) if (p.length) words.push({ t: p, bold: tok.bold });
  const lines = []; let cur = [], curw = 0;
  for (const wd of words) {
    const ww = textW(wd.t, size, wd.bold);
    const add = (cur.length ? spaceW(size) : 0) + ww;
    if (curw + add > maxW && cur.length) { lines.push(cur); cur = [wd]; curw = ww; }
    else { cur.push(wd); curw += add; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
function lineSVG(line, x, y, size) {
  let out = `<text x="${x}" y="${y}" xml:space="preserve" font-family="Poppins" font-size="${size}" fill="${INK}">`;
  line.forEach((w, i) => { out += `<tspan font-weight="${w.bold ? 700 : 400}">${(i ? ' ' : '') + esc(w.t)}</tspan>`; });
  return out + '</text>';
}

function buildSVG(d) {
  const rows = [
    ['Employee', d.operator], ['Employee ID', d.employeeId], ['Training Module', d.module],
    ['Score', d.scoreText], ['Language', d.language], ['Completed', d.completed],
  ];
  const centers = [839, 874, 910, 949, 987, 1024];
  const rowfill = (i) => (i % 2 === 0 ? '#f1f1f1' : '#ffffff');

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;

  // NAME
  s += `<rect x="36" y="372" width="398" height="78" fill="#ffffff"/>`;
  const nameSize = fitSize(d.operator + '!', 392, 64, 26, true);
  s += `<text x="40" y="432" font-family="Poppins" font-weight="700" font-size="${nameSize}" fill="${INK}">${esc(d.operator)}!</text>`;

  // BODY sentence
  s += `<rect x="36" y="466" width="400" height="110" fill="#ffffff"/>`;
  const bodyTokens = [
    { t: 'You have successfully completed the', bold: false },
    { t: d.module, bold: true },
    { t: 'Safety Knowledge Assessment.', bold: false },
  ];
  let bodySize = 25, blines = wrap(bodyTokens, bodySize, 392);
  while (blines.length > 3 && bodySize > 18) { bodySize -= 1; blines = wrap(bodyTokens, bodySize, 392); }
  const bodyLH = Math.round(bodySize * 1.22);
  let by = 490 + (3 - Math.min(blines.length, 3)) * 4;
  for (const ln of blines.slice(0, 3)) { s += lineSVG(ln, 40, by, bodySize); by += bodyLH; }

  // BIG % (cover spans the gap under the header to the gap above PASS so the
  // original number never ghosts through)
  s += `<rect x="38" y="646" width="304" height="120" fill="#ffffff"/>`;
  s += `<text x="52" y="742" font-family="Poppins" font-weight="900" font-size="120" fill="${NUMGREEN}">${esc(d.pct)}%</text>`;

  // PASS
  s += `<rect x="150" y="768" width="190" height="60" fill="#ffffff"/>`;
  s += `<text x="240" y="816" font-family="Poppins" font-weight="900" font-size="50" fill="${NUMGREEN}" text-anchor="middle">PASS</text>`;

  // TABLE values
  rows.forEach((r, i) => {
    const cy = centers[i];
    const vsize = fitSize(String(r[1]), 232, 24, 14, false);
    s += `<rect x="228" y="${cy - 18}" width="238" height="36" fill="${rowfill(i)}"/>`;
    s += `<text x="232" y="${cy + 8}" font-family="Poppins" font-weight="600" font-size="${vsize}" fill="${LABELV}">${esc(r[1])}</text>`;
  });

  s += `</svg>`;
  return s;
}

/**
 * Render the pass poster as a JPEG buffer.
 * @param {Object} d - { operator, employeeId, module, scoreText, language, completed, pct }
 * @returns {Promise<Buffer>}
 */
async function renderPassPoster(d) {
  const svg = buildSVG(d);
  return sharp(BASE)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

module.exports = { renderPassPoster };
