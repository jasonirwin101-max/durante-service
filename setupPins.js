/**
 * One-time setup script — hash and write PINs to the Techs sheet.
 *
 * Usage:  node setupPins.js
 *
 * Edit the USERS array below with real PINs before running.
 * PINs are bcrypt-hashed before writing — the plain text is never stored.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');

// ─── EDIT THESE BEFORE RUNNING ──────────────────────────────
const USERS = [
  { name: 'Jason Irwin',       email: 'jirwin@duranteequip.com',      phone: '+19543617368', role: 'Office', pin: '1234' },
  { name: 'Eddie Rivera',      email: 'erivera@duranteequip.com',     phone: '',              role: 'Tech',   pin: '5678' },
  { name: 'Nestor Balmaseda',  email: 'nbalmaseda@duranteequip.com',  phone: '',              role: 'Tech',   pin: '9012' },
];
// ─────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function run() {
  const sheets = await getSheets();

  // Read existing Techs rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Techs!A:H',
  });
  const rows = res.data.values || [];
  // rows[0] = header, data starts at row index 1

  for (const user of USERS) {
    const hash = await bcrypt.hash(user.pin, 10);

    // Find existing row by name (column B = index 1)
    const existingIdx = rows.findIndex((r, i) => i > 0 && r[1] && r[1].toLowerCase() === user.name.toLowerCase());

    if (existingIdx > -1) {
      // Update PIN (col E), Role (col F), Email (col C), Phone (col D)
      const rowNum = existingIdx + 1; // Sheets is 1-indexed
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `Techs!C${rowNum}`, values: [[user.email]] },
            { range: `Techs!D${rowNum}`, values: [[user.phone]] },
            { range: `Techs!E${rowNum}`, values: [[hash]] },
            { range: `Techs!F${rowNum}`, values: [[user.role]] },
            { range: `Techs!G${rowNum}`, values: [['TRUE']] },
          ],
        },
      });
      console.log(`Updated: ${user.name} (row ${rowNum}) — Role: ${user.role}`);
    } else {
      // Generate next Tech_ID
      const maxId = rows.slice(1).reduce((max, r) => {
        const num = parseInt((r[0] || '').replace('TECH-', ''), 10);
        return num > max ? num : max;
      }, 0);
      const techId = `TECH-${String(maxId + 1).padStart(3, '0')}`;

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Techs!A:A',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[techId, user.name, user.email, user.phone, hash, user.role, 'TRUE', new Date().toISOString()]],
        },
      });

      // Re-read so subsequent users get the right Tech_ID
      const updated = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Techs!A:H' });
      rows.length = 0;
      rows.push(...(updated.data.values || []));

      console.log(`Added:   ${user.name} (${techId}) — Role: ${user.role}`);
    }
  }

  console.log('\nDone. PINs are hashed — plain text was not stored.');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
