/**
 * Hera Fulfiller 项目导出工具
 * 
 * 将整个项目导出为单个 Markdown 文件，用于 Claude Projects
 * 
 * 使用方法:
 * 1. 将此文件放到 Hera Fulfiller 项目根目录
 * 2. 运行: node export-hera-project.js
 * 3. 生成文件: hera-fulfiller-complete.md
 * 4. 上传到 Claude Project Knowledge
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// 配置
// ============================================================================

const CONFIG = {
  // 项目根目录（默认当前目录）
  projectRoot: process.cwd(),
  
  // 输出文件
  outputFile: 'hera-fulfiller-complete.md',
  
  // 要包含的文件扩展名
  includeExtensions: [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
    '.sql',
    '.md',
    '.env.example',
    '.gitignore',
    'Dockerfile',
    'package.json',
    'package-lock.json'
  ],
  
  // 要排除的目录
  excludeDirs: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    'out',
    'logs',
    'tmp',
    'temp',
    '.cache',
    'uploads',
    'public/uploads',
    '.vscode',
    '.idea'
  ],
  
  // 要排除的文件
  excludeFiles: [
    '.DS_Store',
    'package-lock.json',  // 太大，不需要
    'yarn.lock',          // 太大，不需要
    '.env',               // 安全原因，只包含 .env.example
    '.env.local',
    '.env.production'
  ],
  
  // 最大文件大小（字节）- 跳过超过此大小的文件
  maxFileSize: 500 * 1024, // 500KB
  
  // 是否包含文件树
  includeFileTree: true,
  
  // 是否包含统计信息
  includeStats: true
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 检查是否应该排除此目录
 */
function shouldExcludeDir(dirName) {
  return CONFIG.excludeDirs.some(excluded => 
    dirName === excluded || dirName.startsWith('.')
  );
}

/**
 * 检查是否应该包含此文件
 */
function shouldIncludeFile(fileName, filePath) {
  // 排除特定文件
  if (CONFIG.excludeFiles.includes(fileName)) {
    return false;
  }
  
  // 检查扩展名
  const ext = path.extname(fileName);
  const hasValidExt = CONFIG.includeExtensions.some(validExt => {
    if (validExt.startsWith('.')) {
      return ext === validExt;
    } else {
      return fileName === validExt;
    }
  });
  
  if (!hasValidExt) {
    return false;
  }
  
  // 检查文件大小
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > CONFIG.maxFileSize) {
      console.log(`⏭️  Skipping large file: ${filePath} (${(stats.size / 1024).toFixed(2)}KB)`);
      return false;
    }
  } catch (error) {
    return false;
  }
  
  return true;
}

/**
 * 获取文件语言标识（用于 markdown 代码块）
 */
function getLanguageId(fileName) {
  const ext = path.extname(fileName);
  const languageMap = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.json': 'json',
    '.sql': 'sql',
    '.md': 'markdown',
    '.env.example': 'bash',
    '.gitignore': 'text',
    'Dockerfile': 'dockerfile'
  };
  
  // 特殊文件名
  if (fileName === 'package.json') return 'json';
  if (fileName === 'Dockerfile') return 'dockerfile';
  
  return languageMap[ext] || 'text';
}

/**
 * 递归扫描目录，构建文件树
 */
function buildFileTree(dir, prefix = '', isLast = true) {
  const items = fs.readdirSync(dir);
  let tree = '';
  
  items.forEach((item, index) => {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    const isLastItem = index === items.length - 1;
    
    const connector = isLastItem ? '└── ' : '├── ';
    const nextPrefix = prefix + (isLastItem ? '    ' : '│   ');
    
    if (stats.isDirectory()) {
      if (!shouldExcludeDir(item)) {
        tree += `${prefix}${connector}📁 ${item}/\n`;
        tree += buildFileTree(itemPath, nextPrefix, isLastItem);
      }
    } else {
      if (shouldIncludeFile(item, itemPath)) {
        tree += `${prefix}${connector}📄 ${item}\n`;
      }
    }
  });
  
  return tree;
}

/**
 * 递归收集所有文件
 */
function collectFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      if (!shouldExcludeDir(item)) {
        collectFiles(itemPath, files);
      }
    } else {
      if (shouldIncludeFile(item, itemPath)) {
        files.push(itemPath);
      }
    }
  });
  
  return files;
}

/**
 * 获取相对路径
 */
function getRelativePath(filePath) {
  return path.relative(CONFIG.projectRoot, filePath);
}

/**
 * 生成文件内容的 Markdown
 */
function generateFileMarkdown(filePath) {
  const relativePath = getRelativePath(filePath);
  const fileName = path.basename(filePath);
  const language = getLanguageId(fileName);
  
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    content = `[Error reading file: ${error.message}]`;
  }
  
  return `
## 📄 \`${relativePath}\`

\`\`\`${language}
${content}
\`\`\`

---
`;
}

/**
 * 生成统计信息
 */
function generateStats(files) {
  const stats = {
    totalFiles: files.length,
    byExtension: {},
    totalLines: 0,
    totalSize: 0
  };
  
  files.forEach(filePath => {
    const ext = path.extname(filePath) || path.basename(filePath);
    stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      stats.totalLines += content.split('\n').length;
      stats.totalSize += fs.statSync(filePath).size;
    } catch (error) {
      // Skip files that can't be read
    }
  });
  
  return stats;
}

// ============================================================================
// 主函数
// ============================================================================

function exportProject() {
  console.log('🚀 Starting Hera Fulfiller project export...\n');
  
  const startTime = Date.now();
  let output = '';
  
  // 1. 生成文件头
  output += `# Hera Fulfiller - Complete Project Export
**Generated:** ${new Date().toISOString()}  
**Purpose:** Claude Project Knowledge Base  
**Branch:** new-Transfer (Development)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [File Structure](#file-structure)
3. [Project Files](#project-files)
4. [Statistics](#statistics)

---

## 📋 Project Overview

**Hera Fulfiller** is the backend/management system for Hera Beauty's fulfillment operations.

**Current Development:**
- Feature: Transfer system redesign
- Integration: Connecteam API for task management
- Branch: new-Transfer

**Tech Stack:**
- Backend: Node.js + Express
- Database: SQL
- Integrations: Shopify, Connecteam

---

`;

  // 2. 生成文件树
  if (CONFIG.includeFileTree) {
    console.log('📁 Building file tree...');
    output += `## 📁 File Structure

\`\`\`
${path.basename(CONFIG.projectRoot)}/
${buildFileTree(CONFIG.projectRoot)}
\`\`\`

---

`;
  }
  
  // 3. 收集所有文件
  console.log('📂 Collecting files...');
  const files = collectFiles(CONFIG.projectRoot);
  console.log(`   Found ${files.length} files to export\n`);
  
  // 4. 生成统计信息
  const stats = generateStats(files);
  
  // 5. 生成所有文件内容
  output += `## 📄 Project Files

Below are all the source files in the Hera Fulfiller project:

---

`;
  
  files.forEach((filePath, index) => {
    const relativePath = getRelativePath(filePath);
    console.log(`   [${index + 1}/${files.length}] ${relativePath}`);
    output += generateFileMarkdown(filePath);
  });
  
  // 6. 添加统计信息
  if (CONFIG.includeStats) {
    output += `
## 📊 Statistics

**Total Files:** ${stats.totalFiles}  
**Total Lines:** ${stats.totalLines.toLocaleString()}  
**Total Size:** ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB

**Files by Type:**
${Object.entries(stats.byExtension)
  .sort((a, b) => b[1] - a[1])
  .map(([ext, count]) => `- \`${ext}\`: ${count} files`)
  .join('\n')}

---

**Export completed:** ${new Date().toISOString()}  
**Time taken:** ${((Date.now() - startTime) / 1000).toFixed(2)}s
`;
  }
  
  // 7. 写入文件
  const outputPath = path.join(CONFIG.projectRoot, CONFIG.outputFile);
  fs.writeFileSync(outputPath, output, 'utf-8');
  
  // 8. 完成
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n✅ Export completed!');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Files: ${stats.totalFiles}`);
  console.log(`   Lines: ${stats.totalLines.toLocaleString()}`);
  console.log(`   Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Time: ${duration}s`);
  console.log(`\n📤 Upload "${CONFIG.outputFile}" to your Claude Project Knowledge!`);
}

// ============================================================================
// 运行
// ============================================================================

try {
  exportProject();
} catch (error) {
  console.error('❌ Export failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}