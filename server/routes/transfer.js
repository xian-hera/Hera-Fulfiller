const express = require('express');
const router = express.Router();
const db = require('../database/init');

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
        li.variant_title
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

// Get copy text for an item
router.get('/items/:id/copy-text', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.prepare(`
      SELECT ti.*, li.sku
      FROM transfer_items ti
      JOIN line_items li ON ti.line_item_id = li.id
      WHERE ti.id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Get CSV column setting
    const settings = await db.prepare('SELECT * FROM settings WHERE key = ?').get('transfer_csv_column');
    const column = settings?.value || 'D';

    console.log(`Transfer: Using column ${column} for SKU ${item.sku}`);

    // Get CSV data for this SKU
    const csvData = await db.prepare('SELECT data FROM csv_data WHERE sku = ?').get(item.sku);
    const csvRow = csvData ? JSON.parse(csvData.data) : {};
    const columnData = csvRow[column] || '';

    console.log(`Transfer: Found CSV data:`, columnData);

    let copyText = '';

    if (item.status === 'transferring') {
      // Format: B-C-SKU (quantity-csvColumn-sku)
      copyText = `${item.quantity}-${columnData}-${item.sku}`;
    } else if (item.status === 'waiting') {
      // Format: A-B-C-SKU-D (emoji+transferFrom+emoji-quantity-csvColumn-sku-orderNumber)
      const emoji = EMOJI_MAP[item.transfer_from] || '⬜';
      copyText = `${emoji}${item.transfer_from}${emoji}-${item.quantity}-${columnData}-${item.sku}-${item.order_number}`;
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

    // Update original item to transferring quantity
    await db.prepare(`
      UPDATE transfer_items 
      SET 
        quantity = ?,
        transfer_from = ?,
        estimate_month = ?,
        estimate_day = ?,
        status = 'waiting',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(qty, transfer_from, estimate_month, estimate_day, id);

    // Create new item for remaining quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku, status
      ) VALUES (?, ?, ?, ?, ?, 'transferring')
    `).run(
      item.line_item_id,
      item.shopify_order_id,
      item.order_number,
      remainingQty,
      item.sku
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