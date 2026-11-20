// people.js — the Service app's connection to the Durante People page.
//
// The People page decides who is on the shared Techs tab of the Service
// Request sheet (used by this app and Driver Photos), with their role and
// the Yes/No columns. This keeps the Techs tab in step: adds new people,
// updates names, emails, roles and flags, and switches off (Active FALSE)
// anyone removed. Phone numbers, POR_Operator and other columns stay as they
// are (a blank phone is filled from the People page).
//
//   People list                      -> Techs tab
//   Service: Managers/Techs/Office/Drivers -> Role, Active TRUE
//   Service: Dashboard access        -> Dashboard_Access
//   Service: Submit form names       -> Show_In_Submit
//   Service: New SR text alerts      -> Receives_SR_Alerts
//   Driver Photos: Drivers / Office  -> Photos_Access TRUE / Office
//
// PINs: the People page PIN works; once someone has one, their old PIN
// stops working. Email lists: escalation and customer rating emails.
// Without PEOPLE_API_URL and PEOPLE_APP_KEY the app works exactly as before.
const people = require('./peopleClient');

const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
const derive = (full) => {
  const parts = String(full || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1]}@duranteequip.com` : '';
};
const yes = (v) => lc(v) === 'true';

const ESCALATION = people.liveEmails('svc.escalation', [
  'eddie.rivera@duranteequip.com',
  'nbalmaseda@duranteequip.com',
  'jirwin@duranteequip.com',
]);
const RATING = people.liveEmails('svc.rate_alerts', ['service@duranteequip.com', 'azunic@duranteequip.com']);

// Role lists, highest first, then the lists that only set a column.
const ROLE_LISTS = [
  ['svc.managers', 'Manager'],
  ['svc.techs', 'Tech'],
  ['svc.office', 'Office'],
  ['svc.drivers', 'Driver'],
];
const KNOWN_ROLES = ['Manager', 'Tech', 'Driver'];

async function techRows() {
  const { getRows } = require('./sheets');
  const rows = await getRows('Techs');
  const header = (rows[0] || []).map((h) => String(h || '').trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const recs = rows.slice(1).map((r, i) => ({ n: i + 2, raw: r, get: (h) => (col[h] == null ? '' : String(r[col[h]] == null ? '' : r[col[h]]).trim()) }));
  return { header, col, recs };
}

// Today's Techs tab, for the first connection to the People page.
function current(test) {
  return async () => {
    const { recs } = await techRows();
    return recs
      .filter((r) => yes(r.get('Active')) && test(r))
      .map((r) => ({ name: r.get('Full_Name'), email: r.get('Email') || derive(r.get('Full_Name')) }))
      .filter((m) => m.name && m.email);
  };
}
people.registerLogins('svc.managers', 'Manager', current((r) => r.get('Role') === 'Manager'));
people.registerLogins('svc.techs', 'Tech', current((r) => r.get('Role') === 'Tech'));
people.registerLogins('svc.office', 'Office', current((r) => !KNOWN_ROLES.includes(r.get('Role'))));
people.registerLogins('svc.drivers', 'Driver', current((r) => r.get('Role') === 'Driver'));
people.registerLogins('svc.dashboard_access', null, current((r) => yes(r.get('Dashboard_Access'))));
people.registerLogins('svc.submit_names', null, current((r) => yes(r.get('Show_In_Submit'))));
people.registerLogins('svc.sr_alerts', null, current((r) => yes(r.get('Receives_SR_Alerts'))));
people.registerLogins('photos.drivers', 'Driver', current((r) => ['true', 'driver'].includes(lc(r.get('Photos_Access')))));
people.registerLogins('photos.office', 'Office', current((r) => lc(r.get('Photos_Access')) === 'office'));

function managing() {
  const ll = people.loginLists();
  return !!(people.enabled() && ll && ll.length && ll.every((l) => l.initialized));
}
let activeEmails = null;
function isActiveLogin(email) {
  if (!managing() || !activeEmails || !email) return true;
  return activeEmails.has(lc(email));
}

async function syncTechsTab(ll) {
  if (!ll || !ll.length || ll.some((l) => !l.initialized)) return;
  const L = Object.fromEntries(ll.map((l) => [l.key, l]));
  const on = (key, e) => (L[key] ? L[key].members.some((m) => lc(m.email) === e) : false);

  // Everyone who belongs on the Techs tab (any of these lists).
  const want = new Map();
  for (const l of ll) {
    for (const m of l.members) {
      if (!m.email || m.kind === 'mailbox') continue;
      if (!want.has(lc(m.email))) want.set(lc(m.email), { name: m.name, email: m.email, phone: m.phone || '' });
    }
  }
  if (!want.size) {
    console.warn('[people] every Techs list is empty; not changing the Techs tab (safety).');
    return;
  }
  activeEmails = new Set(want.keys());

  const sheets = require('./sheets');
  const { header, col, recs } = await techRows();
  for (const h of ['Tech_ID', 'Full_Name', 'Email', 'Role', 'Active']) {
    if (col[h] == null) throw new Error(`Techs tab has no ${h} column`);
  }
  const updates = [];
  const set = (r, h, v) => {
    if (col[h] == null) return false;
    if (r.get(h) === v) return false;
    updates.push({ range: `${sheets.columnToLetter(col[h])}${r.n}`, value: v });
    return true;
  };
  const used = new Set();
  let added = 0, changed = 0, off = 0;
  let maxId = recs.reduce((mx, r) => Math.max(mx, parseInt(String(r.get('Tech_ID')).replace('TECH-', ''), 10) || 0), 0);
  const appends = [];

  for (const [e, w] of want) {
    let r = recs.find((x) => lc(x.get('Email')) === e);
    if (!r) r = recs.find((x) => !used.has(x.n) && lc(x.get('Full_Name')) === lc(w.name));
    const roleList = ROLE_LISTS.find(([k]) => on(k, e));
    const photos = on('photos.office', e) ? 'Office' : on('photos.drivers', e) ? 'driver' : '';
    const flags = {
      Dashboard_Access: on('svc.dashboard_access', e) ? 'TRUE' : 'FALSE',
      Show_In_Submit: on('svc.submit_names', e) ? 'TRUE' : 'FALSE',
      Receives_SR_Alerts: on('svc.sr_alerts', e) ? 'TRUE' : 'FALSE',
    };
    if (r) {
      used.add(r.n);
      const cur = r.get('Role');
      const role = roleList ? roleList[1] : cur || (photos === 'driver' ? 'Driver' : 'Office');
      let did = false;
      did = set(r, 'Full_Name', w.name) || did;
      did = set(r, 'Email', w.email) || did;
      did = set(r, 'Role', role) || did;
      did = set(r, 'Active', 'TRUE') || did;
      if (!r.get('Phone') && w.phone) did = set(r, 'Phone', w.phone) || did;
      for (const [h, v] of Object.entries(flags)) did = set(r, h, v) || did;
      // Photos_Access: keep "TRUE" or "Driver" as written; Office / blank as the lists say.
      const curP = lc(r.get('Photos_Access'));
      const wantP = photos === 'driver' ? (['true', 'driver'].includes(curP) ? r.get('Photos_Access') : 'TRUE') : photos;
      did = set(r, 'Photos_Access', wantP) || did;
      if (did) changed++;
    } else {
      maxId++;
      const row = new Array(header.length).fill('');
      const put = (h, v) => { if (col[h] != null) row[col[h]] = v; };
      put('Tech_ID', `TECH-${String(maxId).padStart(3, '0')}`);
      put('Full_Name', w.name);
      put('Email', w.email);
      put('Phone', w.phone);
      put('Role', roleList ? roleList[1] : photos === 'driver' ? 'Driver' : 'Office');
      put('Active', 'TRUE');
      put('Created_At', new Date().toISOString());
      for (const [h, v] of Object.entries(flags)) put(h, v);
      put('Photos_Access', photos === 'driver' ? 'TRUE' : photos);
      appends.push(row);
      added++;
    }
  }
  for (const r of recs) {
    if (used.has(r.n) || !yes(r.get('Active'))) continue;
    if (want.has(lc(r.get('Email')))) continue;
    set(r, 'Active', 'FALSE');
    off++;
  }
  // Fewer Google calls: one batch for all changed cells.
  for (let i = 0; i < updates.length; i += 400) await sheets.batchUpdateCells('Techs', updates.slice(i, i + 400));
  for (const row of appends) await sheets.appendRow('Techs', row);
  if (added || changed || off) console.log(`[people] Techs tab: ${added} added, ${changed} updated, ${off} switched off`);
}
people.onSync(syncTechsTab);

module.exports = {
  start: () => people.start({ app: 'service' }),
  ESCALATION,
  RATING,
  managing,
  isActiveLogin,
  checkPersonPin: people.checkPersonPin,
};
