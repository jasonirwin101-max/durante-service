const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');

const router = express.Router();
// Limit 5MB per file to keep base64 within Sheets cell limits
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

let driveClient = null;

function getDrive() {
  if (driveClient) return driveClient;

  const impersonateEmail = process.env.GOOGLE_DRIVE_IMPERSONATE;
  if (impersonateEmail) {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      subject: impersonateEmail,
    });
    driveClient = google.drive({ version: 'v3', auth });
  } else {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    driveClient = google.drive({ version: 'v3', auth });
  }

  return driveClient;
}

// POST /api/upload — upload up to 4 photos, returns array of URLs
router.post('/', upload.array('photos', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const urls = [];

    for (const file of req.files) {
      let saved = false;

      // Try Google Drive first
      try {
        const drive = getDrive();
        const response = await drive.files.create({
          requestBody: {
            name: `SR-photo-${Date.now()}-${file.originalname}`,
            mimeType: file.mimetype,
          },
          media: {
            mimeType: file.mimetype,
            body: Readable.from(file.buffer),
          },
          fields: 'id,webViewLink',
        });

        await drive.permissions.create({
          fileId: response.data.id,
          requestBody: { role: 'reader', type: 'anyone' },
        });

        urls.push(response.data.webViewLink);
        saved = true;
        console.log(`[Upload] Saved to Drive: ${file.originalname}`);
      } catch (driveErr) {
        console.error(`[Upload] Drive failed for ${file.originalname}:`, driveErr.message);
      }

      // Fallback: base64 data URL (viewable in <img> tags)
      if (!saved) {
        const b64 = file.buffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${b64}`;
        urls.push(dataUrl);
        console.log(`[Upload] Stored as base64: ${file.originalname} (${dataUrl.length} chars)`);
      }
    }

    res.json({ urls });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

// GET /api/upload/photo/:srId/:num — serve photo from sheet data
router.get('/photo/:srId/:num', async (req, res) => {
  try {
    const sheets = require('../services/sheets');
    const sr = await sheets.getServiceRequestById(req.params.srId);
    if (!sr) return res.status(404).json({ error: 'SR not found' });

    const photoField = `Photo_${req.params.num}`;
    const photoData = sr[photoField];
    if (!photoData) return res.status(404).json({ error: 'No photo' });

    // If it's a data URL, serve the binary
    if (photoData.startsWith('data:')) {
      const match = photoData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const buffer = Buffer.from(match[2], 'base64');
        res.set('Content-Type', match[1]);
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    // If it's a URL, redirect
    if (photoData.startsWith('http')) {
      return res.redirect(photoData);
    }

    res.status(404).json({ error: 'Photo not accessible' });
  } catch (err) {
    console.error('[Upload] Photo serve error:', err.message);
    res.status(500).json({ error: 'Failed to serve photo' });
  }
});

module.exports = router;
