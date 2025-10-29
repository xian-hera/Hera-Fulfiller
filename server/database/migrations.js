const db = require('./init');

console.log('Running database migrations...');

// 1. Add has_weight_warning column
try {
  db.prepare(`
    ALTER TABLE line_items ADD COLUMN has_weight_warning INTEGER DEFAULT 0
  `).run();
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

// 🆕 4. Add wig_number column to line_items
try {
  db.prepare(`
    ALTER TABLE line_items ADD COLUMN wig_number TEXT
  `).run();
  console.log('✓ Added wig_number column to line_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column wig_number already exists in line_items');
  } else {
    console.error('✗ Error adding wig_number to line_items:', error.message);
  }
}

// 🆕 5. Add custom_name column to line_items
try {
  db.prepare(`
    ALTER TABLE line_items ADD COLUMN custom_name TEXT
  `).run();
  console.log('✓ Added custom_name column to line_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column custom_name already exists in line_items');
  } else {
    console.error('✗ Error adding custom_name to line_items:', error.message);
  }
}

// 🆕 6. Add custom_name column to transfer_items
try {
  db.prepare(`
    ALTER TABLE transfer_items ADD COLUMN custom_name TEXT
  `).run();
  console.log('✓ Added custom_name column to transfer_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column custom_name already exists in transfer_items');
  } else {
    console.error('✗ Error adding custom_name to transfer_items:', error.message);
  }
}

// 🆕 7. Add transfer_date column to transfer_items
try {
  db.prepare(`
    ALTER TABLE transfer_items ADD COLUMN transfer_date TEXT
  `).run();
  console.log('✓ Added transfer_date column to transfer_items');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column transfer_date already exists in transfer_items');
  } else {
    console.error('✗ Error adding transfer_date to transfer_items:', error.message);
  }
}

// 🆕 8. Add packer_note column to orders
try {
  db.prepare(`
    ALTER TABLE orders ADD COLUMN packer_note TEXT
  `).run();
  console.log('✓ Added packer_note column to orders');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column packer_note already exists in orders');
  } else {
    console.error('✗ Error adding packer_note to orders:', error.message);
  }
}

console.log('Migration completed!');