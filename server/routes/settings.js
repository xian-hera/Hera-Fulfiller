const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const db = require('../database/init');

// Configure multer for file upload
const upload = multer({ dest: 'uploads/' });

// Get all settings
router.get('/', (req, res) => {
  try {
    const settingsRows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });

    const boxTypes = db.prepare('SELECT * FROM box_types ORDER BY code').all();

    res.json({ settings, boxTypes });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings: ' + error.message });
  }
});

// Test endpoint to check CSV data
router.get('/test-csv/:sku', (req, res) => {
  try {
    const { sku } = req.params;
    const csvData = db.prepare('SELECT * FROM csv_data WHERE sku = ?').get(sku);
    
    if (csvData) {
      res.json({
        found: true,
        sku: csvData.sku,
        data: JSON.parse(csvData.data)
      });
    } else {
      const totalCount = db.prepare('SELECT COUNT(*) as count FROM csv_data').get();
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
router.post('/update', (req, res) => {
  try {
    const { transferCsvColumn, pickerWigColumn, skuColumn } = req.body;

    const updateSetting = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `);

    if (transferCsvColumn) {
      updateSetting.run('transfer_csv_column', transferCsvColumn.toUpperCase());
    }

    if (pickerWigColumn) {
      updateSetting.run('picker_wig_column', pickerWigColumn.toUpperCase());
    }

    if (skuColumn) {
      updateSetting.run('sku_column', skuColumn.toUpperCase());
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings: ' + error.message });
  }
});

// Upload CSV file
router.post('/upload-csv', upload.single('file'), (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const results = [];

    // Parse CSV without headers - get raw arrays
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false }))
      .on('data', (data) => {
        const rowArray = Object.values(data);
        results.push(rowArray);
      })
      .on('end', () => {
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
          db.prepare('DELETE FROM csv_data').run();

          // Use transaction for bulk insert - MUCH faster
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO csv_data (sku, data, updated_at)
            VALUES (?, ?, datetime('now'))
          `);

          let importedCount = 0;
          let skippedCount = 0;

          // Wrap in transaction
          const insertMany = db.transaction((rows) => {
            rows.forEach((rowArray, index) => {
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
                const result = insertStmt.run(skuA, JSON.stringify(row));
                if (result.changes > 0) importedCount++;
              }
              
              // Insert with SKU from column B (if different)
              if (skuB && skuB !== '' && skuB !== skuA) {
                const result = insertStmt.run(skuB, JSON.stringify(row));
                if (result.changes > 0) importedCount++;
              }
              
              if ((!skuA || skuA === '') && (!skuB || skuB === '')) {
                skippedCount++;
              }

              // Log progress every 5000 rows
              if ((index + 1) % 5000 === 0) {
                console.log(`Processed ${index + 1} rows...`);
              }
            });
          });

          // Execute transaction
          insertMany(dataRows);

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`CSV import complete in ${duration}s: ${importedCount} records imported, ${skippedCount} rows skipped`);

          // Update upload timestamp
          db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES ('csv_uploaded_at', ?, datetime('now'))
          `).run(new Date().toISOString());

          // Clean up uploaded file
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

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
          if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          res.status(500).json({ error: 'Error processing CSV data: ' + error.message });
        }
      })
      .on('error', (error) => {
        console.error('Error parsing CSV:', error);
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        res.status(500).json({ error: 'Error parsing CSV file: ' + error.message });
      });
  } catch (error) {
    console.error('Error uploading CSV:', error);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ error: 'Failed to upload CSV: ' + error.message });
  }
});

// Get box types
router.get('/box-types', (req, res) => {
  try {
    const boxTypes = db.prepare('SELECT * FROM box_types ORDER BY code').all();
    res.json(boxTypes);
  } catch (error) {
    console.error('Error fetching box types:', error);
    res.status(500).json({ error: 'Failed to fetch box types: ' + error.message });
  }
});

// Add box type
router.post('/box-types', (req, res) => {
  try {
    const { code, dimensions } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    db.prepare(`
      INSERT INTO box_types (code, dimensions)
      VALUES (?, ?)
    `).run(code.toUpperCase().trim(), dimensions || '');

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error adding box type:', error);
    res.status(500).json({ error: 'Failed to add box type: ' + error.message });
  }
});

// Update box type
router.patch('/box-types/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { code, dimensions } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ error: 'Box code is required' });
    }

    db.prepare(`
      UPDATE box_types
      SET code = ?, dimensions = ?
      WHERE id = ?
    `).run(code.toUpperCase().trim(), dimensions || '', id);

    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Box code already exists' });
    }
    console.error('Error updating box type:', error);
    res.status(500).json({ error: 'Failed to update box type: ' + error.message });
  }
});

// Delete box type
router.delete('/box-types/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM box_types WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Box type not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting box type:', error);
    res.status(500).json({ error: 'Failed to delete box type: ' + error.message });
  }
});

module.exports = router;