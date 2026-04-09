const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const sheets = require('../services/sheets');
const { fireNotifications } = require('../services/notifications');

const router = express.Router();

router.use(authMiddleware);

// POST /api/notify/:id — re-send current status notifications
router.post('/:id', requireRole('Office'), async (req, res) => {
  try {
    const sr = await sheets.getServiceRequestById(req.params.id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const result = await fireNotifications(sr, sr.Current_Status);

    await sheets.appendStatusHistory({
      SR_ID: req.params.id,
      Status: sr.Current_Status,
      Notes: 'Manual notification re-send',
      Updated_By: req.user.name,
      Role: 'Office',
      Timestamp: new Date().toISOString(),
      Customer_Notified: result.customerNotified ? 'TRUE' : 'FALSE',
      Submitter_Notified: result.submitterNotified ? 'TRUE' : 'FALSE',
      SMS_Sent: result.smsSent ? 'TRUE' : 'FALSE',
      Email_Sent: result.emailSent ? 'TRUE' : 'FALSE',
    });

    res.json({ message: 'Notifications re-sent', notifications: result });
  } catch (err) {
    console.error('Re-send notification error:', err);
    res.status(500).json({ error: 'Failed to re-send notifications' });
  }
});

module.exports = router;
