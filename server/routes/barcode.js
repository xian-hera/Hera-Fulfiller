const express = require('express');
const router = express.Router();
const shopifyClient = require('../shopify/client');

// 🆕 扫码兜底接口：前端本地按 item.sku 匹配不到时，把扫到的 barcode 传过来，
// 实时向 Shopify 查这个 barcode 实际对应哪个 variant 的 SKU，前端再拿这个 SKU
// 去本地重新匹配一次。用于替代旧的 custom.lookups metafield + 占位 lookup 产品方案，
// 详见 claude/HERA_FULFILLER_BARCODE_API_MIGRATION.md。
router.get('/resolve', async (req, res) => {
  try {
    const barcode = (req.query.barcode || '').toString().trim();
    if (!barcode) {
      return res.status(400).json({ error: 'Missing barcode query param' });
    }

    const sku = await shopifyClient.getSkuByBarcode(barcode);
    return res.json({ sku: sku || null });
  } catch (error) {
    console.error('Error resolving barcode:', error.message);
    return res.status(500).json({ error: 'Failed to resolve barcode', sku: null });
  }
});

module.exports = router;
