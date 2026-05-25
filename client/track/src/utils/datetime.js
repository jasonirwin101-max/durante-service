// Client-side date/time helpers — mirror server/utils/datetime.js.
// All output rendered in Eastern Time; naive datetime-local strings
// (e.g. "2026-05-25T14:00") are treated as ET wall-time on input so
// stale sheet values pre-dating the server-side normalization still
// display correctly.

const TZ = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TIMEZONE) || 'America/New_York'

const NAIVE_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

export function parseDate(input) {
  if (input == null || input === '') return null
  if (input instanceof Date) return input
  const s = String(input).trim()
  if (!s) return null
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  const m = s.match(NAIVE_LOCAL_RE)
  if (m) {
    return etWallTimeToDate(
      Number(m[1]), Number(m[2]), Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0)
    )
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function etWallTimeToDate(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const partsAsTz = tzPartsOf(new Date(guess))
  const renderedUtc = Date.UTC(
    partsAsTz.year, partsAsTz.month - 1, partsAsTz.day,
    partsAsTz.hour, partsAsTz.minute, partsAsTz.second
  )
  const offset = guess - renderedUtc
  return new Date(guess + offset)
}

function tzPartsOf(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const map = {}
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second || 0),
  }
}

// "2:00 PM 05/25/2026"
export function formatDateTime(input) {
  const date = parseDate(input)
  if (!date) return input == null ? '' : String(input)
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  })
  const dateStr = date.toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', timeZone: TZ,
  })
  return `${time} ${dateStr}`
}

// "May 25, 2026"
export function formatDateLong(input) {
  const date = parseDate(input)
  if (!date) return input == null ? '' : String(input)
  return date.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ,
  })
}

// "May 25" — short month/day
export function formatDateShort(input) {
  const date = parseDate(input)
  if (!date) return input == null ? '' : String(input)
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ,
  })
}

// "May 25, 2:00 PM"
export function formatTimestampShort(input) {
  const date = parseDate(input)
  if (!date) return input == null ? '' : String(input)
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  })
}

// "2:00 PM"
export function formatTime(input) {
  const date = parseDate(input)
  if (!date) return input == null ? '' : String(input)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  })
}

// Convert an <input type="datetime-local"> value (ET wall-time) to a
// proper ISO UTC string before sending to the server.
export function dateTimeLocalToIso(local) {
  if (!local) return ''
  const d = parseDate(local)
  if (!d || isNaN(d.getTime())) return local
  return d.toISOString()
}
