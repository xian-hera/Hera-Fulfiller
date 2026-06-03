const fs = require('fs');

const files = [
  'package.json',
  'server/index.js',
  'server/database/init.js',
  'server/database/adapter.js',
  'server/shopify/client.js',
];

let out = '';
for (const f of files) {
  out += `\n\n===== FILE: ${f} =====\n\n`;
  try {
    out += fs.readFileSync(f, 'utf-8');
  } catch (e) {
    out += `[读取失败: ${e.message}]`;
  }
}

fs.writeFileSync('auth-files.txt', out, 'utf-8');
console.log('✓ 已生成 auth-files.txt');