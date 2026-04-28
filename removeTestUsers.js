/**
 * One-off: physically delete test rows from the Techs sheet.
 * Usage: node removeTestUsers.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { google } = require('googleapis');

const TARGETS = ['Test NewTech', 'Test New'];

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const sid = process.env.GOOGLE_SPREADSHEET_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid });
  const tab = meta.data.sheets.find(s => s.properties.title === 'Techs');
  if (!tab) throw new Error('Techs tab not found');
  const sheetId = tab.properties.sheetId;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: 'Techs!A:H',
  });
  const rows = res.data.values || [];

  const toDelete = [];
  for (let i = 1; i < rows.length; i++) {
    const fullName = (rows[i][1] || '').trim();
    if (TARGETS.includes(fullName)) {
      toDelete.push({ rowIndex: i, name: fullName });
    }
  }

  if (toDelete.length === 0) {
    console.log('No matching test users found.');
    return;
  }

  console.log(`Found ${toDelete.length} row(s) to delete:`);
  toDelete.forEach(t => console.log(`  sheet row ${t.rowIndex + 1}: ${t.name}`));

  toDelete.sort((a, b) => b.rowIndex - a.rowIndex);
  const requests = toDelete.map(t => ({
    deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: t.rowIndex, endIndex: t.rowIndex + 1 },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid,
    requestBody: { requests },
  });
  console.log(`Deleted ${toDelete.length} row(s) from Techs sheet.`);
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
