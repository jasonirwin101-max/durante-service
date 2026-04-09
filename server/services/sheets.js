const { google } = require('googleapis');

// Column mappings for ServiceRequests sheet (A=0, B=1, ...)
const SR_COLS = {
  SR_ID: 0, Submitted_On: 1, Company_Name: 2, Contact_Name: 3,
  Contact_Phone: 4, Contact_Email: 5, Site_Address: 6, Customers_Need: 7,
  Asset_Number: 8, Unit_Number: 9, Equipment_Description: 10,
  Problem_Description: 11, Submitter_Name: 12, Submitter_Phone: 13,
  Photo_1: 14, Photo_2: 15, Photo_3: 16, Photo_4: 17,
  Assigned_Tech: 18, Current_Status: 19, Status_Updated_At: 20,
  Status_Updated_By: 21, ETA: 22, Scheduled_Date: 23, Tech_Notes: 24,
  Completion_Photo_URL: 25, Tracking_URL: 26, Satisfaction_Rating: 27,
  Escalation_Flag: 28, PDF_Report_URL: 29, Internal_Notes: 30,
  Operator_Issue: 31, Customer_Charged: 32, Amount_Charged: 33,
  Service_Completed: 34,
};

const SR_HEADERS = Object.keys(SR_COLS);

// Column mappings for StatusHistory sheet
const SH_HEADERS = [
  'SR_ID', 'Status', 'Notes', 'Updated_By', 'Role',
  'Timestamp', 'Customer_Notified', 'Submitter_Notified', 'SMS_Sent', 'Email_Sent',
];

// Column mappings for Techs sheet
const TECH_HEADERS = [
  'Tech_ID', 'Full_Name', 'Email', 'Phone', 'PIN', 'Role', 'Active', 'Created_At',
];

let sheetsClient = null;

function getSheets() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// ─── Generic Helpers ────────────────────────────────────────

async function getRows(sheetName) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:ZZ`,
  });
  return res.data.values || [];
}

async function appendRow(sheetName, values) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

async function updateCell(sheetName, cellRange, value) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${cellRange}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

async function updateRange(sheetName, range, values) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${range}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

// ─── ServiceRequests ────────────────────────────────────────

function rowToSR(row) {
  const sr = {};
  for (const [key, idx] of Object.entries(SR_COLS)) {
    sr[key] = row[idx] || '';
  }
  return sr;
}

async function getAllServiceRequests() {
  const rows = await getRows('ServiceRequests');
  if (rows.length <= 1) return []; // header only
  return rows.slice(1).map(rowToSR);
}

async function getServiceRequestById(srId) {
  const all = await getAllServiceRequests();
  return all.find(sr => sr.SR_ID === srId) || null;
}

async function getExistingSrIds() {
  const rows = await getRows('ServiceRequests');
  if (rows.length <= 1) return [];
  return rows.slice(1).map(row => row[0]).filter(Boolean);
}

async function findSrRowNumber(srId) {
  const rows = await getRows('ServiceRequests');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === srId) return i + 1; // 1-indexed for Sheets
  }
  return null;
}

async function appendServiceRequest(srData) {
  // Build row array in column order
  const row = new Array(SR_HEADERS.length).fill('');
  for (const [key, idx] of Object.entries(SR_COLS)) {
    if (srData[key] !== undefined) {
      row[idx] = srData[key];
    }
  }
  await appendRow('ServiceRequests', row);
}

async function updateServiceRequestField(srId, field, value) {
  const rowNum = await findSrRowNumber(srId);
  if (!rowNum) throw new Error(`SR ${srId} not found`);

  const colIdx = SR_COLS[field];
  if (colIdx === undefined) throw new Error(`Unknown field: ${field}`);

  const colLetter = columnToLetter(colIdx);
  await updateCell('ServiceRequests', `${colLetter}${rowNum}`, value);
}

async function updateServiceRequestFields(srId, fields) {
  const rowNum = await findSrRowNumber(srId);
  if (!rowNum) throw new Error(`SR ${srId} not found`);

  for (const [field, value] of Object.entries(fields)) {
    const colIdx = SR_COLS[field];
    if (colIdx === undefined) continue;
    const colLetter = columnToLetter(colIdx);
    await updateCell('ServiceRequests', `${colLetter}${rowNum}`, value);
  }
}

// ─── StatusHistory ──────────────────────────────────────────

async function appendStatusHistory(entry) {
  const row = [
    entry.SR_ID || '',
    entry.Status || '',
    entry.Notes || '',
    entry.Updated_By || '',
    entry.Role || '',
    entry.Timestamp || new Date().toISOString(),
    entry.Customer_Notified || 'FALSE',
    entry.Submitter_Notified || 'FALSE',
    entry.SMS_Sent || 'FALSE',
    entry.Email_Sent || 'FALSE',
  ];
  await appendRow('StatusHistory', row);
}

async function getStatusHistoryBySrId(srId) {
  const rows = await getRows('StatusHistory');
  if (rows.length <= 1) return [];
  return rows.slice(1)
    .filter(row => row[0] === srId)
    .map(row => ({
      SR_ID: row[0] || '',
      Status: row[1] || '',
      Notes: row[2] || '',
      Updated_By: row[3] || '',
      Role: row[4] || '',
      Timestamp: row[5] || '',
      Customer_Notified: row[6] || 'FALSE',
      Submitter_Notified: row[7] || 'FALSE',
      SMS_Sent: row[8] || 'FALSE',
      Email_Sent: row[9] || 'FALSE',
    }));
}

// ─── Techs ──────────────────────────────────────────────────

function rowToTech(row) {
  return {
    Tech_ID: row[0] || '',
    Full_Name: row[1] || '',
    Email: row[2] || '',
    Phone: row[3] || '',
    PIN: row[4] || '',
    Role: row[5] || '',
    Active: row[6] || 'FALSE',
    Created_At: row[7] || '',
  };
}

async function getAllTechs() {
  const rows = await getRows('Techs');
  if (rows.length <= 1) return [];
  return rows.slice(1).map(rowToTech);
}

async function getTechByName(fullName) {
  const techs = await getAllTechs();
  return techs.find(t => t.Full_Name.toLowerCase() === fullName.toLowerCase()) || null;
}

async function appendTech(techData) {
  const row = [
    techData.Tech_ID || '',
    techData.Full_Name || '',
    techData.Email || '',
    techData.Phone || '',
    techData.PIN || '',
    techData.Role || '',
    techData.Active || 'TRUE',
    techData.Created_At || new Date().toISOString(),
  ];
  await appendRow('Techs', row);
}

// ─── Utility ────────────────────────────────────────────────

function columnToLetter(colIdx) {
  let letter = '';
  let temp = colIdx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

module.exports = {
  SR_COLS,
  SR_HEADERS,
  getAllServiceRequests,
  getServiceRequestById,
  getExistingSrIds,
  appendServiceRequest,
  updateServiceRequestField,
  updateServiceRequestFields,
  findSrRowNumber,
  appendStatusHistory,
  getStatusHistoryBySrId,
  getAllTechs,
  getTechByName,
  appendTech,
  rowToSR,
  columnToLetter,
};
