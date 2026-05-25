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
  Rating_Submitted_At: 35,
  Rating_Comments: 36,
  Tech_Notes_Original: 37,
  SMS_Consent: 38,
  Internal_Notes_Original: 39,
  POR_Work_Order: 40,
  Clock_Start: 41,
  Clock_Paused_At: 42,
  Clock_Total_Seconds: 43,
  Clock_Status: 44,
  Total_Service_Time: 45,
  Approval_Token: 46,
  Approval_Token_Created_At: 47,
  Approval_Token_Used: 48,
  Phone_Resolution_Notes: 49,
  Resolved_By: 50,
};

const SR_HEADERS = Object.keys(SR_COLS);

// Column mappings for StatusHistory sheet
const SH_HEADERS = [
  'SR_ID', 'Status', 'Notes', 'Updated_By', 'Role',
  'Timestamp', 'Customer_Notified', 'Submitter_Notified', 'SMS_Sent', 'Email_Sent',
];

// Column mappings for Techs sheet. Show_In_Submit drives the public submit
// form's "Your Name" dropdown — flip to TRUE in the sheet to expose someone
// without a code change. ensureTechHeaders() creates the column on startup
// if it doesn't exist and seeds Jason Irwin to TRUE / everyone else FALSE.
const TECH_HEADERS = [
  'Tech_ID', 'Full_Name', 'Email', 'Phone', 'PIN', 'Role', 'Active', 'Created_At',
  'Show_In_Submit',
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
const COMPLETED_SHEET = 'CompletedRequests';

let _sheetIdCache = {};
let _completedTabReady = false;

async function getTabId(title) {
  if (_sheetIdCache[title] !== undefined) return _sheetIdCache[title];
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  for (const tab of meta.data.sheets) {
    _sheetIdCache[tab.properties.title] = tab.properties.sheetId;
  }
  return _sheetIdCache[title];
}

async function ensureCompletedTab() {
  if (_completedTabReady) return;
  const sheets = getSheets();
  let id = await getTabId(COMPLETED_SHEET);
  if (id === undefined) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: COMPLETED_SHEET } } }] },
    });
    id = res.data.replies[0].addSheet.properties.sheetId;
    _sheetIdCache[COMPLETED_SHEET] = id;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${COMPLETED_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [SR_HEADERS] },
    });
    console.log(`[sheets] Created ${COMPLETED_SHEET} tab with headers`);
  }
  _completedTabReady = true;
}

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
  const found = all.find(sr => sr.SR_ID === srId);
  if (found) return found;
  // Fall back to archived completed requests so /track and /requests/:id keep working
  return getCompletedRequestById(srId);
}

async function getAllCompletedRequests() {
  await ensureCompletedTab();
  const rows = await getRows(COMPLETED_SHEET);
  if (rows.length <= 1) return [];
  return rows.slice(1).map(rowToSR);
}

async function getCompletedRequestById(srId) {
  const all = await getAllCompletedRequests();
  return all.find(sr => sr.SR_ID === srId) || null;
}

async function writeCompletedRequest(srData) {
  await ensureCompletedTab();
  const row = new Array(SR_HEADERS.length).fill('');
  for (const [key, idx] of Object.entries(SR_COLS)) {
    if (srData[key] !== undefined) row[idx] = srData[key];
  }
  await appendRow(COMPLETED_SHEET, row);
}

async function deleteCompletedRequest(srId) {
  await ensureCompletedTab();
  const rows = await getRows(COMPLETED_SHEET);
  let rowNum = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === srId) { rowNum = i + 1; break; }
  }
  if (!rowNum) return false;
  const sheets = getSheets();
  const sheetId = await getTabId(COMPLETED_SHEET);
  if (sheetId === undefined) throw new Error(`${COMPLETED_SHEET} tab not found`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    },
  });
  return true;
}

// Move an archived SR back to the active ServiceRequests sheet. Preserves
// every field; the caller is responsible for any column resets
// (e.g. clearing Service_Completed). Used by the Reopen flow.
async function moveCompletedToActive(srId) {
  await ensureCompletedTab();
  const all = await getAllCompletedRequests();
  const sr = all.find(r => r.SR_ID === srId);
  if (!sr) throw new Error(`SR ${srId} not found in ${COMPLETED_SHEET}`);
  await appendServiceRequest(sr);
  await deleteCompletedRequest(srId);
  return sr;
}

// Ensure the Techs sheet has every column we know about. When we add a new
// optional column (e.g. Show_In_Submit) we both extend the header row AND
// seed the column for existing rows so the feature doesn't read as empty.
// Idempotent: if the header is already present we do nothing.
async function ensureTechHeaders() {
  const sheets = getSheets();
  try {
    const headerResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Techs!1:1',
    });
    const existing = (headerResp.data.values && headerResp.data.values[0]) || [];
    if (existing.length >= TECH_HEADERS.length) return;

    const missing = TECH_HEADERS.slice(existing.length);
    const startCol = columnToLetter(existing.length);
    const endCol = columnToLetter(TECH_HEADERS.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Techs!${startCol}1:${endCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [missing] },
    });
    console.log(`[sheets] Techs: extended header row with ${missing.length} new columns:`, missing.join(','));

    // One-time migration for Show_In_Submit: only seed when the column is
    // brand-new. Jason Irwin → TRUE, everyone else → FALSE. Future column
    // additions reuse this same shape by adding cases below.
    if (missing.includes('Show_In_Submit')) {
      await seedShowInSubmitColumn();
    }
  } catch (err) {
    console.error('[sheets] ensureTechHeaders failed:', err.message);
  }
}

async function seedShowInSubmitColumn() {
  const sheets = getSheets();
  const rows = await getRows('Techs');
  if (rows.length <= 1) {
    console.log('[sheets] Show_In_Submit seed: no tech rows to seed');
    return;
  }
  const colIdx = TECH_HEADERS.indexOf('Show_In_Submit');
  const colLetter = columnToLetter(colIdx);
  const values = [];
  let jasonRow = null;
  for (let i = 1; i < rows.length; i++) {
    const fullName = (rows[i][1] || '').trim().toLowerCase();
    const isJason = fullName === 'jason irwin';
    if (isJason) jasonRow = i + 1;
    values.push([isJason ? 'TRUE' : 'FALSE']);
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Techs!${colLetter}2:${colLetter}${rows.length}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  console.log(`[sheets] Show_In_Submit seeded for ${values.length} rows; Jason Irwin set TRUE (row ${jasonRow || 'not found'}), all others FALSE`);
}

// Ensure the header row of each sheet contains every column we know about.
// Sheets API has no schema concept — writers just produce cells — but humans
// reading the tab need labels in row 1, so we extend it when SR_COLS grows.
async function ensureSheetHeaders() {
  const sheets = getSheets();
  for (const tab of ['ServiceRequests', COMPLETED_SHEET]) {
    try {
      if (tab === COMPLETED_SHEET) await ensureCompletedTab();
      const headerResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab}!1:1`,
      });
      const existing = (headerResp.data.values && headerResp.data.values[0]) || [];
      if (existing.length >= SR_HEADERS.length) continue;
      const missing = SR_HEADERS.slice(existing.length);
      const startCol = columnToLetter(existing.length);
      const endCol = columnToLetter(SR_HEADERS.length - 1);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab}!${startCol}1:${endCol}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [missing] },
      });
      console.log(`[sheets] ${tab}: extended header row with ${missing.length} new columns:`, missing.join(','));
    } catch (err) {
      console.error(`[sheets] ensureSheetHeaders failed for ${tab}:`, err.message);
    }
  }
}

async function deleteServiceRequest(srId) {
  const rowNum = await findSrRowNumber(srId);
  if (!rowNum) return false;
  const sheets = getSheets();
  const sheetId = await getTabId('ServiceRequests');
  if (sheetId === undefined) throw new Error('ServiceRequests tab not found');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    },
  });
  return true;
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

// Resolve which sheet currently holds the row for srId. Active SRs live in
// ServiceRequests; completed SRs were moved to CompletedRequests by the
// archive step in the status-change flow. Callers that need to write to a
// row regardless of whether it's been archived (e.g. customer rating after
// completion) should use this instead of findSrRowNumber.
async function findRequestRow(srId) {
  const activeRows = await getRows('ServiceRequests');
  for (let i = 1; i < activeRows.length; i++) {
    if (activeRows[i][0] === srId) return { sheetName: 'ServiceRequests', rowNum: i + 1 };
  }
  await ensureCompletedTab();
  const completedRows = await getRows(COMPLETED_SHEET);
  for (let i = 1; i < completedRows.length; i++) {
    if (completedRows[i][0] === srId) return { sheetName: COMPLETED_SHEET, rowNum: i + 1 };
  }
  return null;
}

async function updateRequestFields(srId, fields) {
  const loc = await findRequestRow(srId);
  if (!loc) throw new Error(`SR ${srId} not found in ServiceRequests or ${COMPLETED_SHEET}`);
  for (const [field, value] of Object.entries(fields)) {
    const colIdx = SR_COLS[field];
    if (colIdx === undefined) continue;
    const colLetter = columnToLetter(colIdx);
    await updateCell(loc.sheetName, `${colLetter}${loc.rowNum}`, value);
  }
  return loc;
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
    Show_In_Submit: row[8] || 'FALSE',
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
    techData.Show_In_Submit || 'FALSE',
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
  getAllCompletedRequests,
  getCompletedRequestById,
  writeCompletedRequest,
  deleteServiceRequest,
  getExistingSrIds,
  appendServiceRequest,
  updateServiceRequestField,
  updateServiceRequestFields,
  findSrRowNumber,
  findRequestRow,
  updateRequestFields,
  deleteCompletedRequest,
  moveCompletedToActive,
  ensureSheetHeaders,
  ensureTechHeaders,
  appendStatusHistory,
  getStatusHistoryBySrId,
  getAllTechs,
  getTechByName,
  appendTech,
  rowToSR,
  columnToLetter,
};
