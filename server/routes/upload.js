const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

let driveClient = null;

function getDrive() {
  if (driveClient) return driveClient;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

// POST /api/upload — upload up to 4 photos, returns array of Drive URLs
router.post('/', upload.array('photos', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const drive = getDrive();
    const urls = [];

    for (const file of req.files) {
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

      // Make the file viewable by anyone with the link
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
      });

      urls.push(response.data.webViewLink);
    }

    res.json({ urls });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

module.exports = router;
