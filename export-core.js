const fs = require('fs');
const path = require('path');

// 只导出对理解架构最关键的文件（按需增删）
const files = [
  'package.json',
  'server/index.js',
  'server/database/adapter.js',
  'server/database/init-postgres.js',
  'server/shopify/client.js',
  'server/websocket.js',
  'server/routes/packer.js',
  'server/routes/picker.js',
  'server/routes/transfer.js',
  'server/routes/shopify-transfer.js',
  'server/routes/settings.js',
  'server/webhooks/orderHandler.js',
  'server/canadapost/client.js',
];

let out = `# Hera Fulfiller — 核心代码导出\n`;
out += `生成时间：${new Date().toISOString()}\n\n`;

for (const f of files) {
  out += `\n\n## ${f}\n\n\`\`\`javascript\n`;
  try {
    out += fs.readFileSync(f, 'utf8');
  } catch (e) {
    out += `[读取失败或文件不存在: ${e.message}]`;
  }
  out += `\n\`\`\`\n`;
}

fs.writeFileSync('hera-core-export.md', out, 'utf8');
console.log('✓ 已生成 hera-core-export.md');
console.log(`包含 ${files.length} 个文件`);