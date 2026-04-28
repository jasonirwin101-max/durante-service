const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { isValidStatus, canRoleSetStatus, STATUSES } = require('../utils/statusFlow');
const sheets = require('../services/sheets');
const { fireNotifications } = require('../services/notifications');
const { processNotes } = require('../services/translate');

const router = express.Router();

// All routes below require authentication
router.use(authMiddleware);

// GET /api/requests — get all service requests (filtered by role)
router.get('/', async (req, res) => {
  try {
    const all = await sheets.getAllServiceRequests();
    const { role, name } = req.user;

    let results;
    if (role === 'Manager' || role === 'Sales') {
      results = all;
    } else if (role === 'Tech') {
      results = all.filter(sr => sr.Assigned_Tech === name);
    } else {
      results = [];
    }

    // Optional query filters
    const { status, tech, company } = req.query;
    if (status) results = results.filter(sr => sr.Current_Status === status);
    if (tech) results = results.filter(sr => sr.Assigned_Tech === tech);
    if (company) results = results.filter(sr =>
      sr.Company_Name.toLowerCase().includes(company.toLowerCase())
    );

    console.log(`[REQUESTS] role=${role} name=${name} total=${all.length} returned=${results.length}`);
    res.set('Cache-Control', 'no-store');
    res.json(results);
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Failed to fetch service requests' });
  }
});

// GET /api/requests/completed — list archived completed SRs
router.get('/completed', async (req, res) => {
  try {
    const all = await sheets.getAllCompletedRequests();
    const { role, name } = req.user;

    let results;
    if (role === 'Manager' || role === 'Sales') {
      results = all;
    } else if (role === 'Tech') {
      results = all.filter(sr => sr.Assigned_Tech === name);
    } else {
      results = [];
    }

    console.log(`[COMPLETED] role=${role} name=${name} total=${all.length} returned=${results.length}`);
    res.set('Cache-Control', 'no-store');
    res.json(results);
  } catch (err) {
    console.error('Get completed error:', err);
    res.status(500).json({ error: 'Failed to fetch completed requests' });
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

    if (eta) {
      console.log(`[ETA DEBUG] Saving ETA: "${eta}" (type: ${typeof eta})`);
      updates.ETA = eta;
    }
    if (scheduledDate) updates.Scheduled_Date = scheduledDate;
    if (unitNumber) updates.Unit_Number = unitNumber;

    // Process notes — translate Spanish to English if detected
    if (notes) {
      const translated = await processNotes(notes);
      updates.Tech_Notes = sr.Tech_Notes ? `${sr.Tech_Notes}\n${translated.text}` : translated.text;
      // Save original Spanish to separate column if translated
      if (translated.original) {
        const prev = sr.Tech_Notes_Original || '';
        updates.Tech_Notes_Original = prev ? `${prev}\n${translated.original}` : translated.original;
      }
    }

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

    // Archive: when status flips to Complete, copy the row to
    // CompletedRequests and remove it from ServiceRequests.
    let archived = false;
    if (status === STATUSES.COMPLETE) {
      try {
        await sheets.writeCompletedRequest(updatedSr);
        await sheets.deleteServiceRequest(req.params.id);
        archived = true;
        console.log(`[archive] ${req.params.id} moved to CompletedRequests`);
      } catch (err) {
        console.error(`[archive] Failed to archive ${req.params.id}:`, err.message);
      }
    }

    res.json({
      message: `Status updated to ${status}`,
      srId: req.params.id,
      status,
      updatedAt: now,
      notifications: notifyResult,
      archived,
    });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PATCH /api/requests/:id — update other fields (office only)
router.patch('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'Manager') {
      return res.status(403).json({ error: 'Only Managers can update SR fields' });
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
