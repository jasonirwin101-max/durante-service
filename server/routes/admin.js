const express = require('express');
const { runDailyDigest } = require('../cron/digest');
const { runEscalation15MinCheck } = require('../cron/escalation15min');
const { runEscalationCheck } = require('../cron/escalation');

const router = express.Router();

// Shared-secret gate. Hard-coded here (not env-var) only because the user
// asked for a fixed key; rotate by editing this file. Constant-time compare
// to avoid trivial timing leaks on the secret length.
const ADMIN_KEY = 'Durante101';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireAdminKey(req, res, next) {
  const provided = req.query.key || req.get('X-Admin-Key') || '';
  if (!timingSafeEqual(String(provided), ADMIN_KEY)) {
    console.warn(`[ADMIN] Unauthorized ${req.path} from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireAdminKey);

// GET /api/admin/trigger-daily-digest?key=Durante101
// Fires the same code path the 7 AM ET weekday cron uses. Use this to verify
// the digest renders + delivers before the next scheduled run.
router.get('/trigger-daily-digest', async (req, res) => {
  console.log(`[ADMIN] Manual daily digest trigger from ${req.ip}`);
  try {
    await runDailyDigest();
    res.json({ ok: true, message: 'Daily digest triggered — check service@duranteequip.com inbox' });
  } catch (err) {
    console.error('[ADMIN] trigger-daily-digest failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bonus: same pattern for the other two crons so you can dry-run them too.
router.get('/trigger-escalation-15min', async (req, res) => {
  console.log(`[ADMIN] Manual 15-min escalation trigger from ${req.ip}`);
  try {
    await runEscalation15MinCheck();
    res.json({ ok: true, message: '15-min escalation check triggered' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/trigger-escalation-3day', async (req, res) => {
  console.log(`[ADMIN] Manual 3-day escalation trigger from ${req.ip}`);
  try {
    await runEscalationCheck();
    res.json({ ok: true, message: '3-day escalation check triggered' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
