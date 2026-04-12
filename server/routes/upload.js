const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `photo-${unique}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

// POST /api/upload — save up to 4 photos to disk, return public URLs
router.post('/', upload.array('photos', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    let baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    // Ensure https:// prefix
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
    const urls = req.files.map(file => {
      const publicUrl = `${baseUrl}/uploads/${file.filename}`;
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
