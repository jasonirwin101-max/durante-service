const PDFDocument = require('pdfkit');
const { google } = require('googleapis');
const { Readable } = require('stream');
const sheets = require('./sheets');

let driveClient = null;
let folderId = null;

function getDrive() {
  if (driveClient) return driveClient;

  // If a delegated user is configured, use JWT with subject for domain-wide delegation
  const impersonateEmail = process.env.GOOGLE_DRIVE_IMPERSONATE;

  if (impersonateEmail) {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      subject: impersonateEmail,
    });
    driveClient = google.drive({ version: 'v3', auth });
  } else {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    driveClient = google.drive({ version: 'v3', auth });
  }

  return driveClient;
}

async function getOrCreateFolder() {
  if (folderId) return folderId;
  const drive = getDrive();
  const folderName = 'Durante Service Reports';

  const search = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });

  if (search.data.files.length > 0) {
    folderId = search.data.files[0].id;
    return folderId;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  folderId = folder.data.id;
  return folderId;
}

/**
 * Generate a completion PDF for a service request.
 * @param {object} sr - Full SR data from sheets
 * @returns {Buffer} - PDF file as Buffer
 */
function generatePDF(sr) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const RED = '#E31837';
    const DARK = '#1A1A1A';
    const GRAY = '#666666';
    const pageWidth = doc.page.width - 100; // margins

    // ─── Header ──────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(RED);
    doc.fontSize(22).fill('#FFFFFF').text('Durante Equipment', 50, 25, { width: pageWidth });
    doc.fontSize(10).fill('#FFFFFF').text('Service Completion Report', 50, 52, { width: pageWidth });

    doc.moveDown(2);
    let y = 100;

    // ─── SR Number + Dates ───────────────────────────────
    doc.fontSize(16).fill(DARK).text(sr.SR_ID, 50, y);
    y += 25;

    const submittedDate = sr.Submitted_On ? new Date(sr.Submitted_On).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const completedDate = sr.Status_Updated_At ? new Date(sr.Status_Updated_At).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

    // Duration
    let duration = '';
    if (sr.Submitted_On && sr.Status_Updated_At) {
      const ms = new Date(sr.Status_Updated_At).getTime() - new Date(sr.Submitted_On).getTime();
      const hours = Math.floor(ms / 3600000);
      const days = Math.floor(hours / 24);
      const remainHours = hours % 24;
      if (days > 0) {
        duration = `${days} day${days > 1 ? 's' : ''}, ${remainHours} hour${remainHours !== 1 ? 's' : ''}`;
      } else {
        duration = `${hours} hour${hours !== 1 ? 's' : ''}`;
      }
    }

    doc.fontSize(10).fill(GRAY);
    doc.text(`Submitted: ${submittedDate}`, 50, y);
    doc.text(`Completed: ${completedDate}`, 300, y);
    y += 15;
    if (duration) {
      doc.text(`Total Duration: ${duration}`, 50, y);
      y += 15;
    }

    // Divider
    y += 10;
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor(RED).lineWidth(2).stroke();
    y += 15;

    // ─── Customer Information ────────────────────────────
    y = sectionHeader(doc, 'Customer Information', y, RED);
    y = fieldRow(doc, 'Company', sr.Company_Name, y, DARK, GRAY);
    y = fieldRow(doc, 'Contact', sr.Contact_Name, y, DARK, GRAY);
    y = fieldRow(doc, 'Site Address', sr.Site_Address, y, DARK, GRAY);
    y += 10;

    // ─── Equipment ───────────────────────────────────────
    y = sectionHeader(doc, 'Equipment', y, RED);
    y = fieldRow(doc, 'Description', sr.Equipment_Description, y, DARK, GRAY);
    if (sr.Asset_Number) y = fieldRow(doc, 'Asset #', sr.Asset_Number, y, DARK, GRAY);
    if (sr.Unit_Number) y = fieldRow(doc, 'Unit #', sr.Unit_Number, y, DARK, GRAY);
    y += 10;

    // ─── Issue & Resolution ──────────────────────────────
    y = sectionHeader(doc, 'Issue', y, RED);
    y = wrappedText(doc, sr.Problem_Description, y, DARK);
    y += 10;

    y = sectionHeader(doc, 'Resolution', y, RED);
    y = wrappedText(doc, sr.Tech_Notes || 'See technician notes.', y, DARK);
    y += 10;

    // ─── Technician ──────────────────────────────────────
    y = sectionHeader(doc, 'Technician', y, RED);
    y = fieldRow(doc, 'Name', sr.Assigned_Tech || 'N/A', y, DARK, GRAY);
    y += 20;

    // ─── Footer ──────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    y += 10;
    doc.fontSize(8).fill(GRAY);
    doc.text('Durante Equipment · Hollywood, FL · Old School Values. New School Speed.', 50, y, { align: 'center', width: pageWidth });

    doc.end();
  });
}

function sectionHeader(doc, title, y, color) {
  doc.fontSize(11).fill(color).text(title.toUpperCase(), 50, y, { characterSpacing: 1 });
  return y + 18;
}

function fieldRow(doc, label, value, y, darkColor, grayColor) {
  doc.fontSize(9).fill(grayColor).text(label, 50, y);
  doc.fontSize(10).fill(darkColor).text(value || '', 160, y);
  return y + 16;
}

function wrappedText(doc, text, y, color) {
  doc.fontSize(10).fill(color);
  const height = doc.heightOfString(text || '', { width: 462 });
  doc.text(text || '', 50, y, { width: 462 });
  return y + height + 4;
}

/**
 * Generate PDF, save to Google Drive, write URL to sheet.
 * @param {object} sr - Full SR data
 * @returns {string} - Google Drive view URL
 */
async function generateAndSavePDF(sr) {
  // Generate PDF buffer
  const pdfBuffer = await generatePDF(sr);

  // Try to upload to Google Drive
  let pdfUrl = null;
  try {
    const drive = getDrive();
    const parentId = await getOrCreateFolder();

    const response = await drive.files.create({
      requestBody: {
        name: `${sr.SR_ID}-completion-report.pdf`,
        mimeType: 'application/pdf',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(pdfBuffer),
      },
      fields: 'id,webViewLink',
    });

    // Make viewable by anyone with link
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    pdfUrl = response.data.webViewLink;

    // Write URL to sheet
    await sheets.updateServiceRequestField(sr.SR_ID, 'PDF_Report_URL', pdfUrl);
    console.log(`PDF saved to Drive for ${sr.SR_ID}: ${pdfUrl}`);
  } catch (err) {
    console.error(`Drive upload failed for ${sr.SR_ID} (PDF still attached to email):`, err.message);
    // Write a note so we know the PDF was emailed but not saved to Drive
    await sheets.updateServiceRequestField(sr.SR_ID, 'PDF_Report_URL', 'emailed-only');
  }

  return { pdfUrl, pdfBuffer };
}

module.exports = { generatePDF, generateAndSavePDF };
