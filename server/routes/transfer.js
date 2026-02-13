const express = require('express');
const router = express.Router();
const db = require('../database/init');
const shopifyClient = require('../shopify/client');

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
  'MTL05EXP',
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

    const response = await shopifyClient.client.post('/graphql.json', {
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