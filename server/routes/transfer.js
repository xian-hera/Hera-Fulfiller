const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');
// 🆕 复用 shopify-transfer.js 里的自动创建 / 自动 commit 逻辑
const { createShopifyTransfersForItems, tryAutoCommitShopifyTransfer } = require('./shopify-transfer');

// Emoji mapping for transfer from
const EMOJI_MAP = {
  '01': '🟫', '02': '🟧', '03': '🟨', '04': '🟩', '05': '⬛',
  '06': '🟪', '07': '🟥', '08': '⬜', '09': '🟦', '11': '🔳'
};

// 🆕 固定的 location 列表
const LOCATIONS = [
  'MTL01',
  'MTL02',
  'MTL03',
  'MTL04',
  'MTL05',
  'MTL06',
  'MTL07',
  'MTL08',
  'MTL09',
  'MTL11'
];

// Get all transfer items
router.get('/items', async (req, res) => {
  try {
    // 🔧 FIX: 直接查询 transfer_items，不依赖 line_items（避免订单删除后 transfer items 查询不到）
    const items = await db.prepare(`
      SELECT * FROM transfer_items
      ORDER BY created_at DESC
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
    // 🔧 FIX: 直接查询 transfer_items，不依赖 line_items（避免订单删除后查询失败）
    const item = await db.prepare(`
      SELECT * FROM transfer_items
      WHERE id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // 🆕 变量定义
    // A = emoji + transfer_from + emoji (只在 waiting 状态使用)
    // B = quantity (如果 > 1，用 "pcs"，否则用 "pc")
    // C = custom_name (优先级: custom_name > title)，WIG 类型在前面加 wig_number
    // D = SKU
    // E = order_number (只在 waiting 状态使用)

    const B = item.quantity;
    const pcText = B > 1 ? 'pcs' : 'pc';
    const D = item.sku || '';
    const E = item.order_number || '';

    // 对 WIG 类型，从 line_items 查 wig_number 并加在产品名前面
    let wigPrefix = '';
    if (item.product_type && item.product_type.toUpperCase() === 'WIG') {
      const lineItem = await db.prepare(
        'SELECT wig_number FROM line_items WHERE id = ?'
      ).get(item.line_item_id);
      if (lineItem?.wig_number) {
        wigPrefix = `${lineItem.wig_number} `;
      }
    }

    const C = `${wigPrefix}${item.custom_name || item.title || ''}`;

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

// 🆕 生成库存报表
router.get('/stock-report', async (req, res) => {
  try {
    console.log('\n========== GENERATING STOCK REPORT ==========');

    // 1. 获取所有 transferring 状态的 items
    const transferringItems = await db.prepare(`
      SELECT sku, MAX(title) as title, SUM(quantity) as total_quantity
      FROM transfer_items
      WHERE status = 'transferring'
      GROUP BY sku
      ORDER BY MAX(title)
    `).all();

    console.log(`Found ${transferringItems.length} unique SKUs in transferring status`);

    if (transferringItems.length === 0) {
      console.log('❌ No transferring items found');
      return res.status(404).json({ 
        error: 'No transferring items found',
        message: 'There are no items in transferring status to generate a report for.'
      });
    }

    // 显示前几个 SKU
    console.log('First few SKUs:');
    transferringItems.slice(0, 3).forEach(item => {
      console.log(`  - ${item.sku}: ${item.title} (qty: ${item.total_quantity})`);
    });

    // 2. 为每个 SKU 查询 Shopify 库存
    const reportData = [];
    let successCount = 0;
    let failCount = 0;

    for (const item of transferringItems) {
      const inventoryData = await getInventoryBySku(item.sku);
      
      reportData.push({
        title: item.title,
        sku: item.sku,
        quantityNeeded: item.total_quantity,
        inventory: inventoryData
      });

      const locationCount = Object.keys(inventoryData).length;
      if (locationCount > 0) {
        successCount++;
        console.log(`✓ SKU ${item.sku}: ${locationCount} locations found`);
      } else {
        failCount++;
        console.log(`✗ SKU ${item.sku}: No inventory data`);
      }
    }

    console.log(`\n========== SUMMARY ==========`);
    console.log(`Total SKUs processed: ${transferringItems.length}`);
    console.log(`Successful: ${successCount} (with inventory data)`);
    console.log(`Failed: ${failCount} (no inventory data)`);
    console.log(`============================\n`);

    // 3. 生成 CSV
    const csv = generateCSV(reportData);

    // 4. 返回 CSV 文件
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stock-report-${Date.now()}.csv"`);
    res.send(csv);

    console.log('========== STOCK REPORT GENERATED SUCCESSFULLY ==========\n');
  } catch (error) {
    console.error('\n========== STOCK REPORT ERROR ==========');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('=======================================\n');
    
    res.status(500).json({ 
      error: 'Failed to generate stock report',
      message: error.message 
    });
  }
});

// 🆕 通过 SKU 查询库存（使用 GraphQL）
async function getInventoryBySku(sku) {
  try {
    console.log(`\n--- Querying inventory for SKU: ${sku} ---`);
    
    const query = `
      query getInventoryBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              inventoryItem {
                id
                inventoryLevels(first: 50) {
                  edges {
                    node {
                      location {
                        name
                      }
                      quantities(names: ["available"]) {
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

    const searchQuery = `sku:${sku}`;
    console.log(`GraphQL search query: "${searchQuery}"`);

    const client = await shopifyClient.getClient();
    const response = await client.post('/graphql.json', {
      query,
      variables: { query: searchQuery }
    });

    console.log(`Response status: ${response.status}`);
    
    // 检查是否有 GraphQL errors
    if (response.data.errors) {
      console.error('❌ GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
      return {};
    }

    // 检查 data 结构
    if (!response.data.data) {
      console.error('❌ No data in response');
      console.error('Response:', JSON.stringify(response.data, null, 2));
      return {};
    }

    const edges = response.data.data?.productVariants?.edges || [];
    console.log(`Found ${edges.length} variant(s) for SKU: ${sku}`);

    if (edges.length === 0) {
      console.log(`❌ No variant found - returning empty inventory`);
      return {};
    }

    const variant = edges[0].node;
    console.log(`✓ Variant ID: ${variant.id}, SKU: ${variant.sku}`);
    
    if (!variant.inventoryItem) {
      console.log(`❌ No inventoryItem for variant`);
      return {};
    }

    const inventoryLevels = variant.inventoryItem.inventoryLevels?.edges || [];
    console.log(`Found ${inventoryLevels.length} inventory level(s)`);

    if (inventoryLevels.length === 0) {
      console.log(`❌ No inventory levels found`);
      return {};
    }

    // 转换为 location => available 的映射
    const inventory = {};
    inventoryLevels.forEach(level => {
      const locationName = level.node.location.name;
      
      // 从 quantities 数组中获取 available 数量
      const availableQty = level.node.quantities?.find(q => q.name === 'available');
      const available = availableQty ? availableQty.quantity : 0;
      
      inventory[locationName] = available;
      console.log(`  ✓ ${locationName}: ${available}`);
    });

    console.log(`✓ SUCCESS: Retrieved inventory for ${sku}: ${Object.keys(inventory).length} locations`);
    return inventory;
  } catch (error) {
    console.error(`❌ EXCEPTION in getInventoryBySku for ${sku}:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return {};  // 返回空对象而不是抛出错误
  }
}

// 🆕 生成 CSV 内容
function generateCSV(reportData) {
  // CSV Header
  const headers = ['Title', 'SKU', 'Quantity needed', ...LOCATIONS];
  let csv = headers.join(',') + '\n';

  // CSV Rows
  reportData.forEach(item => {
    const row = [
      `"${item.title.replace(/"/g, '""')}"`,  // 转义引号
      item.sku,
      item.quantityNeeded
    ];

    // 为每个 location 添加列
    LOCATIONS.forEach(location => {
      const available = item.inventory[location];

      // 只有当库存 >= 需求时，才标记
      if (available !== undefined && available >= item.quantityNeeded) {
        row.push(`[OK] ${available}`);
      } else {
        // 库存不足或无库存，留空
        row.push('');
      }
    });

    csv += row.join(',') + '\n';
  });

  return csv;
}

// Update transfer item status
router.patch('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transfer_from, estimate_month, estimate_day, out_of_stock } = req.body;

    // 🆕 先取出旧值，供 log 记录（需求5/6）和自动 commit 判断（需求3）使用
    const existingItem = await db.prepare('SELECT * FROM transfer_items WHERE id = ?').get(id);
    if (!existingItem) {
      return res.status(404).json({ error: 'Transfer item not found' });
    }

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

    // 🆕 处理 out_of_stock 状态
    if (out_of_stock !== undefined) {
      updates.push('out_of_stock = ?');
      values.push(out_of_stock ? 1 : 0);
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

    // 🆕 从 received/waiting 退回 waiting（undo），重置扫描进度，避免残留脏数据
    if (status === 'waiting' && existingItem.status === 'received') {
      updates.push('received_scanned_count = 0');
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    await db.prepare(`
      UPDATE transfer_items 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    // 🆕 需求5：编辑 waiting item 的 Transfer From 或 Estimated Arrival（任一变化），
    // 且该 item 已经打上 connecteam 或 shopify tag → 写入 log
    const planFieldsChanged =
      (transfer_from !== undefined && transfer_from !== existingItem.transfer_from) ||
      (estimate_month !== undefined && (
        estimate_month !== existingItem.estimate_month || estimate_day !== existingItem.estimate_day
      ));

    if (planFieldsChanged && (existingItem.connecteam_tasked || existingItem.shopify_transferred)) {
      await db.prepare(`
        INSERT INTO transfer_logs (
          log_type, sku, quantity,
          old_transfer_from, old_estimate_month, old_estimate_day,
          new_transfer_from, new_estimate_month, new_estimate_day
        ) VALUES ('plan_changed', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        existingItem.sku,
        existingItem.quantity,
        existingItem.transfer_from,
        existingItem.estimate_month,
        existingItem.estimate_day,
        transfer_from !== undefined ? transfer_from : existingItem.transfer_from,
        estimate_month !== undefined ? estimate_month : existingItem.estimate_month,
        estimate_day !== undefined ? estimate_day : existingItem.estimate_day
      );
      console.log(`Logged plan change for item ${id} (SKU ${existingItem.sku})`);
    }

    let autoCommit = null;

    // 🆕 需求6：waiting -> received（点击或扫码，走的都是这个 PATCH）写 log
    // 🆕 需求3+4：如果这个 item 属于某个 Shopify Transfer，检查是不是最后一个，是的话自动 commit + clear
    if (status === 'received' && existingItem.status !== 'received') {
      await db.prepare(`
        INSERT INTO transfer_logs (log_type, sku, quantity, transfer_from, order_number)
        VALUES ('received', ?, ?, ?, ?)
      `).run(existingItem.sku, existingItem.quantity, existingItem.transfer_from, existingItem.order_number);

      if (existingItem.shopify_transfer_number) {
        autoCommit = await tryAutoCommitShopifyTransfer(existingItem.shopify_transfer_number);
      }
    }

    res.json({ success: true, autoCommit });
  } catch (error) {
    console.error('Error updating transfer item:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 需求2 Case C：quantity > 1 的 waiting item 扫码累加进度
// 每次扫描调用一次，+1；达到 quantity 就变成 received（复用需求3/6同一套 log + 自动 commit 逻辑）
// 扫到别的 barcode 不会影响这里的进度——因为这个接口只在"确认命中该 item"之后才会被调用一次，
// 前端每次扫描都是独立判断该扫哪个 item，这个接口本身不需要知道"是不是扫错了"
router.patch('/items/:id/scan-progress', async (req, res) => {
  try {
    const { id } = req.params;

    const item = await db.prepare('SELECT * FROM transfer_items WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: 'Transfer item not found' });
    }
    if (item.status !== 'waiting') {
      return res.status(400).json({ error: 'Item is not in waiting status' });
    }

    const newCount = (item.received_scanned_count || 0) + 1;

    if (newCount >= item.quantity) {
      // 达到 total：变成 received，走跟需求6/需求3一样的 log + 自动 commit 逻辑
      await db.prepare(`
        UPDATE transfer_items
        SET received_scanned_count = ?, status = 'received', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, id);

      await db.prepare(`
        INSERT INTO transfer_logs (log_type, sku, quantity, transfer_from, order_number)
        VALUES ('received', ?, ?, ?, ?)
      `).run(item.sku, item.quantity, item.transfer_from, item.order_number);

      let autoCommit = null;
      if (item.shopify_transfer_number) {
        autoCommit = await tryAutoCommitShopifyTransfer(item.shopify_transfer_number);
      }

      return res.json({
        success: true,
        receivedScannedCount: newCount,
        quantity: item.quantity,
        completed: true,
        autoCommit,
      });
    } else {
      // 还没到 total：只更新进度，状态维持 waiting
      await db.prepare(`
        UPDATE transfer_items
        SET received_scanned_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, id);

      return res.json({
        success: true,
        receivedScannedCount: newCount,
        quantity: item.quantity,
        completed: false,
      });
    }
  } catch (error) {
    console.error('Error updating scan progress:', error);
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
        url_handle, product_type, variant_title, custom_name, lookups, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'transferring')
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
      item.custom_name,
      item.lookups
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

    console.log(`Bulk delete request: ${ids.length} items`);

    // 🆕 先检查哪些 ID 实际存在
    const placeholdersCheck = ids.map(() => '?').join(',');
    const existingItems = await db.prepare(
      `SELECT id FROM transfer_items WHERE id IN (${placeholdersCheck})`
    ).all(...ids);

    const existingIds = existingItems.map(item => item.id);
    const notFoundIds = ids.filter(id => !existingIds.includes(id));

    if (notFoundIds.length > 0) {
      console.log(`Warning: ${notFoundIds.length} items not found (already deleted):`, notFoundIds);
    }

    if (existingIds.length === 0) {
      console.log('No items to delete (all already deleted)');
      return res.json({ 
        success: true, 
        deleted: 0,
        message: 'No items found to delete (may have been already deleted)'
      });
    }

    // 🆕 只删除实际存在的 items
    const placeholders = existingIds.map(() => '?').join(',');
    const result = await db.prepare(
      `DELETE FROM transfer_items WHERE id IN (${placeholders})`
    ).run(...existingIds);

    console.log(`Successfully deleted ${existingIds.length} items`);

    res.json({ 
      success: true, 
      deleted: existingIds.length,
      notFound: notFoundIds.length
    });
  } catch (error) {
    console.error('Error bulk deleting transfer items:', error);
    
    // 🆕 返回更详细的错误信息
    res.status(500).json({ 
      error: 'Failed to delete items',
      message: error.message,
      code: error.code
    });
  }
});
// 在 server/routes/transfer.js 中添加以下两个 endpoints

// 🆕 Transfer Planner: 批量查询库存
router.post('/check-planner-stock', async (req, res) => {
  try {
    const { skus, locations } = req.body;
    
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.json({ inventory: [] });
    }
    
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.json({ inventory: [] });
    }

    console.log(`\n📦 Transfer Planner: Checking stock`);
    console.log(`  SKUs: ${skus.length}`);
    console.log(`  Locations: ${locations.join(', ')}`);

    // 使用现有的批量查询函数
    const results = [];
    
    for (const sku of skus) {
      try {
        const query = `
          query getInventoryBySku($query: String!) {
            productVariants(first: 1, query: $query) {
              edges {
                node {
                  id
                  sku
                  inventoryItem {
                    id
                    inventoryLevels(first: 50) {
                      edges {
                        node {
                          location {
                            name
                          }
                          quantities(names: ["available"]) {
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
          variables: { query: `sku:${sku}` }
        });

        const edges = response.data.data?.productVariants?.edges || [];
        
        if (edges.length > 0) {
          const inventoryLevels = edges[0].node.inventoryItem?.inventoryLevels?.edges || [];
          
          // 只返回请求的 locations
          inventoryLevels.forEach(level => {
            const locationName = level.node.location.name;
            
            if (locations.includes(locationName)) {
              const availableQty = level.node.quantities?.find(q => q.name === 'available');
              const qoh = availableQty ? availableQty.quantity : 0;
              
              results.push({
                sku,
                location: locationName,
                qoh
              });
            }
          });
        }
      } catch (error) {
        console.error(`Error fetching inventory for SKU ${sku}:`, error.message);
      }
    }

    console.log(`  ✓ Fetched inventory for ${results.length} SKU-location pairs`);
    
    res.json({ inventory: results });
  } catch (error) {
    console.error('Error in check-planner-stock:', error);
    res.status(500).json({ error: 'Failed to check stock' });
  }
});

// 🆕 Transfer Planner: 批量更新 items
router.post('/batch-update-planner', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items to update' });
    }

    console.log(`\n📦 Transfer Planner: Batch update ${items.length} items`);

    // 批量更新
    for (const item of items) {
      const { id, transfer_from, estimate_month, estimate_day, status } = item;
      
      // 生成 transfer_date (MM/DD 格式)
      const transfer_date = `${estimate_month.toString().padStart(2, '0')}/${estimate_day.toString().padStart(2, '0')}`;
      
      await db.prepare(`
        UPDATE transfer_items
        SET transfer_from = ?,
            estimate_month = ?,
            estimate_day = ?,
            transfer_date = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(transfer_from, estimate_month, estimate_day, transfer_date, status, id);

      console.log(`  ✓ Updated item ${id}: ${transfer_from}, ${transfer_date}`);
    }

    console.log(`✓ Batch update complete`);

    // 🆕 需求1：Planner 提交之后，立刻自动创建 Shopify Transfer（按 location 分组，永远 create 不 add-to）
    // 用的是同一批刚刚设为 waiting 的 item id
    const itemIds = items.map(i => i.id);
    let shopifyTransferResult = null;
    try {
      shopifyTransferResult = await createShopifyTransfersForItems(itemIds);
      console.log(`✓ Auto-created Shopify Transfer(s):`, shopifyTransferResult.results?.map(r => r.transferNumber));
      if (shopifyTransferResult.errors?.length > 0) {
        console.error('Shopify Transfer auto-create errors:', shopifyTransferResult.errors);
      }
    } catch (shopifyErr) {
      console.error('Error auto-creating Shopify Transfer after Planner submit:', shopifyErr.message);
      shopifyTransferResult = { success: false, results: [], errors: [shopifyErr.message] };
    }

    res.json({ success: true, updated: items.length, shopifyTransfer: shopifyTransferResult });
  } catch (error) {
    console.error('Error in batch-update-planner:', error);
    res.status(500).json({ error: 'Failed to update items' });
  }
});

// 🆕 需求5/6：获取所有 transfer log（混排，按时间倒序，最新在最前）
router.get('/logs', async (req, res) => {
  try {
    const logs = await db.prepare(`
      SELECT * FROM transfer_logs ORDER BY created_at DESC
    `).all();
    res.json(logs);
  } catch (error) {
    console.error('Error fetching transfer logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🆕 需求5：清空所有 transfer log
router.delete('/logs', async (req, res) => {
  try {
    await db.prepare('DELETE FROM transfer_logs').run();
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing transfer logs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;