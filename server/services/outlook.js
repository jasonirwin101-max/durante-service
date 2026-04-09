require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');

let graphClient = null;
let tokenCache = { accessToken: null, expiresAt: 0 };

/**
 * Get an access token from Azure AD using client credentials flow.
 */
async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60000) {
    return tokenCache.accessToken;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure token error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in * 1000),
  };

  return tokenCache.accessToken;
}

/**
 * Get an authenticated Microsoft Graph client.
 */
function getGraphClient() {
  if (graphClient) return graphClient;

  graphClient = Client.init({
    authProvider: async (done) => {
      try {
        const token = await getAccessToken();
        done(null, token);
      } catch (err) {
        done(err, null);
      }
    },
  });

  return graphClient;
}

/**
 * Send an email via Microsoft Graph (Outlook).
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} htmlBody - HTML email content
 * @returns {boolean} - True if sent successfully
 */
async function sendEmail(to, subject, htmlBody) {
  try {
    if (!to) {
      console.warn('Email skipped — no recipient address');
      return false;
    }

    const client = getGraphClient();
    const fromEmail = process.env.OUTLOOK_FROM_EMAIL;

    await client.api(`/users/${fromEmail}/sendMail`).post({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlBody,
        },
        toRecipients: [
          {
            emailAddress: { address: to },
          },
        ],
      },
      saveToSentItems: true,
    });

    console.log(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`Email failed to ${to}:`, err.message);
    return false;
  }
}

/**
 * Send an email with a PDF attachment via Microsoft Graph.
 * @param {string} to - Recipient email
 * @param {string} subject - Subject line
 * @param {string} htmlBody - HTML content
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} pdfName - Filename for the attachment
 * @returns {boolean}
 */
async function sendEmailWithAttachment(to, subject, htmlBody, pdfBuffer, pdfName) {
  try {
    if (!to) {
      console.warn('Email skipped — no recipient address');
      return false;
    }

    const client = getGraphClient();
    const fromEmail = process.env.OUTLOOK_FROM_EMAIL;

    await client.api(`/users/${fromEmail}/sendMail`).post({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlBody,
        },
        toRecipients: [
          { emailAddress: { address: to } },
        ],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: pdfName,
            contentType: 'application/pdf',
            contentBytes: pdfBuffer.toString('base64'),
          },
        ],
      },
      saveToSentItems: true,
    });

    console.log(`Email+PDF sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`Email+PDF failed to ${to}:`, err.message);
    return false;
  }
}

module.exports = { sendEmail, sendEmailWithAttachment, getAccessToken };
