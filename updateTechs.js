/**
 * One-time script to update the Techs sheet with the current team.
 * Usage: node updateTechs.js
 *
 * Keeps existing rows if tech name matches (updates email/role/active).
 * Adds new rows for techs not already in the sheet.
 * Does not touch PIN column — PINs set up separately via setupPins.js.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { google } = require('googleapis');

// Force unbuffered output
process.stdout.write('Script starting...\n');

const TECHS = [
  { name: 'Eddie Rivera',         email: 'erivera@duranteequip.com',         role: 'Tech' },
  { name: 'Nestor Balmaseda',     email: 'nbalmaseda@duranteequip.com',      role: 'Tech' },
  { name: 'Angel Diez Leon',      email: 'adiezleon@duranteequip.com',       role: 'Tech' },
  { name: 'Marcos Cuenca Diaz',   email: 'mcuencadiaz@duranteequip.com',     role: 'Tech' },
  { name: 'Oduardo Hernandez',    email: 'ohernandez@duranteequip.com',      role: 'Tech' },
  { name: 'Yandry Leon Diaz',     email: 'yleondiaz@duranteequip.com',       role: 'Tech' },
  { name: 'Rolando Mendez',       email: 'rmendez@duranteequip.com',         role: 'Tech' },
  { name: 'Julie Moreno Gomez',   email: 'jmorenogomez@duranteequip.com',    role: 'Tech' },
  { name: 'Jorge Reyes',          email: 'jreyes@duranteequip.com',          role: 'Tech' },
  { name: 'Brello Jimenez Gomez', email: 'bjimenezgomez@duranteequip.com',   role: 'Tech' },
];

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
  const sid = process.env.GOOGLE_SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: 'Techs!A:H',
  });
  const rows = res.data.values || [];

  for (const tech of TECHS) {
    const existingIdx = rows.findIndex((r, i) =>
      i > 0 && r[1] && r[1].toLowerCase() === tech.name.toLowerCase()
    );

    if (existingIdx > -1) {
      const rowNum = existingIdx + 1;
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `Techs!C${rowNum}`, values: [[tech.email]] },
            { range: `Techs!F${rowNum}`, values: [[tech.role]] },
            { range: `Techs!G${rowNum}`, values: [['TRUE']] },
          ],
        },
      });
      console.log(`Updated: ${tech.name} (row ${rowNum})`);
    } else {
      const maxId = rows.slice(1).reduce((max, r) => {
        const num = parseInt((r[0] || '').replace('TECH-', ''), 10);
        return num > max ? num : max;
      }, 0);
      const techId = `TECH-${String(maxId + 1).padStart(3, '0')}`;

      await sheets.spreadsheets.values.append({
        spreadsheetId: sid,
        range: 'Techs!A:A',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[techId, tech.name, tech.email, '', '', tech.role, 'TRUE', new Date().toISOString()]],
        },
      });

      const updated = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: 'Techs!A:H' });
      rows.length = 0;
      rows.push(...(updated.data.values || []));

      console.log(`Added: ${tech.name} (${techId})`);
    }
  }

  console.log('\nDone. PINs not modified — use setupPins.js to set PINs.');
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
