const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { isValidStatus, canRoleSetStatus, STATUSES } = require('../utils/statusFlow');
const sheets = require('../services/sheets');
const { fireNotifications, sendApprovalRequest } = require('../services/notifications');
const { processNotes } = require('../services/translate');
const crypto = require('crypto');

const router = express.Router();

// All routes below require authentication
router.use(authMiddleware);

const CLOCK_RESUME_STATUSES = new Set(['Dispatched', 'On Site']);

function formatTotalTime(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

// Compute clock-field updates for a status change. Returns an object of
// fields to merge into the sheet update batch. Defensive: never restarts a
// running clock, never adds elapsed when not running, handles Complete-while-
// paused correctly (no extra elapsed window to add).
function computeClockUpdates(sr, status, nowIso, srId) {
  const updates = {};
  const clockStatus = sr.Clock_Status || '';
  const clockTotalSec = parseInt(sr.Clock_Total_Seconds || '0', 10) || 0;
  const clockStartIso = sr.Clock_Start || '';

  if (CLOCK_RESUME_STATUSES.has(status)) {
    if (clockStatus === '' || clockStatus === 'paused') {
      updates.Clock_Start = nowIso;
      updates.Clock_Status = 'running';
      updates.Clock_Paused_At = '';
      console.log(`[CLOCK] ${clockStatus === 'paused' ? 'Resumed' : 'Started'} for SR: ${srId}`);
    }
    // Already running → no-op (preserve segment start)
  } else if (status === STATUSES.LEFT_SITE) {
    if (clockStatus === 'running' && clockStartIso) {
      const elapsed = Math.floor((Date.now() - new Date(clockStartIso).getTime()) / 1000);
      const newTotal = clockTotalSec + Math.max(0, elapsed);
      updates.Clock_Total_Seconds = String(newTotal);
      updates.Clock_Paused_At = nowIso;
      updates.Clock_Status = 'paused';
      console.log(`[CLOCK] Paused for SR: ${srId}, total so far: ${newTotal}s`);
    }
    // Not running → no-op
  } else if (status === STATUSES.COMPLETE || status === STATUSES.PENDING_APPROVAL) {
    // Pending Approval stops the clock too — work is done from the tech's
    // perspective, the office review is administrative. If the office
    // rejects, status flips to In Progress and the tech can tap Dispatched
    // / On Site again to resume.
    let finalTotal = clockTotalSec;
    if (clockStatus === 'running' && clockStartIso) {
      const elapsed = Math.floor((Date.now() - new Date(clockStartIso).getTime()) / 1000);
      finalTotal = clockTotalSec + Math.max(0, elapsed);
    }
    updates.Clock_Total_Seconds = String(finalTotal);
    updates.Clock_Status = 'stopped';
    updates.Total_Service_Time = formatTotalTime(finalTotal);
    console.log(`[CLOCK] Stopped for SR: ${srId}, total: ${updates.Total_Service_Time}`);
  }

  return updates;
}

function formatNoteDateTime(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dateStr = d.toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York',
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
  });
  return `${dateStr} ${timeStr}`;
}

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
    const { status, notes, internalNotes, customerNotes, eta, scheduledDate, unitNumber } = req.body;
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

    // Tech-initiated Complete goes to Pending Approval first. Managers bypass
    // approval (they ARE the approver). Token is generated here, saved on the
    // SR row, and surfaced in the approval-request email below.
    let effectiveStatus = status;
    let approvalToken = null;
    if (role === 'Tech' && status === STATUSES.COMPLETE) {
      effectiveStatus = STATUSES.PENDING_APPROVAL;
      approvalToken = crypto.randomBytes(16).toString('hex'); // 32 hex chars
      console.log(`[Approval] Tech ${name} marked ${req.params.id} Complete — converted to Pending Approval`);
    }

    // Customer-facing note required on Mark Complete
    const customerNotesRaw = (customerNotes !== undefined ? customerNotes : notes) || '';
    if (status === STATUSES.COMPLETE && !customerNotesRaw.trim()) {
      return res.status(400).json({ error: 'Customer Update is required when marking Complete' });
    }

    // Check SR exists
    const sr = await sheets.getServiceRequestById(req.params.id);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    const now = new Date().toISOString();

    // Build updates
    const updates = {
      Current_Status: effectiveStatus,
      Status_Updated_At: now,
      Status_Updated_By: name,
    };

    if (effectiveStatus === STATUSES.PENDING_APPROVAL) {
      updates.Approval_Token = approvalToken;
      updates.Approval_Token_Created_At = now;
      updates.Approval_Token_Used = 'FALSE';
    }

    if (eta) {
      console.log(`[ETA DEBUG] Saving ETA: "${eta}" (type: ${typeof eta})`);
      updates.ETA = eta;
    }
    if (scheduledDate) updates.Scheduled_Date = scheduledDate;
    if (unitNumber) updates.Unit_Number = unitNumber;

    Object.assign(updates, computeClockUpdates(sr, effectiveStatus, now, req.params.id));

    const stamp = formatNoteDateTime(now);

    // Process customer-facing notes (Tech_Notes column) — translate each new note
    // independently, prefix with timestamp, and APPEND to the existing column.
    // Capture the translated text for use in this status update's customer notification.
    let translatedCustomerNote = '';
    if (customerNotesRaw && customerNotesRaw.trim()) {
      const original = customerNotesRaw.trim();
      console.log('[TRANSLATE] Customer note (input):', original);
      const translated = await processNotes(original);
      console.log('[TRANSLATE] Customer translated:', translated.text, '| wasSpanish:', !!translated.original);
      translatedCustomerNote = translated.text;
      const newLine = `${stamp} — ${translated.text}`;
      updates.Tech_Notes = sr.Tech_Notes ? `${sr.Tech_Notes}\n${newLine}` : newLine;
      if (translated.original) {
        const origLine = `${stamp} — ${translated.original}`;
        updates.Tech_Notes_Original = sr.Tech_Notes_Original
          ? `${sr.Tech_Notes_Original}\n${origLine}`
          : origLine;
      }
    }

    // Process internal notes (Internal_Notes column) — same translate + stack flow.
    let translatedInternalNote = '';
    if (internalNotes && internalNotes.trim()) {
      const original = internalNotes.trim();
      console.log('[TRANSLATE] Internal note (input):', original);
      const translated = await processNotes(original);
      console.log('[TRANSLATE] Internal translated:', translated.text, '| wasSpanish:', !!translated.original);
      translatedInternalNote = translated.text;
      const newLine = `${stamp} — ${translated.text}`;
      updates.Internal_Notes = sr.Internal_Notes ? `${sr.Internal_Notes}\n${newLine}` : newLine;
      if (translated.original) {
        const origLine = `${stamp} — ${translated.original}`;
        updates.Internal_Notes_Original = sr.Internal_Notes_Original
          ? `${sr.Internal_Notes_Original}\n${origLine}`
          : origLine;
      }
    }

    if (effectiveStatus === STATUSES.COMPLETE) {
      updates.Service_Completed = 'TRUE';
    }

    // Update ServiceRequests sheet
    await sheets.updateServiceRequestFields(req.params.id, updates);

    // Re-read the SR with updated fields for notification templates
    const updatedSr = await sheets.getServiceRequestById(req.params.id);

    // Two paths from here:
    //   1. effectiveStatus === Pending Approval — send ONLY the approval-request
    //      email to service@; no customer/submitter notifications, no archive.
    //   2. Anything else — existing flow (customer + submitter + maybe PDF).
    let notifyResult = {
      customerNotified: false, submitterNotified: false,
      smsSent: false, emailSent: false, ratingToken: null,
    };
    if (effectiveStatus === STATUSES.PENDING_APPROVAL) {
      // Fire-and-forget — failure here shouldn't block the status response.
      sendApprovalRequest(updatedSr, approvalToken).catch(err =>
        console.error('[Approval] Request email failed:', err.message)
      );
    } else {
      notifyResult = await fireNotifications(updatedSr, effectiveStatus, {
        customerNote: translatedCustomerNote,
        internalNote: translatedInternalNote,
      });
    }

    // Build notes with rating token if COMPLETE
    let historyNotes = customerNotesRaw || '';
    if (effectiveStatus === STATUSES.PENDING_APPROVAL) {
      historyNotes = historyNotes
        ? `${historyNotes} | Awaiting service@ review`
        : 'Pending Approval — Awaiting service@ review';
    }
    if (notifyResult.ratingToken) {
      historyNotes = historyNotes
        ? `${historyNotes} | RATING_TOKEN:${notifyResult.ratingToken}`
        : `RATING_TOKEN:${notifyResult.ratingToken}`;
    }

    // Append to StatusHistory with notification results
    await sheets.appendStatusHistory({
      SR_ID: req.params.id,
      Status: effectiveStatus,
      Notes: historyNotes,
      Updated_By: name,
      Role: role,
      Timestamp: now,
      Customer_Notified: notifyResult.customerNotified ? 'TRUE' : 'FALSE',
      Submitter_Notified: notifyResult.submitterNotified ? 'TRUE' : 'FALSE',
      SMS_Sent: notifyResult.smsSent ? 'TRUE' : 'FALSE',
      Email_Sent: notifyResult.emailSent ? 'TRUE' : 'FALSE',
    });

    // Archive: only when status flips to Complete (not Pending Approval).
    // The approve endpoint handles archive-on-approval.
    let archived = false;
    if (effectiveStatus === STATUSES.COMPLETE) {
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
      message: `Status updated to ${effectiveStatus}`,
      srId: req.params.id,
      status: effectiveStatus,
      updatedAt: now,
      notifications: notifyResult,
      archived,
      pendingApproval: effectiveStatus === STATUSES.PENDING_APPROVAL,
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
