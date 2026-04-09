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
app.use(cors());
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
