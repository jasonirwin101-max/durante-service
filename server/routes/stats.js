const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const sheets = require('../services/sheets');

const router = express.Router();

router.use(authMiddleware);

// GET /api/stats — KPI counts for the office dashboard
router.get('/', async (req, res) => {
  try {
    const [active, completed] = await Promise.all([
      sheets.getAllServiceRequests(),
      sheets.getAllCompletedRequests(),
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    const inMonth = (iso) => {
      const t = new Date(iso || 0).getTime();
      return Number.isFinite(t) && t >= startOfMonth;
    };
    const inYear = (iso) => {
      const t = new Date(iso || 0).getTime();
      return Number.isFinite(t) && t >= startOfYear;
    };

    const all = [...active, ...completed];
    const srMTD = all.filter(sr => inMonth(sr.Submitted_On)).length;
    const srYTD = all.filter(sr => inYear(sr.Submitted_On)).length;
    const openMTD = active.filter(sr => inMonth(sr.Submitted_On)).length;
    const completedMTD = completed.filter(sr => inMonth(sr.Status_Updated_At)).length;

    res.set('Cache-Control', 'no-store');
    res.json({ srMTD, srYTD, openMTD, completedMTD });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

module.exports = router;
