const sheets = require('../services/sheets');

/**
 * Generates SR IDs in format SR-YYYY-NNNN.
 * Checks BOTH ServiceRequests and CompletedRequests sheets so completed
 * SRs that have been archived don't get their numbers re-used.
 */
async function generateSrId() {
  const year = new Date().getFullYear();
  const prefix = `SR-${year}-`;

  const [active, completed] = await Promise.all([
    sheets.getAllServiceRequests().catch(err => {
      console.log('[ID] ServiceRequests read failed:', err.message);
      return [];
    }),
    sheets.getAllCompletedRequests().catch(err => {
      console.log('[ID] CompletedRequests sheet not found, using ServiceRequests only:', err.message);
      return [];
    }),
  ]);

  const numsForYear = [...active, ...completed]
    .map(sr => sr && sr.SR_ID)
    .filter(id => id && id.startsWith(prefix))
    .map(id => parseInt(id.slice(prefix.length), 10))
    .filter(n => !isNaN(n));

  const highest = numsForYear.length > 0 ? Math.max(...numsForYear) : 0;
  const next = String(highest + 1).padStart(4, '0');
  const newId = `${prefix}${next}`;

  console.log(`[ID] Active SRs: ${active.length}, Completed SRs: ${completed.length}, Next ID: ${newId}`);
  return newId;
}

module.exports = { generateSrId };
