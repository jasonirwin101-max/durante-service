const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
      // Try Google Drive upload
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
      } catch (driveErr) {
        // Drive failed — store a placeholder with file metadata
        console.error(`[Upload] Drive failed for ${file.originalname}:`, driveErr.message);
        urls.push(`photo-attached:${file.originalname}|${file.mimetype}|${file.size}`);
      }
    }

    res.json({ urls });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

module.exports = router;
