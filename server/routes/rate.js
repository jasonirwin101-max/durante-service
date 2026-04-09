const express = require('express');
const sheets = require('../services/sheets');

const router = express.Router();

/**
 * Extract and validate a rating token from StatusHistory.
 * Returns { valid, used } or null if not found.
 */
async function findRatingToken(srId, token) {
  const history = await sheets.getStatusHistoryBySrId(srId);

  for (const entry of history) {
    if (!entry.Notes) continue;
    const match = entry.Notes.match(/RATING_TOKEN:([a-f0-9]+)/);
    if (match && match[1] === token) {
      // Check if rating already submitted
      const sr = await sheets.getServiceRequestById(srId);
      const used = sr && sr.Satisfaction_Rating && sr.Satisfaction_Rating !== '';
      return { valid: true, used };
    }
  }
  return null;
}

// GET /api/rate/:id/:token — validate token and return SR summary
router.get('/:id/:token', async (req, res) => {
  try {
    const { id, token } = req.params;

    const sr = await sheets.getServiceRequestById(id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const tokenResult = await findRatingToken(id, token);
    if (!tokenResult) return res.status(403).json({ error: 'Invalid rating link' });
    if (tokenResult.used) return res.status(410).json({ error: 'Rating already submitted', alreadyRated: true });

    res.json({
      srId: sr.SR_ID,
      companyName: sr.Company_Name,
      equipmentDescription: sr.Equipment_Description,
      contactName: sr.Contact_Name,
      techName: sr.Assigned_Tech ? sr.Assigned_Tech.split(' ')[0] : '',
    });
  } catch (err) {
    console.error('Get rating error:', err);
    res.status(500).json({ error: 'Failed to load rating page' });
  }
});

// POST /api/rate/:id/:token — submit rating 1-5
router.post('/:id/:token', async (req, res) => {
  try {
    const { id, token } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
    }

    const sr = await sheets.getServiceRequestById(id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const tokenResult = await findRatingToken(id, token);
    if (!tokenResult) return res.status(403).json({ error: 'Invalid rating link' });
    if (tokenResult.used) return res.status(410).json({ error: 'Rating already submitted', alreadyRated: true });

    // Write rating to sheet
    await sheets.updateServiceRequestField(id, 'Satisfaction_Rating', String(rating));

    console.log(`Rating ${rating}/5 saved for ${id}`);
    res.json({ message: 'Thank you for your feedback!', rating });
  } catch (err) {
    console.error('Submit rating error:', err);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

module.exports = router;
