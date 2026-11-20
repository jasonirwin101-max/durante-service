const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getAllTechs, getRows, batchUpdateCells, columnToLetter } = require('../services/sheets');
const people = require('../services/people');

// Keep a hashed copy of the People PIN on the Techs tab, so logins (here and
// in Driver Photos) still work if the People service is down.
function savePinCopy(tech, pin) {
  (async () => {
    const rows = await getRows('Techs');
    const header = (rows[0] || []).map((h) => String(h || '').trim());
    const pinCol = header.indexOf('PIN');
    const idCol = header.indexOf('Tech_ID');
    const i = rows.findIndex((r, n) => n > 0 && String(r[idCol] || '') === String(tech.Tech_ID));
    if (pinCol < 0 || idCol < 0 || i < 1) return;
    if (rows[i][pinCol] && (await bcrypt.compare(pin, rows[i][pinCol]))) return;
    await batchUpdateCells('Techs', [{ range: `${columnToLetter(pinCol)}${i + 1}`, value: await bcrypt.hash(pin, 10) }]);
  })().catch((e) => console.error('[people] PIN copy not saved:', e.message));
}

const router = express.Router();

// Per-app gate. Login is a shared endpoint; the client passes `app` to say
// which surface it's logging into. Returns { allowed, error } — caller sends
// 403 with `error` when allowed is false. Existing issued JWTs are never
// re-checked against this gate, so live sessions are not disrupted by a
// policy change in the sheet.
function gateForApp(app, user) {
  if (app === 'dashboard') {
    const isManager = user.Role === 'Manager';
    const hasOverride = user.Dashboard_Access === 'TRUE';
    if (!isManager && !hasOverride) {
      return {
        allowed: false,
        error: 'Access denied. This account does not have office dashboard access. Contact your administrator.',
      };
    }
    return { allowed: true };
  }
  if (app === 'tech') {
    const allowedRoles = ['Tech', 'Manager'];
    if (!allowedRoles.includes(user.Role)) {
      return {
        allowed: false,
        error: 'Access denied. This account does not have tech portal access. Contact your administrator.',
      };
    }
    return { allowed: true };
  }
  // Unknown / missing app — preserve legacy behavior (no app-level gate).
  // Clients that don't yet send `app` keep working until they're updated.
  return { allowed: true };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { name, pin, app } = req.body;

    if (!name || !pin) {
      return res.status(400).json({ error: 'Name and PIN are required' });
    }

    const techs = await getAllTechs();
    const tech = techs.find(
      t => t.Full_Name.toLowerCase() === name.toLowerCase() && t.Active === 'TRUE'
    );

    if (!tech) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // People page PIN first; their old Techs-tab PIN until they have one.
    const check = await people.checkPersonPin(String(pin), tech.Email, () =>
      tech.PIN ? bcrypt.compare(String(pin), tech.PIN) : false
    );
    if (!check.ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (check.viaPeople) savePinCopy(tech, String(pin));

    const gate = gateForApp(app, tech);
    if (!gate.allowed) {
      const label = app === 'dashboard' ? 'Dashboard' : 'Tech app';
      console.log(`[AUTH] ${label} login denied for ${tech.Full_Name} (role=${tech.Role})`);
      return res.status(403).json({ error: gate.error });
    }

    const token = jwt.sign(
      {
        techId: tech.Tech_ID,
        name: tech.Full_Name,
        role: tech.Role,
        email: tech.Email,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        techId: tech.Tech_ID,
        name: tech.Full_Name,
        role: tech.Role,
        email: tech.Email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/techs — returns active tech names for the login dropdown.
// Optional ?app=dashboard|tech narrows the list to users that gateForApp()
// would allow, so each app's dropdown matches the server-side gate. Without
// the query param the legacy "all active" behavior is preserved.
router.get('/techs', async (req, res) => {
  try {
    const { app } = req.query;
    console.log(`[TECHS] Fetching techs from sheet (app=${app || 'none'})...`);
    const techs = await getAllTechs();
    const filtered = techs
      .filter(t => t.Active === 'TRUE')
      .filter(t => gateForApp(app, t).allowed)
      .map(t => ({ name: t.Full_Name, role: t.Role }));
    console.log('[TECHS] Found:', filtered.length, 'active techs');
    res.json(filtered);
  } catch (err) {
    console.error('Fetch techs error:', err);
    res.status(500).json({ error: 'Failed to fetch techs' });
  }
});

module.exports = router;
