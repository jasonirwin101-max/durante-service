const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Only real photo types. The saved extension is derived from the detected
// MIME type — never from the user-supplied filename — so nobody can upload
// an .html/.svg/.js and have it served back as an executable page from our
// domain. SVG is deliberately excluded (it can carry scripts).
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const ext = MIME_EXT[file.mimetype] || '.jpg';
    cb(null, `photo-${unique}${ext}`);
  },
});

function imageOnly(req, file, cb) {
  if (MIME_EXT[file.mimetype]) return cb(null, true);
  cb(new Error('Only image files (JPG, PNG, WEBP, GIF, HEIC) are allowed.'));
}

const upload = multer({
  storage,
  fileFilter: imageOnly,
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
});

const router = express.Router();

// POST /api/upload — save up to 4 photos to disk, return public URLs.
// The multer middleware is wrapped so a rejected file (wrong type / too big)
// returns a clean 400 instead of falling through to the 500 handler.
const uploadPhotos = upload.array('photos', 4);
router.post('/', (req, res, next) => {
  uploadPhotos(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload rejected' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Use RAILWAY_PUBLIC_DOMAIN or UPLOAD_BASE_URL for file URLs — NOT BASE_URL
    // (BASE_URL points to the Netlify track site for tracking links)
    const host = process.env.UPLOAD_BASE_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
      || `http://localhost:${process.env.PORT || 3001}`;
    const urls = req.files.map(file => {
      const publicUrl = `${host}/uploads/${file.filename}`;
      console.log(`[Upload] Saved: ${file.originalname} → ${publicUrl} (${file.size} bytes)`);
      return publicUrl;
    });

    res.json({ urls });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

module.exports = router;
