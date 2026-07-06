const express = require('express');
const router = express.Router();
const shopifyClient = require('../shopify/client');

// Tracking status levels
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

/**
 * Determine current tracking status from Shopify order data
 */
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

/**
 * Build an SVG tracking bar and return it as a PNG-like SVG image.
 * We serve as image/svg+xml — works in all modern email clients except Outlook.
 */
function buildSVG(statuses, activeKey, lang) {
  const steps = statuses[lang] || statuses['en'];
  const activeIndex = steps.findIndex((s) => s.key === activeKey);

  const W = 600;
  const H = 100;
  const stepW = W / steps.length;
  const circleY = 36;
  const r = 14;
  const lineY = circleY;

  const colorActive = '#1a1a1a';
  const colorDone = '#1a1a1a';
  const colorInactive = '#cccccc';
  const colorLineActive = '#1a1a1a';
  const colorLineInactive = '#cccccc';

  let circles = '';
  let lines = '';
  let labels = '';

  steps.forEach((step, i) => {
    const cx = stepW * i + stepW / 2;
    const isDone = i < activeIndex;
    const isActive = i === activeIndex;
    const color = isDone || isActive ? colorDone : colorInactive;
    const fillColor = isActive ? colorActive : isDone ? colorDone : '#ffffff';
    const textColor = isActive || isDone ? '#ffffff' : colorInactive;

    // Line between steps
    if (i < steps.length - 1) {
      const nextCx = stepW * (i + 1) + stepW / 2;
      const lineColor = isDone ? colorLineActive : colorLineInactive;
      lines += `<line x1="${cx + r}" y1="${lineY}" x2="${nextCx - r}" y2="${lineY}" stroke="${lineColor}" stroke-width="2"/>`;
    }

    // Circle
    circles += `<circle cx="${cx}" cy="${circleY}" r="${r}" fill="${fillColor}" stroke="${color}" stroke-width="2"/>`;

    // Checkmark or number inside circle
    if (isDone) {
      circles += `<text x="${cx}" y="${circleY + 5}" text-anchor="middle" font-size="13" fill="#ffffff" font-family="Arial,sans-serif">✓</text>`;
    } else {
      circles += `<text x="${cx}" y="${circleY + 5}" text-anchor="middle" font-size="12" fill="${textColor}" font-family="Arial,sans-serif">${i + 1}</text>`;
    }

    // Label below
    labels += `<text x="${cx}" y="${circleY + r + 20}" text-anchor="middle" font-size="12" fill="${color}" font-family="Arial,sans-serif" font-weight="${isActive ? 'bold' : 'normal'}">${step.label}</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${lines}
  ${circles}
  ${labels}
</svg>`;
}

/**
 * GET /api/gift/tracking-image
 * Query params: order_id, lang (en|fr)
 *
 * Returns an SVG image showing current tracking status.
 * Re-rendered on every email open = always current.
 */
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

    // Cache-Control: no-store ensures email clients re-fetch on every open
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(svg);
  } catch (error) {
    console.error('[GiftTracking] Error generating tracking image:', error.message);

    // On error, return a fallback "Order placed" image rather than a broken image
    const fallback = buildSVG(STATUSES, 'created', language);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-store');
    res.send(fallback);
  }
});

module.exports = router;