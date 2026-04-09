const { SDK } = require('@ringcentral/sdk');

let platform = null;

async function getPlatform() {
  if (platform) return platform;

  const sdk = new SDK({
    server: process.env.RINGCENTRAL_SERVER_URL,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  platform = sdk.platform();
  await platform.login({ jwt: process.env.RINGCENTRAL_JWT_TOKEN });
  return platform;
}

/**
 * Send an SMS via RingCentral.
 * @param {string} to - Phone number in E.164 format (e.g. +19545551234)
 * @param {string} text - Message body
 * @returns {object} - RingCentral API response
 */
async function sendSMS(to, text) {
  try {
    // Normalize phone number to E.164
    const normalized = normalizePhone(to);
    if (!normalized) {
      console.warn(`SMS skipped — invalid phone: ${to}`);
      return null;
    }

    const p = await getPlatform();
    const response = await p.post('/restapi/v1.0/account/~/extension/~/sms', {
      from: { phoneNumber: process.env.RINGCENTRAL_FROM_NUMBER },
      to: [{ phoneNumber: normalized }],
      text,
    });

    const json = await response.json();
    console.log(`SMS sent to ${normalized}: ${text.substring(0, 50)}...`);
    return json;
  } catch (err) {
    console.error(`SMS failed to ${to}:`, err.message);
    return null;
  }
}

/**
 * Normalize a phone number to E.164 format.
 * Handles: (954) 555-1234, 954-555-1234, 9545551234, +19545551234
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10 && phone.startsWith('+')) return phone;
  return null;
}

module.exports = { sendSMS, normalizePhone };
