const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { isValidStatus, canRoleSetStatus, STATUSES } = require('../utils/statusFlow');
const sheets = require('../services/sheets');
const { fireNotifications } = require('../services/notifications');

const router = express.Router();

// All routes below require authentication
router.use(authMiddleware);

// GET /api/requests — get all service requests (filtered by role)
router.get('/', async (req, res) => {
  try {
    const all = await sheets.getAllServiceRequests();
    const { role, name } = req.user;

    let results;
    if (role === 'Office') {
      results = all;
    } else {
      // Techs see only their assigned SRs
      results = all.filter(sr => sr.Assigned_Tech === name);
    }

    // Optional query filters
    const { status, tech, company } = req.query;
    if (status) results = results.filter(sr => sr.Current_Status === status);
    if (tech) results = results.filter(sr => sr.Assigned_Tech === tech);
    if (company) results = results.filter(sr =>
      sr.Company_Name.toLowerCase().includes(company.toLowerCase())
    );

    res.json(results);
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Failed to fetch service requests' });
  }
});

// GET /api/requests/:id — get single SR with history
router.get('/:id', async (req, res) => {
  try {
    const sr = await sheets.getServiceRequestById(req.params.id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const history = await sheets.getStatusHistoryBySrId(req.params.id);

    res.json({ ...sr, statusHistory: history });
  } catch (err) {
    console.error('Get request error:', err);
    res.status(500).json({ error: 'Failed to fetch service request' });
  }
});

// PATCH /api/requests/:id/status — update status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, notes, eta, scheduledDate, unitNumber } = req.body;
    const { role, name } = req.user;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if (!isValidStatus(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    if (!canRoleSetStatus(role, status)) {
      return res.status(403).json({ error: `Role ${role} cannot set status to ${status}` });
    }

    // Check SR exists
    const sr = await sheets.getServiceRequestById(req.params.id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const now = new Date().toISOString();

    // Build updates
    const updates = {
      Current_Status: status,
      Status_Updated_At: now,
      Status_Updated_By: name,
    };

    if (eta) updates.ETA = eta;
    if (scheduledDate) updates.Scheduled_Date = scheduledDate;
    if (unitNumber) updates.Unit_Number = unitNumber;
    if (notes) updates.Tech_Notes = sr.Tech_Notes ? `${sr.Tech_Notes}\n[${now}] ${notes}` : `[${now}] ${notes}`;

    if (status === STATUSES.COMPLETE) {
      updates.Service_Completed = 'TRUE';
    }

    // Update ServiceRequests sheet
    await sheets.updateServiceRequestFields(req.params.id, updates);

    // Re-read the SR with updated fields for notification templates
    const updatedSr = await sheets.getServiceRequestById(req.params.id);

    // Fire notifications
    const notifyResult = await fireNotifications(updatedSr, status);

    // Build notes with rating token if COMPLETE
    let historyNotes = notes || '';
    if (notifyResult.ratingToken) {
      historyNotes = historyNotes
        ? `${historyNotes} | RATING_TOKEN:${notifyResult.ratingToken}`
        : `RATING_TOKEN:${notifyResult.ratingToken}`;
    }

    // Append to StatusHistory with notification results
    await sheets.appendStatusHistory({
      SR_ID: req.params.id,
      Status: status,
      Notes: historyNotes,
      Updated_By: name,
      Role: role,
      Timestamp: now,
      Customer_Notified: notifyResult.customerNotified ? 'TRUE' : 'FALSE',
      Submitter_Notified: notifyResult.submitterNotified ? 'TRUE' : 'FALSE',
      SMS_Sent: notifyResult.smsSent ? 'TRUE' : 'FALSE',
      Email_Sent: notifyResult.emailSent ? 'TRUE' : 'FALSE',
    });

    res.json({
      message: `Status updated to ${status}`,
      srId: req.params.id,
      status,
      updatedAt: now,
      notifications: notifyResult,
    });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/requests/:id — update other fields (office only)
router.patch('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'Office') {
      return res.status(403).json({ error: 'Only office staff can update SR fields' });
    }

    const sr = await sheets.getServiceRequestById(req.params.id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const allowedFields = [
      'Assigned_Tech', 'ETA', 'Scheduled_Date', 'Internal_Notes',
      'Operator_Issue', 'Customer_Charged', 'Amount_Charged',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await sheets.updateServiceRequestFields(req.params.id, updates);
    res.json({ message: 'Service request updated', srId: req.params.id, updates });
  } catch (err) {
    console.error('Update SR error:', err);
    res.status(500).json({ error: 'Failed to update service request' });
  }
});

module.exports = router;
