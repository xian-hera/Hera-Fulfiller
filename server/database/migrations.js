const db = require('./init');

console.log('Running database migrations...');

// 1. Add has_weight_warning column
try {
  db.exec(`
    ALTER TABLE line_items ADD COLUMN has_weight_warning INTEGER DEFAULT 0;
  `);
  console.log('✓ Added has_weight_warning column');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column has_weight_warning already exists');
  } else {
    console.error('✗ Error adding has_weight_warning:', error.message);
  }
}

// 2. Convert existing weights from kg to g if needed
try {
  const items = db.prepare('SELECT id, weight, weight_unit FROM line_items').all();
  
  let converted = 0;
  for (const item of items) {
    if (item.weight && item.weight > 0 && item.weight < 10 && item.weight_unit === 'kg') {
      // Likely stored as kg, convert to g
      const weightInGrams = item.weight * 1000;
      db.prepare('UPDATE line_items SET weight = ?, weight_unit = ? WHERE id = ?')
        .run(weightInGrams, 'g', item.id);
      converted++;
    }
  }
  
  if (converted > 0) {
    console.log(`✓ Converted ${converted} items from kg to g`);
  }
} catch (error) {
  console.error('✗ Error converting weights:', error.message);
}

// 3. Set has_weight_warning for existing records
try {
  const result = db.prepare(`
    UPDATE line_items 
    SET has_weight_warning = 1 
    WHERE weight = 0 OR weight_unit != 'g'
  `).run();
  
  console.log(`✓ Marked ${result.changes} items with weight warnings`);
} catch (error) {
  console.error('✗ Error setting weight warnings:', error.message);
}

console.log('Migration completed!');