const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

// 🆕 批量查询多个 SKU 在 MTL10 的库存
async function getBatchMTL10Inventory(skus) {
  try {
    if (!skus || skus.length === 0) return {};
    
    // 去重 SKU
    const uniqueSkus = [...new Set(skus.filter(sku => sku))];
    
    if (uniqueSkus.length === 0) return {};
    
    console.log(`📦 Fetching MTL10 inventory for ${uniqueSkus.length} SKUs`);
    
    // 使用 GraphQL 批量查询（每次最多 50 个）
    const results = {};
    const batchSize = 50;
    
    for (let i = 0; i < uniqueSkus.length; i += batchSize) {
      const batch = uniqueSkus.slice(i, i + batchSize);
      
      // 构建查询字符串：(sku:123 OR sku:456 OR sku:789)
      const skuQuery = batch.map(sku => `sku:${sku}`).join(' OR ');
      
      const query = `
        query getInventoryBatch($query: String!) {
          productVariants(first: 50, query: $query) {
            edges {
              node {
                id
                sku
                metafields(first: 10, namespace: "custom") {
                  edges {
                    node {
                      key
                      value
                    }
                  }
                }
                product {
                  id
                }
                inventoryItem {
                  id
                  inventoryLevels(first: 50) {
                    edges {
                      node {
                        location {
                          name
                        }
                        quantities(names: ["on_hand"]) {
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const client = await shopifyClient.getClient();
      const response = await client.post('/graphql.json', {
        query,
        variables: { query: skuQuery }
      });

      const edges = response.data.data?.productVariants?.edges || [];
      
      // 处理每个 variant
      edges.forEach(edge => {
        const sku = edge.node.sku;
        const inventoryLevels = edge.node.inventoryItem?.inventoryLevels?.edges || [];
        
        // 🆕 从 variant metafields 提取 discontinued（不是 product）
        const metafields = edge.node.metafields?.edges || [];
        
        // 🔍 调试：打印所有 metafields
        console.log(`\n=== SKU ${sku} - All Metafields ===`);
        console.log(`Total metafields: ${metafields.length}`);
        metafields.forEach((mf, index) => {
          console.log(`  [${index}] key: "${mf.node.key}", value: "${mf.node.value}" (type: ${typeof mf.node.value})`);
        });
        
        const discontinuedMetafield = metafields.find(m => m.node.key === 'discontinued');
        
        // 调试：打印 discontinued metafield
        if (discontinuedMetafield) {
          console.log(`✓ Found discontinued metafield:`, discontinuedMetafield.node);
          console.log(`  Raw value: ${discontinuedMetafield.node.value}`);
          console.log(`  Type: ${typeof discontinuedMetafield.node.value}`);
        } else {
          console.log(`✗ No discontinued metafield found`);
        }
        
        // 忽略大小写判断：true, True, TRUE 都算 true
        let isDiscontinued = false;
        if (discontinuedMetafield?.node?.value) {
          const value = discontinuedMetafield.node.value;
          // 布尔值 true 或字符串 "true" (忽略大小写)
          isDiscontinued = value === true || 
                          String(value).toLowerCase() === 'true';
        }
        
        console.log(`Final result - isDiscontinued: ${isDiscontinued}`);
        
        // 查找 MTL10 的库存
        for (const level of inventoryLevels) {
          if (level.node.location.name === 'MTL10') {
            const onHandQty = level.node.quantities?.find(q => q.name === 'on_hand');
            if (onHandQty) {
              results[sku] = {
                quantity: onHandQty.quantity,
                discontinued: isDiscontinued
              };
            }
            break;
          }
        }
        
        // 如果没有 MTL10 库存但有 discontinued 信息，也记录
        if (!results[sku] && isDiscontinued) {
          results[sku] = {
            quantity: 0,
            discontinued: true
          };
        }
      });
      
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: Processed ${batch.length} SKUs`);
    }
    
    console.log(`✓ Fetched MTL10 inventory for ${Object.keys(results).length}/${uniqueSkus.length} SKUs`);
    return results;
  } catch (error) {
    console.error('❌ Error fetching batch MTL10 inventory:', error.message);
    return {};
  }
}

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

// Update item status — with optimistic locking and transfer cleanup
router.patch('/items/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, version } = req.body;

    // ── Optimistic locking ──────────────────────────────────────────────────
    // If version is provided, check for conflicts
    if (version !== undefined && version !== null) {
      const current = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
      if (!current) return res.status(404).json({ error: 'Item not found' });

      if (current.version !== version) {
        // Conflict — return current state so frontend can show the right message
        return res.status(409).json({
          conflict: true,
          currentStatus: current.picker_status,
          currentVersion: current.version,
          message: `Item status has been changed by another user`
        });
      }
    }

    // Fetch current item before update
    const item = await db.prepare('SELECT * FROM line_items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const previousStatus = item.picker_status;

    // Update status and increment version
    await db.prepare(`
      UPDATE line_items 
      SET picker_status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    // ── Handle picking (undo) → delete transferring item immediately ──────────
    // When a missing item is undone, immediately remove its transferring entry
    if (status === 'picking') {
      const transferringItem = await db.prepare(
        "SELECT id FROM transfer_items WHERE line_item_id = ? AND status = 'transferring'"
      ).get(id);
      if (transferringItem) {
        await db.prepare("DELETE FROM transfer_items WHERE id = ?").run(transferringItem.id);
        console.log(`Undo: deleted transferring item for line_item ${id}`);
      }
    }

    // ── Handle missing → create transfer item ───────────────────────────────
    if (status === 'missing') {
      // Check if a transferring item already exists to avoid duplicates
      const existingTransfer = await db.prepare(
        'SELECT id FROM transfer_items WHERE line_item_id = ? AND status = ?'
      ).get(id, 'transferring');

      if (!existingTransfer) {
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
    }

    // ── Handle picked → warn if waiting transfer exists ─────────────────────
    // Note: no auto-delete of transferring here — undo (picking) handles that
    let transferWarning = null;
    if (status === 'picked') {
      const waitingItem = await db.prepare(
        "SELECT transfer_from FROM transfer_items WHERE line_item_id = ? AND status = 'waiting'"
      ).get(id);
      if (waitingItem) {
        transferWarning = {
          type: 'waiting',
          location: waitingItem.transfer_from
        };
      }
    }

    // Get updated item with new version
    const updated = await db.prepare('SELECT version, picker_status FROM line_items WHERE id = ?').get(id);

    res.json({ success: true, newVersion: updated.version, transferWarning });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/picker/active-users — returns count of active picker sessions
router.get('/active-users', async (req, res) => {
  try {
    // Clean up sessions older than 30 seconds
    try {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < NOW() - INTERVAL '30 seconds'"
      ).run();
    } catch {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < datetime('now', '-30 seconds')"
      ).run();
    }

    const result = await db.prepare('SELECT COUNT(*) as count FROM picker_sessions').get();
    res.json({ count: parseInt(result.count) || 0 });
  } catch (error) {
    res.json({ count: 0 });
  }
});

// POST /api/picker/heartbeat — register/refresh active session
router.post('/heartbeat', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.json({ success: false });

    await db.prepare(`
      INSERT INTO picker_sessions (session_id, last_seen)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT (session_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP
    `).run(sessionId);

    // Clean up old sessions while we're here
    try {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < NOW() - INTERVAL '30 seconds'"
      ).run();
    } catch {
      await db.prepare(
        "DELETE FROM picker_sessions WHERE last_seen < datetime('now', '-30 seconds')"
      ).run();
    }

    const result = await db.prepare('SELECT COUNT(*) as count FROM picker_sessions').get();
    res.json({ success: true, activeUsers: parseInt(result.count) || 0 });
  } catch (error) {
    res.json({ success: false, activeUsers: 1 });
  }
});

// DELETE /api/picker/heartbeat — remove session on page unload
router.delete('/heartbeat', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await db.prepare('DELETE FROM picker_sessions WHERE session_id = ?').run(sessionId);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// POST /api/picker/heartbeat/remove — remove session (used by sendBeacon and axios on unmount)
router.post('/heartbeat/remove', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await db.prepare('DELETE FROM picker_sessions WHERE session_id = ?').run(sessionId);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: false });
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
        variant_title, lookups, picker_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missing', CURRENT_TIMESTAMP)
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
      item.variant_title,
      item.lookups
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

// 🆕 批量获取 MTL10 库存
router.post('/items/batch-mtl10-inventory', async (req, res) => {
  try {
    const { itemIds } = req.body;
    
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.json({ inventory: {} });
    }
    
    console.log(`\n📦 Batch MTL10 inventory request for ${itemIds.length} items`);
    
    // 获取所有 items 的 SKU
    const placeholders = itemIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT id, sku FROM line_items WHERE id IN (${placeholders})`
    ).all(...itemIds);
    
    console.log(`  Found ${items.length} items in database`);
    
    // 提取所有 SKU
    const skus = items.map(item => item.sku).filter(sku => sku);
    
    if (skus.length === 0) {
      console.log(`  No SKUs to query`);
      return res.json({ inventory: {} });
    }
    
    // 批量查询 MTL10 库存
    const inventoryBySku = await getBatchMTL10Inventory(skus);
    
    // 将结果映射回 item ID
    const inventoryByItemId = {};
    items.forEach(item => {
      if (item.sku && inventoryBySku[item.sku] !== undefined) {
        inventoryByItemId[item.id] = inventoryBySku[item.sku];
      }
    });
    
    console.log(`✓ Returning inventory for ${Object.keys(inventoryByItemId).length} items\n`);
    
    res.json({ inventory: inventoryByItemId });
  } catch (error) {
    console.error('❌ Error in batch MTL10 inventory:', error);
    res.json({ inventory: {} });
  }
});

// 🆕 检查已完成的订单（用于 Clean 功能）
router.get('/check-fulfilled-orders', async (req, res) => {
  try {
    console.log('\n🧹 Checking for fulfilled orders...');
    
    // 获取所有在 Picker 中的 items 及其订单信息
    const items = await db.prepare(`
      SELECT 
        li.id,
        li.shopify_order_id,
        li.quantity,
        li.name,
        o.name as order_name,
        o.fulfillment_status
      FROM line_items li
      JOIN orders o ON li.shopify_order_id = o.shopify_order_id
      WHERE o.fulfillment_status != 'fulfilled'
    `).all();
    
    console.log(`  Found ${items.length} items in picker`);
    
    // 获取所有唯一的订单
    const uniqueOrders = [...new Set(items.map(item => item.shopify_order_id))];
    
    console.log(`  Checking ${uniqueOrders.length} unique orders in Shopify...`);
    
    // 查询 Shopify 获取最新的 fulfillment status
    const ordersToClean = [];
    const itemsToClean = [];
    
    for (const shopifyOrderId of uniqueOrders) {
      try {
        // 使用 REST API 查询订单状态
        const client = await shopifyClient.getClient();
        const response = await client.get(`/orders/${shopifyOrderId}.json`);
        const order = response.data.order;
        
        // 如果订单已完成（fulfillment_status 不是 null 且不是 unfulfilled）
        if (order.fulfillment_status && order.fulfillment_status !== 'unfulfilled') {
          console.log(`  ✓ Order ${order.name} is ${order.fulfillment_status}`);
          
          // 找到该订单的所有 items
          const orderItems = items.filter(item => item.shopify_order_id === shopifyOrderId);
          
          ordersToClean.push({
            shopify_order_id: shopifyOrderId,
            order_name: order.name,
            fulfillment_status: order.fulfillment_status,
            item_count: orderItems.length,
            total_quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0)
          });
          
          itemsToClean.push(...orderItems.map(item => item.id));
        }
      } catch (error) {
        console.error(`  ❌ Error checking order ${shopifyOrderId}:`, error.message);
      }
    }
    
    console.log(`✓ Found ${ordersToClean.length} orders to clean with ${itemsToClean.length} items\n`);
    
    res.json({
      orders: ordersToClean,
      item_ids: itemsToClean,
      total_items: itemsToClean.length,
      total_quantity: ordersToClean.reduce((sum, order) => sum + order.total_quantity, 0)
    });
  } catch (error) {
    console.error('❌ Error checking fulfilled orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 清理已完成订单的 items
router.post('/clean-fulfilled-items', async (req, res) => {
  try {
    const { item_ids } = req.body;
    
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.json({ success: true, deleted_count: 0 });
    }
    
    console.log(`\n🗑️ Cleaning ${item_ids.length} items from picker...`);
    
    // 删除 items
    const placeholders = item_ids.map(() => '?').join(',');
    const result = await db.prepare(
      `DELETE FROM line_items WHERE id IN (${placeholders})`
    ).run(...item_ids);
    
    console.log(`✓ Deleted ${result.changes} items\n`);
    
    res.json({
      success: true,
      deleted_count: result.changes
    });
  } catch (error) {
    console.error('❌ Error cleaning fulfilled items:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;