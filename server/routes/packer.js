const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Unified function to calculate order status
function calculateOrderStatus(order, lineItems, transferItems) {
  if (order.status === 'holding') {
    return 'holding';
  }

  // 如果有 transferring 或 waiting 状态的 transfer item，订单状态为 waiting
  const waitingOrTransferringItems = transferItems.filter(ti => 
    ti.status === 'waiting' || ti.status === 'transferring'
  );
  if (waitingOrTransferringItems.length > 0) {
    return 'waiting';
  }

  const allReady = lineItems.length > 0 && lineItems.every(item => item.packer_status === 'ready');
  if (allReady) {
    return 'ready';
  }

  return 'packing';
}

// Get all orders for packer
router.get('/orders', async (req, res) => {
  try {
    const orders = await db.prepare(`
      SELECT * FROM orders 
      WHERE fulfillment_status != 'fulfilled'
      ORDER BY created_at DESC
    `).all();

    const ordersWithDetails = await Promise.all(orders.map(async (order) => {
      const lineItems = await db.prepare(`
        SELECT * FROM line_items 
        WHERE shopify_order_id = ?
        ORDER BY id
      `).all(order.shopify_order_id);

      const transferItems = await db.prepare(`
        SELECT ti.*, li.id as line_item_id
        FROM transfer_items ti
        JOIN line_items li ON ti.line_item_id = li.id
        WHERE ti.shopify_order_id = ?
      `).all(order.shopify_order_id);

      // 使用永久标记检查 weight warning
      const hasWeightWarning = lineItems.some(item => item.has_weight_warning === 1);

      // 🆕 检查是否有 out_of_stock items
      const hasOutOfStock = transferItems.some(ti => ti.out_of_stock === 1);

      const orderStatus = calculateOrderStatus(order, lineItems, transferItems);

      let transferInfo = null;
      // 获取所有 waiting 状态的 item
      const waitingItems = transferItems.filter(ti => ti.status === 'waiting');
      
      if (waitingItems.length > 0) {
        const totalQuantity = waitingItems.reduce((sum, item) => sum + item.quantity, 0);
        
        // 获取所有不同的 transfer_from，去重并过滤空值
        const transferFroms = [...new Set(waitingItems.map(item => item.transfer_from))].filter(Boolean);
        
        // 找到最晚的日期
        const latestDate = waitingItems.reduce((latest, item) => {
          if (!item.estimate_month || !item.estimate_day) return latest;
          const itemDate = item.estimate_month * 100 + item.estimate_day;
          return itemDate > latest ? itemDate : latest;
        }, 0);

        transferInfo = {
          quantity: totalQuantity,
          transferFroms: transferFroms, // 所有的 transfer_from
          estimateMonth: Math.floor(latestDate / 100),
          estimateDay: latestDate % 100
        };
      }

      const transferringItems = transferItems.filter(ti => ti.status === 'transferring');

      return {
        ...order,
        lineItems,
        hasWeightWarning,
        hasOutOfStock, // 🆕 添加 out of stock 标记
        orderStatus,
        hasTransferring: transferringItems.length > 0,
        hasWaiting: waitingItems.length > 0,
        transferInfo
      };
    }));

    res.json(ordersWithDetails);
  } catch (error) {
    console.error('Error fetching packer orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders: ' + error.message });
  }
});

// Get single order details
router.get('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    
    const order = await db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const lineItems = await db.prepare(`
      SELECT * FROM line_items 
      WHERE shopify_order_id = ?
      ORDER BY id
    `).all(shopifyOrderId);

    const lineItemsWithTransfer = await Promise.all(lineItems.map(async (item) => {
      const transferItem = await db.prepare(`
        SELECT * FROM transfer_items 
        WHERE line_item_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(item.id);

      return {
        ...item,
        transferStatus: transferItem?.status || null,
        outOfStock: transferItem?.out_of_stock === 1, // 🆕 添加 out of stock 状态
        transferInfo: transferItem ? {
          transferFrom: transferItem.transfer_from,
          estimateMonth: transferItem.estimate_month,
          estimateDay: transferItem.estimate_day,
          quantity: transferItem.quantity
        } : null
      };
    }));

    res.json({
      ...order,
      lineItems: lineItemsWithTransfer
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details: ' + error.message });
  }
});

// Update order status (holding/packing)
router.patch('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

router.patch('/orders/:shopifyOrderId/status', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(status, shopifyOrderId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status: ' + error.message });
  }
});

// 🆕 Add or update note
router.patch('/orders/:shopifyOrderId/note', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { note } = req.body;

    // Note 可以为空字符串（删除 note）
    if (note === undefined) {
      return res.status(400).json({ error: 'Note is required' });
    }

    // 限制 50 字符
    if (note.length > 50) {
      return res.status(400).json({ error: 'Note must be 50 characters or less' });
    }

    await db.prepare(`
      UPDATE orders 
      SET packer_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(note, shopifyOrderId);

    res.json({ success: true, note });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note: ' + error.message });
  }
});

// 🆕 Delete order (完全从 APP 中删除订单)
router.delete('/orders/:shopifyOrderId', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;

    console.log(`Deleting order ${shopifyOrderId} from APP`);

    // ⚠️ 不删除 transfer_items！
    // await db.prepare('DELETE FROM transfer_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 line_items
    await db.prepare('DELETE FROM line_items WHERE shopify_order_id = ?').run(shopifyOrderId);
    
    // 删除 order
    await db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run(shopifyOrderId);

    console.log(`✓ Order ${shopifyOrderId} deleted successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order: ' + error.message });
  }
});

router.patch('/items/:id/packer-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await db.prepare(`
      UPDATE line_items 
      SET packer_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating item packer status:', error);
    res.status(500).json({ error: 'Failed to update item status: ' + error.message });
  }
});

// 🆕 Complete 订单时同时减少 box quantity 并更新 Shopify metafield
router.post('/orders/:shopifyOrderId/complete', async (req, res) => {
  try {
    const { shopifyOrderId } = req.params;
    const { boxType, weight } = req.body;

    console.log('\n========== ORDER COMPLETION START ==========');
    console.log(`Shopify Order ID parameter: ${shopifyOrderId}`);

    if (!boxType) {
      return res.status(400).json({ error: 'Box type is required' });
    }

    // 获取订单信息
    const order = await db.prepare(
      'SELECT * FROM orders WHERE shopify_order_id = ?'
    ).get(shopifyOrderId);

    if (!order) {
      console.log('✗ Order not found in database');
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`Order found: ${order.name}`);
    console.log(`shopify_order_id from DB: ${order.shopify_order_id}`);

    // 更新订单状态
    await db.prepare(`
      UPDATE orders 
      SET box_type = ?, weight = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
      WHERE shopify_order_id = ?
    `).run(boxType, weight || null, shopifyOrderId);

    // 更新 box type 使用统计
    await db.prepare(`
      UPDATE box_types 
      SET usage_count = usage_count + 1,
          quantity = CASE WHEN quantity > 0 THEN quantity - 1 ELSE quantity END
      WHERE code = ?
    `).run(boxType);

    console.log(`✓ Box type ${boxType} usage count updated and quantity decreased`);

    // 🆕 更新 Shopify Order Metafield
    try {
      // 从 shopify_order_id 中提取真正的 Shopify Order ID
      // 格式：gid://shopify/Order/7109941887286 → 7109941887286
      let realShopifyOrderId = shopifyOrderId;
      
      if (shopifyOrderId.includes('gid://shopify/Order/')) {
        realShopifyOrderId = shopifyOrderId.split('gid://shopify/Order/')[1];
        console.log(`Extracted Shopify Order ID from GID: ${realShopifyOrderId}`);
      } else if (shopifyOrderId.includes('/')) {
        // 如果还有其他斜杠格式，取最后一部分
        realShopifyOrderId = shopifyOrderId.split('/').pop();
        console.log(`Extracted Shopify Order ID from path: ${realShopifyOrderId}`);
      }

      console.log(`Using Shopify Order ID for metafield: ${realShopifyOrderId}`);

      const shopifyClient = require('../shopify/client');
      
      // 更新 ready metafield
      const result = await shopifyClient.updateOrderMetafield(
        realShopifyOrderId,
        'custom',
        'ready',
        'true',
        'boolean'
      );
      
      console.log(`✓ Shopify metafield 'ready' updated successfully for Order ${order.name}`);
      console.log(`Metafield ID: ${result.id}`);
      
      // 🆕 更新 packed_time metafield（当前日期和时间）
      const packedTime = new Date().toISOString();
      const packedTimeResult = await shopifyClient.updateOrderMetafield(
        realShopifyOrderId,
        'custom',
        'packed_time',
        packedTime,
        'date_time'
      );
      
      console.log(`✓ Shopify metafield 'packed_time' updated: ${packedTime}`);
      console.log(`Metafield ID: ${packedTimeResult.id}`);
    } catch (metafieldError) {
      console.error('⚠️ Error updating Shopify metafield (non-critical):', metafieldError.message);
      if (metafieldError.response) {
        console.error('Response status:', metafieldError.response.status);
        console.error('Response data:', JSON.stringify(metafieldError.response.data, null, 2));
      }
      // 不阻止主流程
    }

    console.log('========== ORDER COMPLETION END ==========\n');

    res.json({ success: true });
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).json({ error: 'Failed to complete order: ' + error.message });
  }
});

router.patch('/items/:id/update-weight', async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    console.log('\n========== WEIGHT UPDATE REQUEST ==========');
    console.log(`Item ID: ${id}`);
    console.log(`New weight: ${weight}g`);

    if (!weight || weight <= 0) {
      console.log('✗ Invalid weight value');
      return res.status(400).json({ error: 'Valid weight is required' });
    }

    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    
    if (!item) {
      console.log('✗ Item not found in database');
      return res.status(404).json({ error: 'Item not found' });
    }

    console.log('Item details:');
    console.log(`  SKU: ${item.sku || 'N/A'}`);
    console.log(`  Brand: ${item.brand || 'N/A'}`);
    console.log(`  Title: ${item.title || 'N/A'}`);
    console.log(`  Current weight: ${item.weight}${item.weight_unit}`);
    console.log(`  Has weight warning: ${item.has_weight_warning}`);

    // 只更新 weight 和 weight_unit，不改变 has_weight_warning
    await db.prepare(`
      UPDATE line_items 
      SET weight = ?, weight_unit = 'g', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(weight, id);

    console.log('✓ Local database updated successfully');

    let shopifyUpdateSuccess = false;
    let shopifyError = null;

    if (item.sku) {
      try {
        console.log(`\nAttempting Shopify update for SKU: ${item.sku}`);
        const shopifyClient = require('../shopify/client');
        const result = await shopifyClient.updateVariantWeightBySku(item.sku, weight);
        shopifyUpdateSuccess = true;
        console.log('✓ Shopify update SUCCESS');
        console.log('Updated variant details:');
        console.log(`  Variant ID: ${result.id}`);
        console.log(`  Weight: ${result.weight}${result.weight_unit}`);
      } catch (shopifyErr) {
        shopifyError = shopifyErr.message;
        console.error('✗ Shopify update FAILED');
        console.error('Error message:', shopifyErr.message);
        if (shopifyErr.response) {
          console.error('Response status:', shopifyErr.response.status);
          console.error('Response data:', JSON.stringify(shopifyErr.response.data, null, 2));
        }
        console.error('Full error stack:', shopifyErr.stack);
      }
    } else {
      console.log('⚠ No SKU found for this item, skipping Shopify update');
    }

    console.log('========================================\n');

    res.json({ 
      success: true,
      shopifyUpdated: shopifyUpdateSuccess,
      shopifyError: shopifyError
    });
  } catch (error) {
    console.error('Error updating weight:', error);
    res.status(500).json({ error: 'Failed to update weight: ' + error.message });
  }
});

module.exports = router;