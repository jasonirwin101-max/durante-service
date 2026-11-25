/**
 * One-time script to update the Techs sheet with the current team.
 * Usage: cd server && node ../updateTechs.js
 *
 * Updates existing rows if tech name matches, adds new rows otherwise.
 * Does not touch PIN column — use setupPins.js for PINs.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const path = require('path');
const sheets = require(path.join(__dirname, 'server', 'services', 'sheets'));
const { google } = require('googleapis');

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

function getSheetsClient() {
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
  process.stdout.write('Loading existing techs...\n');
  const existing = await sheets.getAllTechs();
  process.stdout.write(`Found ${existing.length} existing techs\n\n`);

  const sid = process.env.GOOGLE_SPREADSHEET_ID;
  const client = getSheetsClient();

  // Compute next TECH-XXX ID
  let nextId = existing.reduce((max, t) => {
    const n = parseInt((t.Tech_ID || '').replace('TECH-', ''), 10);
    return n > max ? n : max;
  }, 0) + 1;

  for (const tech of TECHS) {
    const match = existing.find(t => t.Full_Name.toLowerCase() === tech.name.toLowerCase());

    if (match) {
      // Find row number — rows are 1-indexed, data starts at row 2
      const rowIdx = existing.indexOf(match);
      const rowNum = rowIdx + 2;
      await client.spreadsheets.values.batchUpdate({
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
      process.stdout.write(`Updated: ${tech.name} (row ${rowNum})\n`);
    } else {
      const techId = `TECH-${String(nextId).padStart(3, '0')}`;
      nextId++;
      await sheets.appendTech({
        Tech_ID: techId,
        Full_Name: tech.name,
        Email: tech.email,
        Phone: '',
        PIN: '',
        Role: tech.role,
        Active: 'TRUE',
        Created_At: new Date().toISOString(),
      });
      process.stdout.write(`Added:   ${tech.name} (${techId})\n`);
    }
  }

  process.stdout.write('\nDone. PINs not touched.\n');
}

run().catch(err => {
  process.stderr.write('ERROR: ' + err.message + '\n');
  process.exit(1);
});
