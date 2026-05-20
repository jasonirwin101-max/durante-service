const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const sheets = require('../services/sheets');
const { sendEmail } = require('../services/outlook');
const { fireNotifications } = require('../services/notifications');
const { STATUSES } = require('../utils/statusFlow');

const router = express.Router();

const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripTimestamps(text) {
  if (!text) return '';
  return text.replace(/\[\d{4}-\d{2}-\d{2}T[\d:.]+Z?\]\s*/g, '').trim();
}

function htmlPage(message, accentColor) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Durante Equipment</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center"><table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${accentColor};padding:20px 30px;"><h1 style="color:#ffffff;margin:0;font-size:22px;">Durante Equipment</h1></td></tr>
<tr><td style="padding:30px;font-size:16px;color:#1A1A1A;line-height:1.5;">${message}</td></tr>
</table></td></tr></table></body></html>`;
}

const htmlOk = (m) => htmlPage(m, '#16a34a');
const htmlError = (m) => htmlPage(m, '#CC0000');

async function validateApprovalToken(srId, token) {
  const sr = await sheets.getServiceRequestById(srId);
  if (!sr) return { ok: false, reason: 'SR not found' };
  if (sr.Current_Status !== STATUSES.PENDING_APPROVAL) {
    return { ok: false, reason: `Not awaiting approval (status: ${sr.Current_Status})` };
  }
  if (!sr.Approval_Token || sr.Approval_Token !== token) {
    return { ok: false, reason: 'Invalid token' };
  }
  if (sr.Approval_Token_Used === 'TRUE') {
    return { ok: false, reason: 'Token already used' };
  }
  const createdMs = new Date(sr.Approval_Token_Created_At || 0).getTime();
  if (!createdMs || Date.now() - createdMs > APPROVAL_TOKEN_TTL_MS) {
    return { ok: false, reason: 'Token expired' };
  }
  return { ok: true, sr };
}

// Shared approve logic for both GET (token-based) and POST (JWT-based) paths.
// `who` is the human-readable identity recorded in status history.
async function performApprove(sr, who) {
  const now = new Date().toISOString();
  await sheets.updateServiceRequestFields(sr.SR_ID, {
    Approval_Token_Used: 'TRUE',
    Current_Status: STATUSES.COMPLETE,
    Status_Updated_At: now,
    Status_Updated_By: who,
    Service_Completed: 'TRUE',
  });
  const updated = await sheets.getServiceRequestById(sr.SR_ID);
  let notifyResult = { customerNotified: false, submitterNotified: false, smsSent: false, emailSent: false, ratingToken: null };
  try {
    notifyResult = await fireNotifications(updated, STATUSES.COMPLETE, {
      customerNote: stripTimestamps(updated.Tech_Notes || ''),
      internalNote: stripTimestamps(updated.Internal_Notes || ''),
    });
  } catch (err) {
    console.error('[Approval] Notifications failed:', err.message);
  }
  let historyNotes = `Completion approved by ${who} — customer notified`;
  if (notifyResult.ratingToken) historyNotes += ` | RATING_TOKEN:${notifyResult.ratingToken}`;
  await sheets.appendStatusHistory({
    SR_ID: sr.SR_ID,
    Status: STATUSES.COMPLETE,
    Notes: historyNotes,
    Updated_By: who,
    Role: 'Manager',
    Timestamp: now,
    Customer_Notified: notifyResult.customerNotified ? 'TRUE' : 'FALSE',
    Submitter_Notified: notifyResult.submitterNotified ? 'TRUE' : 'FALSE',
    SMS_Sent: notifyResult.smsSent ? 'TRUE' : 'FALSE',
    Email_Sent: notifyResult.emailSent ? 'TRUE' : 'FALSE',
  });
  try {
    await sheets.writeCompletedRequest(updated);
    await sheets.deleteServiceRequest(sr.SR_ID);
    console.log(`[Approval] ${sr.SR_ID} approved & archived by ${who}`);
  } catch (err) {
    console.error(`[Approval] Archive failed for ${sr.SR_ID}:`, err.message);
  }
}

async function performReject(sr, who) {
  const now = new Date().toISOString();
  await sheets.updateServiceRequestFields(sr.SR_ID, {
    Approval_Token_Used: 'TRUE',
    Current_Status: STATUSES.IN_PROGRESS,
    Status_Updated_At: now,
    Status_Updated_By: who,
  });
  await sheets.appendStatusHistory({
    SR_ID: sr.SR_ID,
    Status: STATUSES.IN_PROGRESS,
    Notes: `Completion rejected by ${who} — sent back to tech`,
    Updated_By: who,
    Role: 'Manager',
    Timestamp: now,
    Customer_Notified: 'FALSE',
    Submitter_Notified: 'FALSE',
    SMS_Sent: 'FALSE',
    Email_Sent: 'FALSE',
  });
  console.log(`[Approval] ${sr.SR_ID} rejected by ${who} — status back to In Progress`);
}

// ── GET endpoints — called from approval-request email links ──

router.get('/:srId/approve-completion', async (req, res) => {
  try {
    const { srId } = req.params;
    const token = req.query.token;
    if (!token) return res.status(400).send(htmlError('Missing approval token.'));
    const v = await validateApprovalToken(srId, token);
    if (!v.ok) {
      console.log(`[Approval] GET approve rejected for ${srId}: ${v.reason}`);
      return res.status(403).send(htmlError('This approval link is no longer valid.'));
    }
    await performApprove(v.sr, 'service@duranteequip.com');
    res.send(htmlOk(`<strong>✓ ${escapeHtml(srId)} approved.</strong><br/><br/>Customer has been notified.`));
  } catch (err) {
    console.error('[Approval] GET approve error:', err);
    res.status(500).send(htmlError('Something went wrong. Please contact the office.'));
  }
});

router.get('/:srId/reject-completion', async (req, res) => {
  try {
    const { srId } = req.params;
    const token = req.query.token;
    if (!token) return res.status(400).send(htmlError('Missing approval token.'));
    const v = await validateApprovalToken(srId, token);
    if (!v.ok) {
      console.log(`[Approval] GET reject rejected for ${srId}: ${v.reason}`);
      return res.status(403).send(htmlError('This approval link is no longer valid.'));
    }
    await performReject(v.sr, 'service@duranteequip.com');
    res.send(htmlOk(`<strong>✓ ${escapeHtml(srId)} reopened.</strong><br/><br/>The assigned tech will see it back in their list.`));
  } catch (err) {
    console.error('[Approval] GET reject error:', err);
    res.status(500).send(htmlError('Something went wrong. Please contact the office.'));
  }
});

// ── POST endpoints — called from office dashboard (Manager-authed) ──

router.post('/:srId/approve', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const sr = await sheets.getServiceRequestById(req.params.srId);
    if (!sr) return res.status(404).json({ error: 'SR not found' });
    if (sr.Current_Status !== STATUSES.PENDING_APPROVAL) {
      return res.status(409).json({ error: `SR is not awaiting approval (current: ${sr.Current_Status})` });
    }
    await performApprove(sr, req.user.name);
    res.json({ message: 'Approved — customer notified', srId: req.params.srId });
  } catch (err) {
    console.error('[Approval] POST approve error:', err);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

router.post('/:srId/reject', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const sr = await sheets.getServiceRequestById(req.params.srId);
    if (!sr) return res.status(404).json({ error: 'SR not found' });
    if (sr.Current_Status !== STATUSES.PENDING_APPROVAL) {
      return res.status(409).json({ error: `SR is not awaiting approval (current: ${sr.Current_Status})` });
    }
    await performReject(sr, req.user.name);
    res.json({ message: 'Sent back to tech', srId: req.params.srId });
  } catch (err) {
    console.error('[Approval] POST reject error:', err);
    res.status(500).json({ error: 'Failed to reject' });
  }
});

// ── POST /:srId/reopen — password-gated reopen of a completed SR ──

router.post('/:srId/reopen', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const expected = process.env.REOPEN_PASSWORD;
    if (!expected) {
      console.error('[Reopen] REOPEN_PASSWORD env var is not set');
      return res.status(500).json({ error: 'Reopen is not configured on the server' });
    }
    const { password } = req.body || {};
    if (!password || password !== expected) {
      console.log(`[Reopen] Wrong password attempt by ${req.user.name} for ${req.params.srId}`);
      return res.status(401).json({ error: 'Incorrect password' });
    }
    const { srId } = req.params;
    const archived = await sheets.getCompletedRequestById(srId);
    if (!archived) {
      return res.status(404).json({ error: 'SR not found in CompletedRequests' });
    }
    await sheets.moveCompletedToActive(srId);
    const now = new Date().toISOString();
    await sheets.updateServiceRequestFields(srId, {
      Current_Status: STATUSES.IN_PROGRESS,
      Status_Updated_At: now,
      Status_Updated_By: req.user.name,
      Service_Completed: 'FALSE',
    });
    await sheets.appendStatusHistory({
      SR_ID: srId,
      Status: STATUSES.IN_PROGRESS,
      Notes: `SR reopened by ${req.user.name} on ${now} — was previously Complete`,
      Updated_By: req.user.name,
      Role: 'Manager',
      Timestamp: now,
      Customer_Notified: 'FALSE',
      Submitter_Notified: 'FALSE',
      SMS_Sent: 'FALSE',
      Email_Sent: 'FALSE',
    });
    const subject = `${srId} has been reopened`;
    const body = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;">
<p><strong>${escapeHtml(req.user.name)}</strong> reopened <strong>${escapeHtml(srId)}</strong> on ${escapeHtml(now)}.</p>
<p>Previous status: Complete. The SR is now back in active status.</p>
</body></html>`;
    sendEmail('service@duranteequip.com', subject, body).catch(err =>
      console.error('[Reopen] Notification email failed:', err.message)
    );
    console.log(`[Reopen] ${srId} reopened by ${req.user.name}`);
    res.json({ message: 'SR reopened', srId });
  } catch (err) {
    console.error('[Reopen] Error:', err);
    res.status(500).json({ error: 'Failed to reopen' });
  }
});

module.exports = router;
