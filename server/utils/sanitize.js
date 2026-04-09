/**
 * Strip HTML tags and common script injection patterns from a string.
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '')          // Strip HTML tags
    .replace(/javascript:/gi, '')      // Strip javascript: protocol
    .replace(/on\w+\s*=/gi, '')        // Strip event handlers (onclick=, etc.)
    .replace(/data:\s*text\/html/gi, '') // Strip data:text/html
    .trim();
}

/**
 * Recursively sanitize all string values in an object.
 */
function sanitizeObject(obj) {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      clean[key] = sanitizeObject(value);
    }
    return clean;
  }
  return obj;
}

module.exports = { sanitizeString, sanitizeObject };
