// POS Extension 后端接口（方案文档第七节）
// 挂载在 /api/pos-return，整条路由都跑在 posSessionAuth 中间件后面（见 server/index.js）——
// 每个请求都必须带 Authorization: Bearer {session token}，由中间件验证签名后才会进这里的 handler。

const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');
const klaviyoClient = require('../klaviyo/client');

async function logHistory(returnId, eventType, note = null, staffMemberId = null, staffUserId = null) {
  await db.prepare(`
    INSERT INTO return_status_history (return_id, event_type, note, staff_member_id, staff_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(returnId, eventType, note, staffMemberId, staffUserId);
}

// ── 7.2 第一屏：Returns 列表 ─────────────────────────────────────────────────
// GET /api/pos-return/returns?locationId=xxx
// 只返回 return_method = in_store、returning to 当前 location、状态为 awaiting_return 的订单（已确认，7.2）
router.get('/returns', async (req, res) => {
  try {
    const { locationId } = req.query;
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const rows = await db.prepare(`
      SELECT r.id, r.order_name, r.customer_first_name, r.customer_last_name,
             COALESCE(SUM(ri.approved_quantity), 0) as returning_quantity
      FROM returns r
      JOIN return_items ri ON ri.return_id = r.id AND ri.approve_status = 'approved'
      WHERE r.status = 'awaiting_return' AND r.return_method = 'in_store' AND r.return_location_id = ?
      GROUP BY r.id
      ORDER BY r.approved_at ASC
    `).all(String(locationId));

    let locationName = null;
    try {
      const locations = await shopifyClient.getLocations();
      locationName = (locations.find(l => String(l.id) === String(locationId)) || {}).name || null;
    } catch (e) {
      console.error('Error fetching location name for POS returns list:', e.message);
    }

    res.json({
      locationName,
      returns: rows.map(r => ({
        id: r.id,
        orderName: r.order_name,
        customerName: `${r.customer_first_name || ''} ${r.customer_last_name || ''}`.trim(),
        returningQuantity: r.returning_quantity
      }))
    });
  } catch (error) {
    console.error('Error fetching POS returns list:', error);
    res.status(500).json({ error: 'Failed to fetch returns list: ' + error.message });
  }
});

// ── 7.3 第二屏：订单详情（只展示已 approved 的 item，不显示 note/照片，见 7.3） ──
// GET /api/pos-return/returns/:id
router.get('/returns/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }

    const items = await db.prepare(`
      SELECT ri.*, COALESCE(rr.name, ri.reason_name_snapshot) as reason_display_name
      FROM return_items ri
      LEFT JOIN return_reasons rr ON ri.reason_id = rr.id
      WHERE ri.return_id = ? AND ri.approve_status = 'approved'
      ORDER BY ri.id
    `).all(id);

    res.json({
      id: returnRecord.id,
      orderName: returnRecord.order_name,
      customerName: `${returnRecord.customer_first_name || ''} ${returnRecord.customer_last_name || ''}`.trim(),
      internalReturnNote: returnRecord.internal_return_note,
      status: returnRecord.status,
      items: items.map(i => ({
        id: i.id,
        productId: i.product_id,
        variantId: i.variant_id,
        productTitle: i.product_title,
        variantTitle: i.variant_title,
        imageUrl: i.image_url,
        approvedQuantity: i.approved_quantity,
        reasonName: i.reason_display_name,
        refundOption: i.refund_option
      }))
    });
  } catch (error) {
    console.error('Error fetching POS return detail:', error);
    res.status(500).json({ error: 'Failed to fetch return detail: ' + error.message });
  }
});

// POST /api/pos-return/returns/:id/note — 底部 "Enter internal note" + Post，独立于 complete-inspection 随时可发
// body: { note, staffMemberId, staffUserId }
router.post('/returns/:id/note', async (req, res) => {
  try {
    const { id } = req.params;
    const { note, staffMemberId, staffUserId } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }

    const returnRecord = await db.prepare('SELECT id FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }

    await logHistory(id, 'internal_note', note.trim(), staffMemberId, staffUserId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error posting POS internal note:', error);
    res.status(500).json({ error: 'Failed to post note: ' + error.message });
  }
});

// ── 7.3 Accept/Reject + 7.4 Rejection reason，合并成一次提交 ─────────────────
// PATCH /api/pos-return/returns/:id/complete-inspection
// body: {
//   locationId,
//   items: [{ itemId, acceptedQuantity, rejectionReason }],  -- rejectionReason 仅当 acceptedQuantity < approvedQuantity 时必填
//   staffMemberId, staffUserId
// }
// 语义等同于 admin 端 "Mark selected received"，只是这次由 POS 现场验货触发，并且会额外记录
// 每个未被足额 accept 的 item 的 pos_rejection_reason（供 admin 端 6.8.3 的 Not received 卡片展示，见 7.4）。
router.patch('/returns/:id/complete-inspection', async (req, res) => {
  try {
    const { id } = req.params;
    const { locationId, items, staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT * FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (returnRecord.status !== 'awaiting_return') {
      return res.status(400).json({ error: 'Return is not awaiting return' });
    }
    if (locationId && returnRecord.return_location_id && String(returnRecord.return_location_id) !== String(locationId)) {
      return res.status(400).json({ error: 'This return is not assigned to your location' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items is required' });
    }

    const approvedItems = await db.prepare(`
      SELECT id, approved_quantity FROM return_items WHERE return_id = ? AND approve_status = 'approved'
    `).all(id);

    // 先校验：每个被"部分/完全拒收"的 item 都必须带 rejectionReason（7.4 硬性要求）
    for (const entry of items) {
      const item = approvedItems.find(i => i.id === Number(entry.itemId));
      if (!item) continue;
      const accepted = Math.max(0, Math.min(Number(entry.acceptedQuantity) || 0, item.approved_quantity));
      if (accepted < item.approved_quantity && (!entry.rejectionReason || !entry.rejectionReason.trim())) {
        return res.status(400).json({ error: `Rejection reason is required for item ${item.id}` });
      }
    }

    for (const entry of items) {
      const item = approvedItems.find(i => i.id === Number(entry.itemId));
      if (!item) continue;
      const accepted = Math.max(0, Math.min(Number(entry.acceptedQuantity) || 0, item.approved_quantity));
      const rejected = accepted < item.approved_quantity;

      await db.prepare(`
        UPDATE return_items
        SET received_quantity = ?, pos_rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(accepted, rejected ? entry.rejectionReason.trim() : null, item.id);
    }

    await db.prepare(`
      UPDATE returns SET status = 'received', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    await logHistory(id, 'received', 'Inspected at POS', staffMemberId, staffUserId);

    const receivedItemsList = await db.prepare(
      'SELECT * FROM return_items WHERE return_id = ? AND received_quantity > 0'
    ).all(id);
    try {
      await klaviyoClient.trackReturnReceived(returnRecord.customer_email, {
        orderName: returnRecord.order_name,
        orderId: returnRecord.shopify_order_id,
        receivedItems: receivedItemsList.map(i => ({ productTitle: i.product_title, variantTitle: i.variant_title, quantity: i.received_quantity }))
      });
    } catch (e) {
      console.error('Klaviyo trackReturnReceived failed (non-blocking):', e.message);
    }

    // 供前端判断要不要跳到第四屏 Replacement 页面（7.5）：
    // 存在 refund_option = replacement 且 accepted quantity > 0 的 item
    const allItemsAfter = await db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(id);
    const hasReplacementEligible = allItemsAfter.some(i => i.refund_option === 'replacement' && i.received_quantity > 0);

    res.json({ success: true, status: 'received', hasReplacementEligible });
  } catch (error) {
    console.error('Error completing POS inspection:', error);
    res.status(500).json({ error: 'Failed to complete inspection: ' + error.message });
  }
});

// ── 7.5 第四屏：Replacement 确认 ─────────────────────────────────────────────
// GET /api/pos-return/returns/:id/replacement-items — 只列出 refund_option=replacement 且已被 accept(received_quantity>0) 的 item
router.get('/returns/:id/replacement-items', async (req, res) => {
  try {
    const { id } = req.params;
    const items = await db.prepare(`
      SELECT * FROM return_items
      WHERE return_id = ? AND refund_option = 'replacement' AND received_quantity > 0
      ORDER BY id
    `).all(id);

    res.json(items.map(i => ({
      id: i.id,
      productTitle: i.product_title,
      variantTitle: i.variant_title,
      imageUrl: i.image_url,
      receivedQuantity: i.received_quantity
    })));
  } catch (error) {
    console.error('Error fetching replacement items:', error);
    res.status(500).json({ error: 'Failed to fetch replacement items: ' + error.message });
  }
});

// PATCH /api/pos-return/returns/:id/replacement
// body: { items: [{ itemId, providedQuantity }], staffMemberId, staffUserId }
router.patch('/returns/:id/replacement', async (req, res) => {
  try {
    const { id } = req.params;
    const { items, staffMemberId, staffUserId } = req.body;

    const returnRecord = await db.prepare('SELECT id FROM returns WHERE id = ?').get(id);
    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items is required' });
    }

    for (const entry of items) {
      const item = await db.prepare(
        'SELECT id, received_quantity FROM return_items WHERE id = ? AND return_id = ?'
      ).get(entry.itemId, id);
      if (!item) continue;
      const qty = Math.max(0, Math.min(Number(entry.providedQuantity) || 0, item.received_quantity));
      await db.prepare(`
        UPDATE return_items SET replacement_provided_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(qty, item.id);
    }

    await logHistory(id, 'replacement_provided', null, staffMemberId, staffUserId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error confirming replacement:', error);
    res.status(500).json({ error: 'Failed to confirm replacement: ' + error.message });
  }
});

module.exports = router;
