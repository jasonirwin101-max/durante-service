const { SDK } = require('@ringcentral/sdk');

let platform = null;
let platformExpiry = 0;

async function getPlatform() {
  // Re-auth if platform is null or token is older than 30 minutes
  if (platform && Date.now() < platformExpiry) return platform;

  console.log('[SMS] Initializing RingCentral SDK...');
  console.log('[SMS] Server:', process.env.RINGCENTRAL_SERVER_URL);
  console.log('[SMS] Client ID:', process.env.RINGCENTRAL_CLIENT_ID ? 'SET' : 'MISSING');
  console.log('[SMS] Client Secret:', process.env.RINGCENTRAL_CLIENT_SECRET ? 'SET' : 'MISSING');
  console.log('[SMS] JWT Token:', process.env.RINGCENTRAL_JWT_TOKEN ? `SET (${process.env.RINGCENTRAL_JWT_TOKEN.length} chars)` : 'MISSING');
  console.log('[SMS] From Number:', process.env.RINGCENTRAL_FROM_NUMBER);

  const sdk = new SDK({
    server: process.env.RINGCENTRAL_SERVER_URL,
    clientId: process.env.RINGCENTRAL_CLIENT_ID,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
  });

  const p = sdk.platform();
  try {
    await p.login({ jwt: process.env.RINGCENTRAL_JWT_TOKEN });
    platform = p;
    platformExpiry = Date.now() + 30 * 60 * 1000; // refresh every 30 min
    console.log('[SMS] RingCentral authenticated OK');
  } catch (err) {
    console.error('[SMS] RingCentral auth FAILED:', err.message);
    platform = null;
    platformExpiry = 0;
    throw err;
  }
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
      console.warn(`[SMS] Skipped — invalid phone: "${to}"`);
      return null;
    }

    const fromNumber = process.env.RINGCENTRAL_FROM_NUMBER;
    console.log(`[SMS] Sending to ${normalized} from ${fromNumber}`);

    const p = await getPlatform();
    const response = await p.post('/restapi/v1.0/account/~/extension/~/sms', {
      from: { phoneNumber: fromNumber },
      to: [{ phoneNumber: normalized }],
      text,
    });

    const json = await response.json();
    console.log(`[SMS] Sent OK to ${normalized}: ${text.substring(0, 50)}...`);
    console.log(`[SMS] Response: id=${json.id} status=${json.messageStatus} direction=${json.direction} from=${json.from?.phoneNumber} to=${json.to?.[0]?.phoneNumber} deliveryState=${json.to?.[0]?.messageStatus || 'N/A'}`);
    return json;
  } catch (err) {
    const detail = err.response ? await err.response.text().catch(() => '') : '';
    console.error(`[SMS] FAILED to ${to}: ${err.message}`);
    if (detail) console.error(`[SMS] Detail: ${detail.substring(0, 300)}`);
    console.error(`[SMS] From number: ${process.env.RINGCENTRAL_FROM_NUMBER}`);
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
