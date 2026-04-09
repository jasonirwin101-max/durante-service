const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const sheets = require('../services/sheets');
const { sendSMS } = require('../services/ringcentral');

const router = express.Router();

router.use(authMiddleware);

// POST /api/techs — add a new tech (Office only)
router.post('/', requireRole('Office'), async (req, res) => {
  try {
    const { fullName, email, phone, role } = req.body;

    if (!fullName || !email || !phone || !role) {
      return res.status(400).json({ error: 'Full name, email, phone, and role are required' });
    }

    if (!['Tech', 'Office'].includes(role)) {
      return res.status(400).json({ error: 'Role must be Tech or Office' });
    }

    // Check for duplicate name
    const existing = await sheets.getTechByName(fullName);
    if (existing) {
      return res.status(409).json({ error: 'A tech with that name already exists' });
    }

    // Generate a random 4-digit PIN
    const rawPin = String(Math.floor(1000 + Math.random() * 9000));
    const hashedPin = await bcrypt.hash(rawPin, 10);

    // Generate Tech_ID
    const allTechs = await sheets.getAllTechs();
    const maxId = allTechs.reduce((max, t) => {
      const num = parseInt(t.Tech_ID.replace('TECH-', ''), 10);
      return num > max ? num : max;
    }, 0);
    const techId = `TECH-${String(maxId + 1).padStart(3, '0')}`;

    await sheets.appendTech({
      Tech_ID: techId,
      Full_Name: fullName.trim(),
      Email: email.trim().toLowerCase(),
      Phone: phone.trim(),
      PIN: hashedPin,
      Role: role,
      Active: 'TRUE',
      Created_At: new Date().toISOString(),
    });

    // SMS the PIN to the new tech
    const smsResult = await sendSMS(phone, `Welcome to Durante Equipment service system. Your login PIN is: ${rawPin}. Do not share this PIN.`);

    res.status(201).json({
      message: `Tech ${fullName} added`,
      techId,
      pinSent: !!smsResult,
    });
  } catch (err) {
    console.error('Add tech error:', err);
    res.status(500).json({ error: 'Failed to add tech' });
  }
});

module.exports = router;
