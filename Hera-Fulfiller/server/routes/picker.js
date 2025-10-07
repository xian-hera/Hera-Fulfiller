const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Get all line items for picker
router.get('/items', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT 
        li.*,
        o.name as order_name,
        o.shipping_code
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
      ORDER BY li.created_at DESC
    `).all();

    // Get CSV data for WIG products
    const csvData = db.prepare('SELECT sku, data FROM csv_data').all();
    const csvMap = new Map(csvData.map(row => [row.sku, JSON.parse(row.data || '{}')]));
    
    const settings = db.prepare('SELECT * FROM settings').all();
    const wigColumn = settings.find(s => s.key === 'picker_wig_column')?.value || 'E';

    // Process items with WIG type
    const processedItems = items.map(item => {
      let displayType = item.product_type;
      
      if (item.product_type === 'WIG' && item.sku) {
        const csvRow = csvMap.get(item.sku);
        if (csvRow && csvRow[wigColumn]) {
          displayType = csvRow[wigColumn];
        }
      }

      return {
        ...item,
        display_type: displayType,
        sort_type: item.product_type // Keep original for sorting
      };
    });

    res.json(processedItems);
  } catch (error) {
    console.error('Error fetching picker items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status
router.patch('/items/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    db.prepare(`
      UPDATE line_items 
      SET picker_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

    // If status is 'missing', create transfer item
    if (status === 'missing') {
      const item = db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
      
      db.prepare(`
        INSERT INTO transfer_items (
          line_item_id, shopify_order_id, order_number, quantity, sku, status
        ) VALUES (?, ?, ?, ?, ?, 'transferring')
      `).run(item.id, item.shopify_order_id, item.order_number, item.quantity, item.sku);
    }

    // If status changes from 'missing' to 'picked', remove from transfer
    if (status === 'picked') {
      db.prepare('DELETE FROM transfer_items WHERE line_item_id = ?').run(id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split item (when quantity > 1 and partially picked)
router.post('/items/:id/split', (req, res) => {
  try {
    const { id } = req.params;
    const { pickedQuantity } = req.body;

    const item = db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const missingQuantity = item.quantity - pickedQuantity;

    // Update original item to picked quantity
    db.prepare(`
      UPDATE line_items 
      SET quantity = ?, picker_status = 'picked', updated_at = datetime('now')
      WHERE id = ?
    `).run(pickedQuantity, id);

    // Create new item for missing quantity
    const newItem = db.prepare(`
      INSERT INTO line_items (
        shopify_order_id, order_number, shopify_line_item_id, quantity,
        image_url, title, name, brand, size, weight, weight_unit, sku,
        url_handle, product_type, picker_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missing', datetime('now'))
    `).run(
      item.shopify_order_id,
      item.order_number,
      item.shopify_line_item_id + '_split_' + Date.now(),
      missingQuantity,
      item.image_url,
      item.title,
      item.name,
      item.brand,
      item.size,
      item.weight,
      item.weight_unit,
      item.sku,
      item.url_handle,
      item.product_type
    );

    // Create transfer item for missing quantity
    db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku, status
      ) VALUES (?, ?, ?, ?, ?, 'transferring')
    `).run(newItem.lastInsertRowid, item.shopify_order_id, item.order_number, missingQuantity, item.sku);

    res.json({ success: true, newItemId: newItem.lastInsertRowid });
  } catch (error) {
    console.error('Error splitting item:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;