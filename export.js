const fs = require('fs');
const path = require('path');

const output = 'complete-project.txt';
const ignore = ['node_modules', '.git', 'build', 'dist', 'database.db'];

function walkDir(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      if (ignore.some(i => filePath.includes(i))) return;
      
      if (fs.statSync(filePath).isDirectory()) {
        walkDir(filePath, fileList);
      } else if (file.endsWith('.js') || file === 'package.json') {
        fileList.push(filePath);
      }
    });
  } catch (err) {
    console.error(`Error reading ${dir}:`, err.message);
  }
  return fileList;
}

const files = walkDir('.');
let content = '=== PROJECT STRUCTURE ===\n\n';

files.sort().forEach(file => {
  console.log(`Processing: ${file}`);
  content += `\n\n===================\nFILE: ${file}\n===================\n`;
  try {
    content += fs.readFileSync(file, 'utf8');
  } catch (err) {
    content += `Error reading file: ${err.message}`;
  }
});

fs.writeFileSync(output, content);
console.log(`\n✓ Exported to ${output}`);
console.log(`Total files: ${files.length}`);