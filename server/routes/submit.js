const express = require('express');
const { generateSrId } = require('../utils/idGenerator');
const { deriveSubmitterEmail } = require('../utils/emailDeriver');
const { STATUSES } = require('../utils/statusFlow');
const { sanitizeObject } = require('../utils/sanitize');
const sheets = require('../services/sheets');
const { fireNotifications } = require('../services/notifications');

const router = express.Router();

// POST /api/submit — create a new service request
router.post('/', async (req, res) => {
  try {
    // Sanitize all input
    const clean = sanitizeObject(req.body);
    const {
      companyName, contactName, contactPhone, contactEmail,
      smsConsent,
      siteAddress, customersNeed, assetNumber, equipmentDescription,
      problemDescription, submitterName, submitterPhone,
      photos,
    } = clean;

    // Validate required fields
    const required = {
      companyName, contactName, contactPhone, contactEmail,
      siteAddress, customersNeed, equipmentDescription,
      problemDescription, submitterName, submitterPhone,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v || !v.trim())
      .map(([k]) => k);

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    if (smsConsent !== 'Yes' && smsConsent !== 'No') {
      return res.status(400).json({ error: 'SMS consent must be Yes or No' });
    }

    // Generate SR ID — checks both ServiceRequests and CompletedRequests
    const srId = await generateSrId();
    const now = new Date().toISOString();
    const trackingUrl = `${process.env.BASE_URL}/track/${srId}`;
    const submitterEmail = deriveSubmitterEmail(submitterName);

    // Build SR data object
    const srData = {
      SR_ID: srId,
      Submitted_On: now,
      Company_Name: companyName.trim(),
      Contact_Name: contactName.trim(),
      Contact_Phone: contactPhone.trim(),
      Contact_Email: (contactEmail || '').trim(),
      Site_Address: (siteAddress || '').trim(),
      Customers_Need: (customersNeed || '').trim(),
      Asset_Number: (assetNumber || '').trim(),
      Unit_Number: '',
      Equipment_Description: (equipmentDescription || '').trim(),
      Problem_Description: (problemDescription || '').trim(),
      Submitter_Name: submitterName.trim(),
      Submitter_Phone: submitterPhone.trim(),
      Photo_1: (photos && photos[0]) || '',
      Photo_2: (photos && photos[1]) || '',
      Photo_3: (photos && photos[2]) || '',
      Photo_4: (photos && photos[3]) || '',
      Assigned_Tech: '',
      Current_Status: STATUSES.RECEIVED,
      Status_Updated_At: now,
      Status_Updated_By: 'System',
      ETA: '',
      Scheduled_Date: '',
      Tech_Notes: '',
      Completion_Photo_URL: '',
      Tracking_URL: trackingUrl,
      Satisfaction_Rating: '',
      Escalation_Flag: 'FALSE',
      PDF_Report_URL: '',
      Internal_Notes: '',
      Operator_Issue: 'FALSE',
      Customer_Charged: 'FALSE',
      Amount_Charged: '',
      Service_Completed: 'FALSE',
      SMS_Consent: smsConsent,
    };

    // Write to ServiceRequests sheet
    await sheets.appendServiceRequest(srData);

    // Fire RECEIVED notifications
    const notifyResult = await fireNotifications(srData, STATUSES.RECEIVED);

    // Write to StatusHistory sheet with actual notification results
    await sheets.appendStatusHistory({
      SR_ID: srId,
      Status: STATUSES.RECEIVED,
      Notes: 'Service request submitted',
      Updated_By: 'System',
      Role: 'System',
      Timestamp: now,
      Customer_Notified: notifyResult.customerNotified ? 'TRUE' : 'FALSE',
      Submitter_Notified: notifyResult.submitterNotified ? 'TRUE' : 'FALSE',
      SMS_Sent: notifyResult.smsSent ? 'TRUE' : 'FALSE',
      Email_Sent: notifyResult.emailSent ? 'TRUE' : 'FALSE',
    });

    res.status(201).json({
      srId,
      trackingUrl,
      submitterEmail,
      notifications: notifyResult,
      message: `Service request ${srId} created successfully`,
    });
  } catch (err) {
    console.error('Submit error:', err.message, err.stack);
    res.status(500).json({
      error: 'Failed to create service request',
      detail: err.message,
    });
  }
});

module.exports = router;
