// Load .env in development; Railway injects env vars directly in production
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: false });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const submitRoutes = require('./routes/submit');
const serviceRequestRoutes = require('./routes/serviceRequests');
const trackRoutes = require('./routes/track');
const authRoutes = require('./routes/auth');
const notifyRoutes = require('./routes/notifications');
const techRoutes = require('./routes/techs');
const uploadRoutes = require('./routes/upload');
const rateRoutes = require('./routes/rate');
const { startEscalationCron } = require('./cron/escalation');
const { startDigestCron } = require('./cron/digest');

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting for public endpoints (60 req/min per IP)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a minute.' },
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Temporary debug endpoint — remove after fixing Railway
app.get('/api/debug-env', async (req, res) => {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  const parsed = key.replace(/\\n/g, '\n');
  let sheetsTest = 'not tested';
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: parsed,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'ServiceRequests!A1:A2',
    });
    sheetsTest = 'OK — rows: ' + (r.data.values ? r.data.values.length : 0);
  } catch (e) {
    sheetsTest = 'FAILED: ' + e.message;
  }
  res.json({
    keyLength: key.length,
    keyStart: key.substring(0, 32),
    keyEnd: key.substring(key.length - 32),
    parsedKeyStart: parsed.substring(0, 32),
    hasLiteralBackslashN: key.includes('\\n'),
    hasRealNewlines: key.includes('\n'),
    sheetsTest,
  });
});

// Routes
app.use('/api/submit', submitRoutes);
app.use('/api/requests', serviceRequestRoutes);
app.use('/api/track', publicLimiter, trackRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notify', notifyRoutes);
app.use('/api/techs', techRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/rate', publicLimiter, rateRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Durante Service API running on port ${PORT}`);

  // Start cron jobs
  startEscalationCron();
  startDigestCron();
});
