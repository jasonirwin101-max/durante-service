// Centralized date/time handling for Durante Service.
//
// Background: Railway runs in Europe (UTC+1/+2). Durante is in Eastern Time.
// The office dashboard's <input type="datetime-local"> emits naive strings
// like "2026-05-25T14:00" with no timezone. If Node parses those with
// `new Date()` it uses the server's local TZ (Europe), so what the user
// entered as "2 PM ET" becomes "2 PM Europe" → off by several hours when
// later formatted as ET. Everything here treats naive datetime-local
// strings as ET wall-time, and all rendering forces America/New_York.

const TZ = process.env.TIMEZONE || 'America/New_York';

// Naive: "YYYY-MM-DD[T| ]HH:MM[:SS[.fff]]" with no Z and no ±HH:MM offset.
const NAIVE_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

function parseDate(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return input;
  const s = String(input).trim();
  if (!s) return null;
  // Has explicit TZ (Z or ±HH:MM) — parse as-is.
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // Naive datetime-local — interpret as ET wall time.
  const m = s.match(NAIVE_LOCAL_RE);
  if (m) {
    return etWallTimeToDate(
      Number(m[1]), Number(m[2]), Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0)
    );
  }
  // Fallback — let Date attempt the parse.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Build a Date whose UTC instant corresponds to the given wall-time in TZ.
function etWallTimeToDate(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const partsAsTz = tzPartsOf(new Date(guess));
  const renderedUtc = Date.UTC(
    partsAsTz.year, partsAsTz.month - 1, partsAsTz.day,
    partsAsTz.hour, partsAsTz.minute, partsAsTz.second
  );
  const offset = guess - renderedUtc; // how many ms the TZ is behind UTC at that instant
  return new Date(guess + offset);
}

function tzPartsOf(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl can produce "24" for midnight — normalize.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second || 0),
  };
}

// "2:00 PM 05/25/2026" — used by ETA / Scheduled in SMS and emails.
function formatDateTime(input) {
  const date = parseDate(input);
  if (!date) return input == null ? '' : String(input);
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  });
  const dateStr = date.toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', timeZone: TZ,
  });
  return `${time} ${dateStr}`;
}

// "May 25, 2026" — used for PDFs and rating emails.
function formatDateLong(input) {
  const date = parseDate(input);
  if (!date) return input == null ? '' : String(input);
  return date.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

// "May 25, 2026, 2:00 PM" — used for rating-received emails.
function formatDateTimeLong(input) {
  const date = parseDate(input);
  if (!date) return input == null ? '' : String(input);
  return date.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  });
}

// "May 25, 2:00 PM" — short timestamp for timelines.
function formatTimestampShort(input) {
  const date = parseDate(input);
  if (!date) return input == null ? '' : String(input);
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  });
}

// "05/25/2026 2:00 PM" — used inside Tech_Notes line stamps.
function formatNoteStamp(input) {
  const date = parseDate(input);
  if (!date) return input == null ? '' : String(input);
  const dateStr = date.toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', timeZone: TZ,
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  });
  return `${dateStr} ${timeStr}`;
}

// Normalize any user-supplied date input to an ISO UTC string so we never
// store naive datetime-local strings on the sheet. If input already has a TZ
// it round-trips unchanged.
function toIsoUtc(input) {
  const date = parseDate(input);
  if (!date) return '';
  return date.toISOString();
}

module.exports = {
  TZ,
  parseDate,
  toIsoUtc,
  formatDateTime,
  formatDateLong,
  formatDateTimeLong,
  formatTimestampShort,
  formatNoteStamp,
};
