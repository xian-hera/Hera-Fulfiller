// check-order-ids.js
const db = require('./server/database/init');

console.log('=== Checking Order IDs ===\n');

// 查找订单号 1019 的订单
const order = db.prepare(`
  SELECT shopify_order_id, order_number, name, created_at
  FROM orders
  WHERE order_number = '1019'
`).get();

if (order) {
  console.log('Order found:');
  console.log(`  shopify_order_id: ${order.shopify_order_id}`);
  console.log(`  order_number: ${order.order_number}`);
  console.log(`  name: ${order.name}`);
  console.log(`  created_at: ${order.created_at}`);
  
  // 查找该订单的 line_items
  const items = db.prepare(`
    SELECT id, shopify_line_item_id, quantity
    FROM line_items
    WHERE shopify_order_id = ?
  `).all(order.shopify_order_id);
  
  console.log(`\n  Line items (using shopify_order_id): ${items.length}`);
  items.forEach(item => {
    console.log(`    - ID: ${item.id}, LineItemID: ${item.shopify_line_item_id}, Qty: ${item.quantity}`);
  });
} else {
  console.log('❌ Order #1019 not found in orders table!');
}

// 检查所有订单
console.log('\n=== All Recent Orders ===');
const allOrders = db.prepare(`
  SELECT shopify_order_id, order_number, name
  FROM orders
  ORDER BY created_at DESC
  LIMIT 5
`).all();
console.table(allOrders);