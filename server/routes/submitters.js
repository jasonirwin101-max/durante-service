const express = require('express');
const sheets = require('../services/sheets');

const router = express.Router();

// GET /api/submitters — public list of names that appear in the submit form's
// "Your Name" dropdown. Driven entirely by the Techs sheet: a row appears
// here iff Active = TRUE AND Show_In_Submit = TRUE. No auth: the submit form
// itself is public.
router.get('/', async (_req, res) => {
  try {
    const all = await sheets.getAllTechs();
    const rows = all
      .filter(t => t.Active === 'TRUE' && t.Show_In_Submit === 'TRUE')
      .map(t => ({ name: t.Full_Name, phone: t.Phone || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[SUBMITTERS] returning ${rows.length} active submitters`);
    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (err) {
    console.error('[SUBMITTERS] error:', err.message);
    res.status(500).json({ error: 'Failed to load submitters' });
  }
});

module.exports = router;
