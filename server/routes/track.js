const express = require('express');
const sheets = require('../services/sheets');

const router = express.Router();

// GET /api/track/:id — public tracking endpoint
router.get('/:id', async (req, res) => {
  try {
    const srId = req.params.id;
    const sr = await sheets.getServiceRequestById(srId);

    if (!sr) {
      return res.status(404).json({ error: 'Service request not found' });
    }

    // Get status history for timeline
    const history = await sheets.getStatusHistoryBySrId(srId);

    // Return only public-safe fields — NO internal notes, charges, or operator issue
    res.json({
      srId: sr.SR_ID,
      companyName: sr.Company_Name,
      contactName: sr.Contact_Name,
      equipmentDescription: sr.Equipment_Description,
      problemDescription: sr.Problem_Description,
      currentStatus: sr.Current_Status,
      statusUpdatedAt: sr.Status_Updated_At,
      assignedTech: sr.Assigned_Tech ? sr.Assigned_Tech.split(' ')[0] : '', // first name only
      eta: sr.ETA,
      scheduledDate: sr.Scheduled_Date,
      submittedOn: sr.Submitted_On,
      timeline: history.map(h => ({
        status: h.Status,
        timestamp: h.Timestamp,
        notes: h.Notes,
      })),
    });
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

module.exports = router;
