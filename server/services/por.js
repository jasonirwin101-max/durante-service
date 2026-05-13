const POR_BASE = 'https://api.pointofrental.com/v1/apikey';

function porHeaders() {
  return {
    'X-API-Key': process.env.POR_API_KEY,
    'Content-Type': 'application/json',
  };
}

// Status strings POR (or rental systems generally) might use for finished WOs.
// Compared case-insensitively. If a WO's Status is missing/empty we keep it
// visible — defensive against the field being absent entirely.
const CLOSED_STATUSES = new Set([
  'closed', 'complete', 'completed', 'cancelled', 'canceled', 'done', 'finished',
]);

async function getWorkOrders({ status = 'open' } = {}) {
  const res = await fetch(`${POR_BASE}/workorders`, { headers: porHeaders() });
  if (!res.ok) throw new Error(`POR API error: ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];

  if (list.length > 0) {
    const uniqueStatuses = [...new Set(list.map((wo) => wo.Status))];
    console.log('[POR] Unique statuses:', JSON.stringify(uniqueStatuses));
    console.log('[POR] Sample WO fields:', Object.keys(list[0]).join(','));
  }

  let filtered = list;
  if (status === 'open') {
    filtered = list.filter((wo) => {
      const s = String(wo.Status || '').trim().toLowerCase();
      if (!s) return true;
      return !CLOSED_STATUSES.has(s);
    });
  }

  console.log('[POR] Work orders fetched:', list.length, 'filter:', status, 'returned:', filtered.length);
  return filtered;
}

// Tries POR's direct lookup first (assumes :id accepts the user-facing Name);
// if that 404s or returns nothing useful, scans the full list and matches by
// Name then Id. Returns null if not found anywhere.
async function getWorkOrderById(id) {
  if (!id) return null;
  try {
    const direct = await fetch(
      `${POR_BASE}/workorders/${encodeURIComponent(id)}`,
      { headers: porHeaders() }
    );
    if (direct.ok) {
      const data = await direct.json();
      if (data && (data.Name || data.Id)) return data;
    }
  } catch (err) {
    console.log('[POR] Direct lookup failed:', err.message);
  }
  try {
    const all = await getWorkOrders();
    const target = String(id).trim().toLowerCase();
    return (
      all.find(
        (wo) =>
          String(wo.Name || '').trim().toLowerCase() === target ||
          String(wo.Id || '').trim().toLowerCase() === target
      ) || null
    );
  } catch (err) {
    console.log('[POR] List-scan fallback failed:', err.message);
    return null;
  }
}

module.exports = { getWorkOrders, getWorkOrderById };
