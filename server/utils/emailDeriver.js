/**
 * Derives a @duranteequip.com email from a full name.
 * Format: first initial + last name (no dot).
 * "Jason Irwin" → "jirwin@duranteequip.com"
 * "Eddie Rivera" → "erivera@duranteequip.com"
 */
function deriveSubmitterEmail(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  return `${parts[0][0]}${parts[parts.length - 1]}@duranteequip.com`;
}

module.exports = { deriveSubmitterEmail };
