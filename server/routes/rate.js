const express = require('express');
const fs = require('fs');
const path = require('path');
const sheets = require('../services/sheets');
const { sendEmail } = require('../services/outlook');

const router = express.Router();

const RATING_RECIPIENTS = [
  'jirwin@duranteequip.com',
  'servicerequest@duranteequip.com',
];

async function findRatingToken(srId, token) {
  const history = await sheets.getStatusHistoryBySrId(srId);
  for (const entry of history) {
    if (!entry.Notes) continue;
    const match = entry.Notes.match(/RATING_TOKEN:([a-f0-9]+)/);
    if (match && match[1] === token) {
      const sr = await sheets.getServiceRequestById(srId);
      const used = sr && sr.Satisfaction_Rating && sr.Satisfaction_Rating !== '';
      return { valid: true, used };
    }
  }
  return null;
}

function buildStars(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function sendRatingEmail(sr, rating, comments) {
  try {
    const templatePath = path.join(__dirname, '..', 'templates', 'emails', 'rating_received.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    const ratedOn = new Date().toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York',
    });

    const commentsRow = comments
      ? `<tr><td style="padding:8px 12px;background:#f9f9f9;font-weight:bold;">Comments</td><td style="padding:8px 12px;background:#f9f9f9;">${comments}</td></tr>`
      : '';

    const vars = {
      '{{SR_ID}}': sr.SR_ID,
      '{{COMPANY_NAME}}': sr.Company_Name,
      '{{CONTACT_NAME}}': sr.Contact_Name,
      '{{EQUIPMENT}}': sr.Equipment_Description,
      '{{TECH_NAME}}': sr.Assigned_Tech || 'N/A',
      '{{RATING}}': String(rating),
      '{{STARS}}': buildStars(rating),
      '{{RATED_ON}}': ratedOn,
      '{{COMMENTS_ROW}}': commentsRow,
    };

    for (const [key, value] of Object.entries(vars)) {
      html = html.split(key).join(value);
    }

    const subject = `Customer Rating Received — ${sr.SR_ID} — ${rating}/5 Stars`;

    for (const email of RATING_RECIPIENTS) {
      sendEmail(email, subject, html).catch(err =>
        console.error(`[Rating] Email to ${email} failed:`, err.message)
      );
    }

    console.log(`[Rating] Notification sent for ${sr.SR_ID}: ${rating}/5`);
  } catch (err) {
    console.error('[Rating] Email build failed:', err.message);
  }
}

// GET /api/rate/:id/:token
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

// POST /api/rate/:id/:token
router.post('/:id/:token', async (req, res) => {
  try {
    const { id, token } = req.params;
    const { rating, comments } = req.body;

    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
    }

    const sr = await sheets.getServiceRequestById(id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const tokenResult = await findRatingToken(id, token);
    if (!tokenResult) return res.status(403).json({ error: 'Invalid rating link' });
    if (tokenResult.used) return res.status(410).json({ error: 'Rating already submitted', alreadyRated: true });

    const now = new Date().toISOString();
    const cleanComments = comments ? String(comments).substring(0, 500).trim() : '';

    // Write rating, timestamp, and comments to sheet
    await sheets.updateServiceRequestFields(id, {
      Satisfaction_Rating: String(rating),
      Rating_Submitted_At: now,
      Rating_Comments: cleanComments,
    });

    console.log(`[Rating] SR: ${id} Rating: ${rating}/5 from: ${sr.Company_Name}${cleanComments ? ' Comment: ' + cleanComments.substring(0, 50) : ''}`);

    // Send email notification
    sendRatingEmail(sr, rating, cleanComments);

    res.json({ message: 'Thank you for your feedback!', rating });
  } catch (err) {
    console.error('Submit rating error:', err);
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

module.exports = router;
