const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const db = require('../database/init');

// 使用内存存储而不是磁盘
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settingsRows = await db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });

    const boxTypes = await db.prepare('SELECT * FROM box_types ORDER BY code').all();

    res.json({ settings, boxTypes });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings: ' + error.message });
  }
});

// Test endpoint to check CSV data
router.get('/test-csv/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const csvData = await db.prepare('SELECT * FROM csv_data WHERE sku = ?').get(sku);
    
    if (csvData) {
      res.json({
        found: true,
        sku: csvData.sku,
        data: JSON.parse(csvData.data)
      });
    } else {
      const totalCount = await db.prepare('SELECT COUNT(*) as count FROM csv_data').get();
      res.json({ 
        found: false, 
        sku,
        totalRecordsInDb: totalCount.count
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.post('/update', async (req, res) => {
  try {
    const { transferCsvColumn, pickerWigColumn, skuColumn } = req.body;

    if (transferCsvColumn) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('transfer_csv_column', transferCsvColumn.toUpperCase());
    }

    if (pickerWigColumn) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('picker_wig_column', pickerWigColumn.toUpperCase());
    }

    if (skuColumn) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `).run('sku_column', skuColumn.toUpperCase());
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings: ' + error.message });
  }
});

// Upload CSV file
router.post('/upload-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('CSV upload started');
    const results = [];

    // 从内存缓冲区创建可读流
    const bufferStream = Readable.from(req.file.buffer);

    bufferStream
      .pipe(csv({ headers: false }))
      .on('data', (data) => {
        const rowArray = Object.values(data);
        results.push(rowArray);
      })
      .on('end', async () => {
        try {
          console.log(`Total rows in CSV: ${results.length}`);
          
          if (results.length === 0) {
            throw new Error('CSV file is empty');
          }

          const startTime = Date.now();
          
          // Skip first row (headers)
          const dataRows = results.slice(1);
          console.log(`Processing ${dataRows.length} data rows...`);

          // Clear existing CSV data
          await db.prepare('DELETE FROM csv_data').run();

          let importedCount = 0;
          let skippedCount = 0;

          for (const rowArray of dataRows) {
            // Convert array to object with letter keys
            const row = {};
            rowArray.forEach((value, idx) => {
              const letter = String.fromCharCode(65 + idx);
              row[letter] = value || '';
            });
            
            const skuA = row['A']?.trim();
            const skuB = row['B']?.trim();
            
            // Insert with SKU from column A
            if (skuA && skuA !== '') {
              await db.prepare(`
                INSERT INTO csv_data (sku, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO NOTHING
              `).run(skuA, JSON.stringify(row));
              importedCount++;
            }
            
            // Insert with SKU from column B (if different)
            if (skuB && skuB !== '' && skuB !== skuA) {
              await db.prepare(`
                INSERT INTO csv_data (sku, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO NOTHING
              `).run(skuB, JSON.stringify(row));
              importedCount++;
            }
            
            if ((!skuA || skuA === '') && (!skuB || skuB === '')) {
              skippedCount++;
            }
          }

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`CSV import complete in ${duration}s: ${importedCount} records imported, ${skippedCount} rows skipped`);

          // Update upload timestamp
          await db.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES ('csv_uploaded_at', ?, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = CURRENT_TIMESTAMP
          `).run(new Date().toISOString());

          res.json({
            success: true,
            rowsImported: importedCount,
            rowsSkipped: skippedCount,
            totalRows: dataRows.length,
            uploadedAt: new Date().toISOString(),
            duration: duration + 's'
          });
        } catch (error) {
          console.error('Error processing CSV data:', error);
          res.status(500).json({ error: 'Error processing CSV data: ' + error.message });
        }
      })
      .on('error', (error) => {
        console.error('Error parsing CSV:', error);
        res.status(500).json({ error: 'Error parsing CSV file: ' + error.message });
      });

  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: 'Failed to upload CSV: ' + error.message });
  }
});
// Get box types
router.get('/box-types', async (req, res) => {
  try {
    const boxTypes = await db.prepare('SELECT * FROM box_types ORDER BY code').all();
    res.json(boxTypes);
  } catch (error) {
    console.error('Error fetching box types:', error);
    res.status(500).json({ error: 'Failed to fetch box types: ' + error.message });
  }
});

// Add box type
router.post('/box-types', async (req, res) => {
  try {
    const { code, dimensions } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    await db.prepare(`
      INSERT INTO box_types (code, dimensions)
      VALUES (?, ?)
    `).run(code.toUpperCase().trim(), dimensions || '');

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error adding box type:', error);
    res.status(500).json({ error: 'Failed to add box type: ' + error.message });
  }
});

// Update box type
router.patch('/box-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, dimensions } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    await db.prepare(`
      UPDATE box_types
      SET code = ?, dimensions = ?
      WHERE id = ?
    `).run(code.toUpperCase().trim(), dimensions || '', id);

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error updating box type:', error);
    res.status(500).json({ error: 'Failed to update box type: ' + error.message });
  }
});

// Delete box type
router.delete('/box-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.prepare('DELETE FROM box_types WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Box type not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting box type:', error);
    res.status(500).json({ error: 'Failed to delete box type: ' + error.message });
  }
});

const { cleanupOldData } = require('../utils/cleanup');

// 手动触发清理
router.post('/cleanup', async (req, res) => {
  try {
    const result = await cleanupOldData();
    res.json({
      success: true,
      message: `Cleaned up ${result.deleted} orders`,
      deletedOrders: result.orders
    });
  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看即将被清理的数据
router.get('/cleanup-preview', async (req, res) => {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const oldOrders = await db.prepare(`
      SELECT shopify_order_id, name, created_at, fulfillment_status 
      FROM orders 
      WHERE created_at < ?
      ORDER BY created_at DESC
    `).all(sixtyDaysAgo.toISOString());

    res.json({
      count: oldOrders.length,
      cutoffDate: sixtyDaysAgo.toISOString(),
      orders: oldOrders
    });
  } catch (error) {
    console.error('Cleanup preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查看数据库统计
router.get('/database-stats', async (req, res) => {
  try {
    const stats = {
      orders: await db.prepare('SELECT COUNT(*) as count FROM orders').get(),
      lineItems: await db.prepare('SELECT COUNT(*) as count FROM line_items').get(),
      transferItems: await db.prepare('SELECT COUNT(*) as count FROM transfer_items').get(),
      oldestOrder: await db.prepare('SELECT created_at FROM orders ORDER BY created_at ASC LIMIT 1').get(),
      newestOrder: await db.prepare('SELECT created_at FROM orders ORDER BY created_at DESC LIMIT 1').get()
    };
    res.json(stats);
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;