// peopleClient.js — connects this app to the Durante People service, the one
// place to add and remove staff for every app.
//
//   PEOPLE_API_URL   e.g. https://durante-people-production.up.railway.app
//   PEOPLE_APP_KEY   the People service's PEOPLE_APP_KEY
// When either is missing the app runs exactly as before (built-in lists).
//
// What it does:
//  - Email lists and name lists: each starts as today's value (env variable
//    or built-in default). The first time a list is missing on the People
//    page, this app sends its current value ("adopt"), so nothing changes on
//    day one. After that the People page wins. Arrays are updated IN PLACE,
//    so code holding a reference always sees the current members.
//  - Logins: registerLogins() lists who can log in today (adopted the same
//    way). onSync() hands the current login lists to the app so it can add,
//    update or switch off its own users. verifyPin() asks the People service
//    whose PIN this is (the PIN itself is never stored there or here).
//  - Refreshes every 2 minutes; the last good copy is saved in this app's
//    database (table people_cache) so a restart while the People service is
//    down still uses the latest lists.
"use strict";

const URL = String(process.env.PEOPLE_API_URL || "").replace(/\/$/, "");
const KEY = process.env.PEOPLE_APP_KEY || "";
const REFRESH_MS = Number(process.env.PEOPLE_REFRESH_MS || 2 * 60 * 1000);

let APP = "";
let dbQuery = null;
let data = null;
const lists = new Map(); // key -> { kind, arr, fallback }
const logins = new Map(); // key -> { role, current: async () => [{ name, email }] }
const listeners = [];
const status = { enabled: !!(URL && KEY), lastOkAt: null, lastError: null, source: "defaults" };

const derive = (full) => {
  const parts = String(full || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1]}@duranteequip.com` : "";
};

function liveEmails(key, fallback) {
  const arr = [...fallback];
  lists.set(key, { kind: "emails", arr, fallback: [...fallback] });
  return arr;
}
function liveNames(key, fallback) {
  const arr = [...fallback];
  lists.set(key, { kind: "names", arr, fallback: [...fallback] });
  return arr;
}
// current: async function returning today's users for this role [{ name, email }]
function registerLogins(key, role, current) {
  logins.set(key, { role, current });
}
function onSync(fn) {
  listeners.push(fn);
}
function enabled() {
  return status.enabled;
}
function peopleStatus() {
  return { ...status, lists: Object.fromEntries([...lists].map(([k, v]) => [k, v.arr.length])) };
}

// Login lists as the People page has them: [{ key, role, initialized, members }]
// in priority order (first = highest role).
function loginLists() {
  if (!data) return null;
  return [...logins.keys()].map((key) => {
    const l = (data.lists && data.lists[key]) || {};
    return { key, role: logins.get(key).role, initialized: !!l.initialized, members: l.members || [] };
  });
}

// True when this person has a PIN on the People page (their old app PIN no
// longer works once they do).
function hasPeoplePin(email) {
  if (!data || !email) return false;
  const e = String(email).toLowerCase();
  for (const l of Object.values(data.lists || {})) {
    for (const m of l.members || []) if (m.hasPin && String(m.email || "").toLowerCase() === e) return true;
  }
  return false;
}

async function call(path, opts = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-App-Key": KEY, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`People service ${res.status}`);
  return res.json();
}

// { status: "match", person: { name, email, porEmployeeId }, role }
// { status: "nomatch" } | { status: "off" } (not connected / PINs off) | { status: "error" }
async function verifyPin(pin) {
  if (!status.enabled) return { status: "off" };
  try {
    const r = await call("/api/app/login", { method: "POST", body: JSON.stringify({ app: APP, pin }) });
    if (r.pinEnabled === false) return { status: "off" };
    return r.match ? { status: "match", person: r.person, role: r.role } : { status: "nomatch" };
  } catch (e) {
    console.error("[people] PIN check failed, using this app's own PINs:", e.message);
    return { status: "error" };
  }
}

// One People list as last received: { initialized, kind, role, members } or null.
function list(key) {
  return (data && data.lists && data.lists[key]) || null;
}

// Name + PIN logins (apps where people pick their name first). legacyOk is
// an async function that checks the app's own (old) PIN for this person.
// - Their People PIN works.
// - Once they have a People PIN, their old PIN stops working (unless the
//   People service can't be reached).
async function checkPersonPin(pin, email, legacyOk) {
  const r = await verifyPin(pin);
  const mine = (e) => !!e && !!email && String(e).toLowerCase() === String(email).toLowerCase();
  if (r.status === "match" && mine(r.person.email)) return { ok: true, viaPeople: true };
  if (r.status !== "error" && hasPeoplePin(email)) return { ok: false };
  return { ok: !!(await legacyOk()), viaPeople: false };
}

function apply(d) {
  data = d;
  for (const [key, l] of lists) {
    const remote = d && d.lists && d.lists[key];
    if (!remote || !remote.initialized) continue;
    const vals =
      l.kind === "names"
        ? remote.members.filter((m) => m.kind !== "mailbox").map((m) => m.name)
        : remote.members.map((m) => m.email).filter(Boolean);
    l.arr.splice(0, l.arr.length, ...[...new Set(vals)]);
  }
}

async function saveCache(d) {
  if (!dbQuery) return;
  try {
    await dbQuery(
      `INSERT INTO people_cache (key, value, saved_at) VALUES ('lists', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, saved_at = now()`,
      [JSON.stringify(d)]
    );
  } catch (e) {
    console.error("[people] cache save failed:", e.message);
  }
}

async function runListeners() {
  for (const fn of listeners) {
    try {
      await fn(loginLists());
    } catch (e) {
      console.error("[people] sync step failed:", e.message);
    }
  }
}

async function refresh() {
  if (!status.enabled) return;
  try {
    const d = await call(`/api/app/lists?app=${encodeURIComponent(APP)}`);
    let adopted = false;
    // Logins and name lists first (they carry real names), then email lists.
    for (const [key, l] of logins) {
      if (d.lists && d.lists[key] && d.lists[key].initialized) continue;
      const members = (await l.current()).filter((m) => m.email);
      await call(`/api/app/lists/${encodeURIComponent(key)}/adopt`, { method: "POST", body: JSON.stringify({ app: APP, members }) });
      adopted = true;
    }
    for (const [key, l] of lists) {
      if (d.lists && d.lists[key] && d.lists[key].initialized) continue;
      const members =
        l.kind === "names" ? l.fallback.map((name) => ({ name, email: derive(name) })) : l.fallback.map((email) => ({ email }));
      await call(`/api/app/lists/${encodeURIComponent(key)}/adopt`, { method: "POST", body: JSON.stringify({ app: APP, members }) });
      adopted = true;
    }
    const final = adopted ? await call(`/api/app/lists?app=${encodeURIComponent(APP)}`) : d;
    apply(final);
    status.lastOkAt = new Date().toISOString();
    status.lastError = null;
    status.source = "people-service";
    await saveCache(final);
    await runListeners();
  } catch (e) {
    if (status.lastError !== e.message) console.error(`[people] refresh failed (keeping current lists): ${e.message}`);
    status.lastError = e.message;
  }
}

// app: this app's key on the People page; query: a pg query function (text, values)
async function start({ app, query }) {
  APP = app;
  dbQuery = query || null;
  if (!status.enabled) {
    console.log("[people] PEOPLE_API_URL / PEOPLE_APP_KEY not set: using built-in lists and env variables.");
    return;
  }
  if (dbQuery) {
    try {
      await dbQuery(`CREATE TABLE IF NOT EXISTS people_cache (key TEXT PRIMARY KEY, value TEXT, saved_at TIMESTAMPTZ)`);
      const { rows } = await dbQuery(`SELECT value FROM people_cache WHERE key = 'lists'`);
      if (rows[0] && rows[0].value) {
        apply(JSON.parse(rows[0].value));
        status.source = "saved-copy";
      }
    } catch (e) {
      console.error("[people] saved copy not loaded:", e.message);
    }
  }
  await refresh();
  const t = setInterval(refresh, REFRESH_MS);
  if (t.unref) t.unref();
  console.log(`[people] on: lists from ${URL} (source: ${status.source}), refresh every ${Math.round(REFRESH_MS / 1000)}s`);
}

module.exports = { start, refresh, liveEmails, liveNames, registerLogins, onSync, verifyPin, checkPersonPin, hasPeoplePin, loginLists, list, enabled, peopleStatus };
