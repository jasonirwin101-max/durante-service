const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getWorkOrders, getWorkOrderById } = require('../services/por');
const sheets = require('../services/sheets');

const router = express.Router();
router.use(authMiddleware);

router.get('/workorders', async (req, res) => {
  try {
    const status = req.query.status === 'all' ? 'all' : 'open';
    console.log('[POR] Fetching work orders, status filter:', status);
    const data = await getWorkOrders({ status });
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) {
    console.error('[POR] Fetch error:', err.message);
    res.status(502).json({ error: 'POR API unavailable', detail: err.message });
  }
});

router.get('/workorders/:id', async (req, res) => {
  try {
    const wo = await getWorkOrderById(req.params.id);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    res.json(wo);
  } catch (err) {
    console.error('[POR] Lookup error:', err.message);
    res.status(502).json({ error: 'POR API unavailable', detail: err.message });
  }
});

router.post('/link', requireRole('Manager'), async (req, res) => {
  try {
    const { srId, workOrderNumber } = req.body || {};
    if (!srId || !workOrderNumber) {
      return res.status(400).json({ error: 'srId and workOrderNumber are required' });
    }

    const wo = await getWorkOrderById(workOrderNumber);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const sr = await sheets.getServiceRequestById(srId);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });

    console.log('[POR] Linking:', workOrderNumber, 'to SR:', srId);
    await sheets.updateServiceRequestField(srId, 'POR_Work_Order', String(workOrderNumber));

    res.json({ success: true, workOrder: wo });
  } catch (err) {
    console.error('[POR] Link error:', err.message);
    res.status(500).json({ error: 'Failed to link work order', detail: err.message });
  }
});

router.delete('/link/:srId', requireRole('Manager'), async (req, res) => {
  try {
    const sr = await sheets.getServiceRequestById(req.params.srId);
    if (!sr) return res.status(404).json({ error: 'Service request not found' });
    console.log('[POR] Unlinking SR:', req.params.srId);
    await sheets.updateServiceRequestField(req.params.srId, 'POR_Work_Order', '');
    res.json({ success: true });
  } catch (err) {
    console.error('[POR] Unlink error:', err.message);
    res.status(500).json({ error: 'Failed to unlink work order' });
  }
});

module.exports = router;
