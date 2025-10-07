const db = require('./server/database/init');

const items = db.prepare(`
  SELECT id, sku, weight, weight_unit, brand, title 
  FROM line_items 
  LIMIT 5
`).all();

console.table(items);