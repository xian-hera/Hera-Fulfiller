# 快速启动指南

## 5 分钟快速开始

### 第 1 步：安装依赖

```bash
# 根目录
npm install

# 前端
cd client
npm install
cd ..
```

### 第 2 步：配置环境变量

创建 `.env` 文件：

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token
APP_URL=https://your-ngrok-url.com
PORT=3001
NODE_ENV=development
```

### 第 3 步：启动开发服务器

```bash
npm run dev
```

应用将在以下地址运行：
- 前端：http://localhost:3000
- 后端：http://localhost:3001

### 第 4 步：配置 Webhooks

**选项 A：使用 ngrok（推荐用于本地开发）**

```bash
# 安装 ngrok
npm install -g ngrok

# 启动 ngrok
ngrok http 3001
```

复制 ngrok 提供的 HTTPS URL（如 `https://abc123.ngrok.io`）到 `.env` 的 `APP_URL`

**选项 B：自动配置 webhooks**

```bash
npm run setup-webhooks
```

### 第 5 步：测试

1. 打开浏览器访问 http://localhost:3000
2. 在 Shopify Admin 创建一个测试订单
3. 查看 Picker 页面，订单应自动出现

## 常用命令

```bash
# 开发模式
npm run dev

# 仅启动后端
npm run server

# 仅启动前端
npm run client

# 配置 webhooks
npm run setup-webhooks

# 生产构建
cd client && npm run build

# 生产启动
NODE_ENV=production npm start
```

## 故障排查

### Webhooks 不工作？

1. 检查 ngrok 是否运行
2. 确认 APP_URL 在 .env 中正确设置
3. 查看服务器日志：`console` 输出
4. 在 Shopify Admin 查看 webhook 状态

### 数据库错误？

```bash
# 删除数据库重新开始
rm database.db
npm run server  # 会自动重新创建
```

### 端口冲突？

修改 `.env` 中的 `PORT=3001` 为其他端口

### 前端无法连接后端？

检查 `client/package.json` 中的 `proxy` 设置：
```json
"proxy": "http://localhost:3001"
```

## 下一步

- 阅读完整 [README.md](./README.md)
- 查看 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- 上传 CSV 文件到 Settings
- 配置箱型（Box Types）

## 获取帮助

- 查看服务器日志
- 查看浏览器控制台
- 检查 Shopify webhook 日志
- 提交 Issue

---

**提示：** 首次使用建议在测试商店测试，不要直接在生产环境使用！