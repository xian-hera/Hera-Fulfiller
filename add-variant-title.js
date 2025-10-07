const db = require('./server/database/init');

try {
  db.exec(`
    ALTER TABLE line_items ADD COLUMN variant_title TEXT;
  `);
  console.log('✓ Added variant_title column');
} catch (error) {
  if (error.message.includes('duplicate column')) {
    console.log('✓ Column variant_title already exists');
  } else {
    console.error('✗ Error:', error.message);
  }
}