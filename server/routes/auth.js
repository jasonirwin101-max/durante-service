const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getAllTechs } = require('../services/sheets');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { name, pin } = req.body;

    if (!name || !pin) {
      return res.status(400).json({ error: 'Name and PIN are required' });
    }

    const techs = await getAllTechs();
    const tech = techs.find(
      t => t.Full_Name.toLowerCase() === name.toLowerCase() && t.Active === 'TRUE'
    );

    if (!tech) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const pinMatch = await bcrypt.compare(String(pin), tech.PIN);
    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        techId: tech.Tech_ID,
        name: tech.Full_Name,
        role: tech.Role,
        email: tech.Email,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        techId: tech.Tech_ID,
        name: tech.Full_Name,
        role: tech.Role,
        email: tech.Email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/techs — returns list of active tech names for login dropdown
router.get('/techs', async (req, res) => {
  try {
    console.log('[TECHS] Fetching techs from sheet...');
    const techs = await getAllTechs();
    const active = techs
      .filter(t => t.Active === 'TRUE')
      .map(t => ({ name: t.Full_Name, role: t.Role }));
    console.log('[TECHS] Found:', active.length, 'active techs');
    res.json(active);
  } catch (err) {
    console.error('Fetch techs error:', err);
    res.status(500).json({ error: 'Failed to fetch techs' });
  }
});

module.exports = router;
