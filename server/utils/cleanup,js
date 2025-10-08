const db = require('../database/init');

// 清理 60 天前的所有订单和相关数据
async function cleanupOldData() {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  console.log(`Starting cleanup for data older than ${sixtyDaysAgo.toISOString()}`);

  try {
    if (db.type === 'postgres') {
      // PostgreSQL 版本
      // 1. 获取要删除的订单
      const oldOrders = await db.prepare(`
        SELECT shopify_order_id, name FROM orders 
        WHERE created_at < $1
      `).all(sixtyDaysAgo.toISOString());

      if (oldOrders.length === 0) {
        console.log('No old data to clean up');
        return { deleted: 0 };
      }

      console.log(`Found ${oldOrders.length} orders to delete`);

      // 2. 删除 transfer_items（先删除，因为引用 line_items）
      const transferDeleted = await db.prepare(`
        DELETE FROM transfer_items 
        WHERE shopify_order_id IN (
          SELECT shopify_order_id FROM orders WHERE created_at < $1
        )
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${transferDeleted.changes} transfer items`);

      // 3. 删除 line_items
      const lineItemsDeleted = await db.prepare(`
        DELETE FROM line_items 
        WHERE shopify_order_id IN (
          SELECT shopify_order_id FROM orders WHERE created_at < $1
        )
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${lineItemsDeleted.changes} line items`);

      // 4. 删除 orders
      const ordersDeleted = await db.prepare(`
        DELETE FROM orders WHERE created_at < $1
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${ordersDeleted.changes} orders`);

      return {
        deleted: oldOrders.length,
        orders: oldOrders.map(o => o.name)
      };

    } else {
      // SQLite 版本
      // 1. 获取要删除的订单
      const oldOrders = db.db.prepare(`
        SELECT shopify_order_id, name FROM orders 
        WHERE created_at < ?
      `).all(sixtyDaysAgo.toISOString());

      if (oldOrders.length === 0) {
        console.log('No old data to clean up');
        return { deleted: 0 };
      }

      console.log(`Found ${oldOrders.length} orders to delete`);

      const orderIds = oldOrders.map(o => o.shopify_order_id);
      const placeholders = orderIds.map(() => '?').join(',');

      // 2. 删除 transfer_items
      const transferDeleted = db.db.prepare(`
        DELETE FROM transfer_items 
        WHERE shopify_order_id IN (${placeholders})
      `).run(...orderIds);

      console.log(`Deleted ${transferDeleted.changes} transfer items`);

      // 3. 删除 line_items
      const lineItemsDeleted = db.db.prepare(`
        DELETE FROM line_items 
        WHERE shopify_order_id IN (${placeholders})
      `).run(...orderIds);

      console.log(`Deleted ${lineItemsDeleted.changes} line items`);

      // 4. 删除 orders
      const ordersDeleted = db.db.prepare(`
        DELETE FROM orders WHERE created_at < ?
      `).run(sixtyDaysAgo.toISOString());

      console.log(`Deleted ${ordersDeleted.changes} orders`);

      return {
        deleted: oldOrders.length,
        orders: oldOrders.map(o => o.name)
      };
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    throw error;
  }
}

// 定时任务：每天凌晨 2 点运行
function scheduleCleanup() {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // 明天
    2, 0, 0 // 凌晨 2 点
  );
  const msToMidnight = night.getTime() - now.getTime();

  // 首次延迟到凌晨 2 点
  setTimeout(() => {
    cleanupOldData().catch(console.error);
    // 之后每 24 小时运行一次
    setInterval(() => {
      cleanupOldData().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  console.log(`Cleanup scheduled for ${night.toISOString()}`);
}

module.exports = { cleanupOldData, scheduleCleanup };