/**
 * Generates SR IDs in format SR-YYYY-NNNN
 * Reads existing rows to find the highest number for the current year.
 */
function generateSrId(existingIds) {
  const year = new Date().getFullYear();
  const prefix = `SR-${year}-`;

  let maxNum = 0;
  for (const id of existingIds) {
    if (id && id.startsWith(prefix)) {
      const num = parseInt(id.replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

module.exports = { generateSrId };
