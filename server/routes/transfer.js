const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// Emoji mapping for transfer from
const EMOJI_MAP = {
  '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
  '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
};

// Get all transfer items
router.get('/items', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT 
        ti.*,
        li.image_url,
        li.brand,
        li.title,
        li.size,
        li.name,
        li.variant_title,
        li.custom_name
      FROM transfer_items ti
      JOIN line_items li ON ti.line_item_id = li.id
      ORDER BY ti.created_at DESC
    `).all();

    console.log(`Transfer: Found ${items.length} items`);
    res.json(items);
  } catch (error) {
    console.error('Error fetching transfer items:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 Get receiving filter options (transfer_from and transfer_date)
router.get('/receiving-options', async (req, res) => {
  try {
    // 获取所有 waiting 和 received 状态的 items
    const items = await db.prepare(`
      SELECT DISTINCT transfer_from, transfer_date
      FROM transfer_items
      WHERE (status = 'waiting' OR status = 'received') 
        AND transfer_from IS NOT NULL 
        AND transfer_date IS NOT NULL
      ORDER BY transfer_from ASC, transfer_date ASC
    `).all();

    // 提取唯一的 transfer_from 和 transfer_date
    const transferFroms = [...new Set(items.map(item => item.transfer_from))].sort();
    const transferDates = [...new Set(items.map(item => item.transfer_date))].sort();

    res.json({
      transferFroms,
      transferDates
    });
  } catch (error) {
    console.error('Error fetching receiving options:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get copy text for an item
router.get('/items/:id/copy-text', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.prepare(`
      SELECT ti.*, li.sku, li.custom_name, li.title
      FROM transfer_items ti
      JOIN line_items li ON ti.line_item_id = li.id
      WHERE ti.id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // 🆕 变量定义
    // A = emoji + transfer_from + emoji (只在 waiting 状态使用)
    // B = quantity (如果 > 1，用 "pcs"，否则用 "pc")
    // C = custom_name (优先级: custom_name > title)
    // D = SKU
    // E = order_number (只在 waiting 状态使用)

    const B = item.quantity;
    const pcText = B > 1 ? 'pcs' : 'pc';
    const C = item.custom_name || item.title || '';
    const D = item.sku || '';
    const E = item.order_number || '';

    let copyText = '';

    if (item.status === 'transferring') {
      // 格式: B pc(s) ----- C SKU D
      copyText = `${B} ${pcText} ----- ${C} SKU ${D}`;
    } else if (item.status === 'waiting') {
      // 格式: A  B pc(s) ----- C SKU D  #E
      const emoji = EMOJI_MAP[item.transfer_from] || '⬜';
      const A = `${emoji}${item.transfer_from}${emoji}`;
      copyText = `${A}  ${B} ${pcText} ----- ${C} SKU ${D}  #${E}`;
    }

    console.log(`Transfer: Copy text generated:`, copyText);

    res.json({ copyText });
  } catch (error) {
    console.error('Error generating copy text:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update transfer item status
router.patch('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transfer_from, estimate_month, estimate_day } = req.body;

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (transfer_from !== undefined) {
      updates.push('transfer_from = ?');
      values.push(transfer_from);
    }
    if (estimate_month !== undefined) {
      updates.push('estimate_month = ?');
      values.push(estimate_month);
    }
    if (estimate_day !== undefined) {
      updates.push('estimate_day = ?');
      values.push(estimate_day);
    }

    // 🆕 如果状态变为 waiting，记录 transfer_date（格式：MM/DD）
    if (status === 'waiting' || (transfer_from !== undefined && estimate_month !== undefined)) {
      const currentDate = new Date();
      const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
      const day = currentDate.getDate().toString().padStart(2, '0');
      const transferDate = `${month}/${day}`;
      
      updates.push('transfer_date = ?');
      values.push(transferDate);
      
      console.log(`Setting transfer_date to: ${transferDate}`);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    await db.prepare(`
      UPDATE transfer_items 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split transfer item (when quantity > 1 and user wants to transfer part)
router.post('/items/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { transferQuantity, transfer_from, estimate_month, estimate_day } = req.body;

    const item = await db.prepare('SELECT * FROM transfer_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Transfer item not found' });
    }

    const qty = parseInt(transferQuantity);
    const remainingQty = item.quantity - qty;

    if (qty >= item.quantity || qty < 1) {
      return res.status(400).json({ error: 'Invalid transfer quantity' });
    }

    // 🆕 记录 transfer_date
    const currentDate = new Date();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const transferDate = `${month}/${day}`;

    // Update original item to transferring quantity
    await db.prepare(`
      UPDATE transfer_items 
      SET 
        quantity = ?,
        transfer_from = ?,
        estimate_month = ?,
        estimate_day = ?,
        transfer_date = ?,
        status = 'waiting',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(qty, transfer_from, estimate_month, estimate_day, transferDate, id);

    // Create new item for remaining quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku,
        image_url, title, name, brand, size, weight, weight_unit,
        url_handle, product_type, variant_title, custom_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
    `).run(
      item.line_item_id,
      item.shopify_order_id,
      item.order_number,
      remainingQty,
      item.sku,
      item.image_url,
      item.title,
      item.name,
      item.brand,
      item.size,
      item.weight,
      item.weight_unit,
      item.url_handle,
      item.product_type,
      item.variant_title,
      item.custom_name
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error splitting transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete transfer items
router.post('/items/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid ids array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    await db.prepare(`DELETE FROM transfer_items WHERE id IN (${placeholders})`).run(...ids);

    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting transfer items:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;