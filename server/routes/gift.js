const express = require('express');
const router = express.Router();
const shopifyClient = require('../shopify/client');

const BRAND = '#E32A69';
const IDLE = '#e0e0e0';
const IDLE_TEXT = '#aaaaaa';

const STATUSES = {
  en: [
    { key: 'created',   label: 'Order placed' },
    { key: 'shipped',   label: 'Shipped' },
    { key: 'transit',   label: 'On its way' },
    { key: 'delivered', label: 'Delivered' },
  ],
  fr: [
    { key: 'created',   label: 'Commande passée' },
    { key: 'shipped',   label: 'Expédiée' },
    { key: 'transit',   label: 'En route' },
    { key: 'delivered', label: 'Livrée' },
  ],
};

function resolveStatus(order) {
  if (!order) return 'created';
  const fulfillments = order.fulfillments || [];
  if (fulfillments.length === 0) return 'created';
  const latest = fulfillments[fulfillments.length - 1];
  const shipmentStatus = latest.shipment_status || '';
  if (shipmentStatus === 'delivered') return 'delivered';
  if (['in_transit', 'out_for_delivery', 'attempted_delivery'].includes(shipmentStatus)) return 'transit';
  if (['label_printed', 'label_purchased', 'confirmed', 'ready_for_pickup'].includes(shipmentStatus)) return 'shipped';
  if (latest.status === 'success') return 'shipped';
  return 'created';
}

function buildSVG(statuses, activeKey, lang) {
  const steps = statuses[lang] || statuses['en'];
  const activeIndex = steps.findIndex((s) => s.key === activeKey);

  const W = 600;
  const H = 60;
  const pillW = 130;
  const pillH = 8;
  const pillRx = 4;
  const gap = 8;
  const totalPillsWidth = steps.length * pillW + (steps.length - 1) * gap;
  const startX = (W - totalPillsWidth) / 2;
  const pillY = 18;
  const labelY = 46;

  let pills = '';
  let labels = '';

  steps.forEach((step, i) => {
    const isDone = i <= activeIndex;
    const isActive = i === activeIndex;
    const x = startX + i * (pillW + gap);

    pills += `<rect x="${x}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillRx}" fill="${isDone ? BRAND : IDLE}"/>`;

    const cx = x + pillW / 2;
    const textColor = isDone ? BRAND : IDLE_TEXT;
    const fontWeight = isActive ? 'bold' : 'normal';
    labels += `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="11" fill="${textColor}" font-family="Arial,sans-serif" font-weight="${fontWeight}">${step.label}</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${pills}
  ${labels}
</svg>`;
}

router.get('/tracking-image', async (req, res) => {
  const { order_id, lang = 'en' } = req.query;
  const language = lang === 'fr' ? 'fr' : 'en';

  try {
    let activeStatus = 'created';
    if (order_id) {
      const order = await shopifyClient.getOrder(order_id);
      activeStatus = resolveStatus(order);
    }
    const svg = buildSVG(STATUSES, activeStatus, language);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(svg);
  } catch (error) {
    console.error('[GiftTracking] Error generating tracking image:', error.message);
    const fallback = buildSVG(STATUSES, 'created', language);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.send(fallback);
  }
});

module.exports = router;