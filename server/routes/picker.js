const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Get all line items for picker
router.get('/items', async (req, res) => {
  try {
    const items = await db.prepare(`
      SELECT 
        li.*,
        o.name as order_name,
        o.shipping_code
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
      ORDER BY li.created_at DESC
    `).all();

    // 🆕 处理 WIG 类型的显示
    const processedItems = items.map(item => {
      let displayType = item.product_type;
      
      // 如果是 WIG 类型且有 wig_number，用 wig_number 替换显示
      if (item.product_type && item.product_type.toUpperCase() === 'WIG' && item.wig_number) {
        displayType = item.wig_number;
        console.log(`Replaced WIG with ${displayType} for item ${item.id}`);
      }

      return {
        ...item,
        display_type: displayType,
        sort_type: item.product_type // 排序时仍使用原始的 product_type
      };
    });

    res.json(processedItems);
  } catch (error) {
    console.error('Error fetching picker items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status
router.patch('/items/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.prepare(`
      UPDATE line_items 
      SET picker_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    // If status is 'missing', create transfer item
    if (status === 'missing') {
      const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
      
      await db.prepare(`
        INSERT INTO transfer_items (
          line_item_id, shopify_order_id, order_number, quantity, sku, 
          image_url, title, name, brand, size, weight, weight_unit,
          url_handle, product_type, variant_title, custom_name, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
      `).run(
        item.id, item.shopify_order_id, item.order_number, item.quantity, item.sku,
        item.image_url, item.title, item.name, item.brand, item.size, item.weight, item.weight_unit,
        item.url_handle, item.product_type, item.variant_title, item.custom_name
      );
    }

    // If status changes from 'missing' to 'picked', remove from transfer
    if (status === 'picked') {
      await db.prepare('DELETE FROM transfer_items WHERE line_item_id = ?').run(id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split item (when quantity > 1 and partially picked)
router.post('/items/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { pickedQuantity } = req.body;

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const missingQuantity = item.quantity - pickedQuantity;

    // Update original item to picked quantity
    await db.prepare(`
      UPDATE line_items 
      SET quantity = ?, picker_status = 'picked', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(pickedQuantity, id);

    // Create new item for missing quantity
    const newItem = await db.prepare(`
      INSERT INTO line_items (
        shopify_order_id, order_number, shopify_line_item_id, quantity,
        image_url, title, name, brand, size, weight, weight_unit, sku,
        url_handle, product_type, wig_number, custom_name, has_weight_warning, 
        variant_title, picker_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missing', CURRENT_TIMESTAMP)
      RETURNING id
    `).get(
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
      item.product_type,
      item.wig_number,
      item.custom_name,
      item.has_weight_warning,
      item.variant_title
    );

    // Create transfer item for missing quantity
    await db.prepare(`
      INSERT INTO transfer_items (
        line_item_id, shopify_order_id, order_number, quantity, sku,
        image_url, title, name, brand, size, weight, weight_unit,
        url_handle, product_type, variant_title, custom_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
    `).run(
      newItem.id, item.shopify_order_id, item.order_number, missingQuantity, item.sku,
      item.image_url, item.title, item.name, item.brand, item.size, item.weight, item.weight_unit,
      item.url_handle, item.product_type, item.variant_title, item.custom_name
    );

    res.json({ success: true, newItemId: newItem.id });
  } catch (error) {
    console.error('Error splitting item:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;