# Project Structure

```
shopify-warehouse-app/
│
├── server/                          # 后端服务器
│   ├── database/
│   │   └── init.js                 # 数据库初始化和表结构
│   │
│   ├── middleware/
│   │   └── webhookVerification.js # Shopify webhook HMAC 验证
│   │
│   ├── routes/
│   │   ├── picker.js               # Picker API 路由
│   │   ├── transfer.js             # Transfer API 路由
│   │   ├── packer.js               # Packer API 路由
│   │   ├── settings.js             # Settings API 路由
│   │   └── webhooks.js             # Webhook 处理路由
│   │
│   ├── shopify/
│   │   └── client.js               # Shopify API 客户端
│   │
│   ├── scripts/
│   │   └── setupWebhooks.js        # Webhook 自动配置脚本
│   │
│   ├── webhooks/
│   │   └── orderHandler.js         # 订单 Webhook 业务逻辑
│   │
│   └── index.js                    # Express 服务器主入口
│
├── client/                          # React 前端应用
│   ├── public/
│   │   ├── index.html
│   │   └── favicon.ico
│   │
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.js        # 主页面
│   │   │   ├── Picker.js           # 拣货页面
│   │   │   ├── Transfer.js         # 调货页面
│   │   │   ├── Packer.js           # 打包订单列表
│   │   │   ├── OrderDetail.js      # 订单详情页面
│   │   │   └── Settings.js         # 设置页面
│   │   │
│   │   ├── App.js                  # React 根组件
│   │   ├── App.css                 # 全局样式
│   │   └── index.js                # React 入口
│   │
│   └── package.json                # 前端依赖
│
├── uploads/                         # CSV 上传临时目录
├── database.db                      # SQLite 数据库文件
├── .env                            # 环境变量配置
├── .env.example                    # 环境变量示例
├── .gitignore
├── package.json                    # 后端依赖和脚本
├── README.md                       # 项目说明文档
└── PROJECT_STRUCTURE.md            # 本文件
```

## 核心文件说明

### 后端核心文件

#### `server/index.js`
- Express 服务器主文件
- 配置中间件、路由
- 启动 HTTP 服务器

#### `server/database/init.js`
- 初始化 SQLite 数据库
- 创建所有表结构
- 插入默认数据（box types, settings）

#### `server/webhooks/orderHandler.js`
- 处理 Shopify 订单 webhooks
- 实现 create, update, cancel, fulfilled 逻辑
- 管理 line items 和 transfer items

#### `server/shopify/client.js`
- Shopify Admin API 封装
- 提供产品、订单、webhook 操作方法
- 处理 API 认证

### 前端核心文件

#### `client/src/App.js`
- React 应用根组件
- 配置 Polaris AppProvider
- 配置路由

#### `client/src/pages/Picker.js`
- 拣货功能界面
- 显示待拣货商品列表
- 处理商品状态变更（picking/picked/missing）
- 支持按类型排序和状态筛选

#### `client/src/pages/Transfer.js`
- 调货功能界面
- 显示缺货商品
- 录入调货信息（仓库来源、预计到货时间）
- 复制调货信息文本

#### `client/src/pages/Packer.js`
- 打包订单列表
- 显示所有未完成订单
- 状态管理（packing/waiting/ready/holding）

#### `client/src/pages/OrderDetail.js`
- 订单详情页面
- 显示订单所有商品
- 标记商品打包状态
- 处理重量警告
- 完成订单并设置箱型

#### `client/src/pages/Settings.js`
- 系统设置页面
- CSV 文件上传
- 配置 CSV 列映射
- 管理箱型（box types）

## 数据库表结构

### orders (订单表)
存储 Shopify 订单基本信息
- shopify_order_id (主键)
- order_number, name
- fulfillment_status
- total_quantity, subtotal_price
- shipping 地址信息
- status (packing/waiting/ready/holding)
- box_type, weight

### line_items (商品行表)
存储订单中的商品详情
- shopify_line_item_id (主键)
- quantity, image_url, title, brand, size
- weight, weight_unit, sku
- product_type, url_handle
- picker_status (picking/picked/missing)
- packer_status (packing/ready)

### transfer_items (调货表)
存储需要调货的商品
- line_item_id (外键)
- quantity
- transfer_from, estimate_month, estimate_day
- status (transferring/waiting/received/found)

### settings (设置表)
存储系统配置
- key (唯一键)
- value
- 包括：transfer_csv_column, picker_wig_column, csv_uploaded_at

### csv_data (CSV 数据表)
存储上传的 CSV 数据
- sku (唯一键)
- data (JSON 格式)

### box_types (箱型表)
存储可用的箱型
- code (唯一，如 A, B, C)
- dimensions (如 10x8x4)

## API 端点

### Picker API
- `GET /api/picker/items` - 获取所有待拣货商品
- `PATCH /api/picker/items/:id/status` - 更新商品状态
- `POST /api/picker/items/:id/split` - 拆分商品（部分缺货）

### Transfer API
- `GET /api/transfer/items` - 获取所有调货商品
- `PATCH /api/transfer/items/:id` - 更新调货信息
- `POST /api/transfer/items/:id/split` - 拆分调货数量
- `GET /api/transfer/items/:id/copy-text` - 获取复制文本
- `POST /api/transfer/items/bulk-delete` - 批量删除

### Packer API
- `GET /api/packer/orders` - 获取所有订单
- `GET /api/packer/orders/:shopifyOrderId` - 获取订单详情
- `PATCH /api/packer/orders/:shopifyOrderId/status` - 更新订单状态
- `PATCH /api/packer/items/:id/packer-status` - 更新商品打包状态
- `POST /api/packer/orders/:shopifyOrderId/complete` - 完成订单
- `PATCH /api/packer/items/:id/update-weight` - 更新商品重量

### Settings API
- `GET /api/settings` - 获取所有设置
- `POST /api/settings/update` - 更新设置
- `POST /api/settings/upload-csv` - 上传 CSV
- `GET /api/settings/box-types` - 获取箱型列表
- `POST /api/settings/box-types` - 添加箱型
- `DELETE /api/settings/box-types/:id` - 删除箱型
- `PATCH /api/settings/box-types/:id` - 更新箱型

### Webhook API
- `POST /api/webhooks/orders/create` - 订单创建
- `POST /api/webhooks/orders/updated` - 订单更新
- `POST /api/webhooks/orders/cancelled` - 订单取消
- `POST /api/webhooks/orders/fulfilled` - 订单完成

## 技术栈

### 后端
- **Node.js** - JavaScript 运行环境
- **Express** - Web 框架
- **SQLite (better-sqlite3)** - 轻量级数据库
- **axios** - HTTP 客户端
- **multer** - 文件上传中间件
- **csv-parser** - CSV 解析
- **dotenv** - 环境变量管理

### 前端
- **React 18** - UI 框架
- **React Router** - 路由管理
- **Shopify Polaris** - UI 组件库
- **axios** - HTTP 客户端

## 工作流程

1. **订单创建** (Webhook)
   - Shopify 发送 order/create webhook
   - 服务器接收并存储订单和商品到数据库
   - 商品自动出现在 Picker 列表

2. **拣货流程** (Picker)
   - 用户查看待拣货商品
   - 标记已拣取或缺货
   - 缺货商品自动转到 Transfer

3. **调货流程** (Transfer)
   - 用户查看缺货商品
   - 录入调货信息（来源仓库、到货日期）
   - 生成调货文本用于沟通

4. **打包流程** (Packer)
   - 用户查看订单列表
   - 点击订单进入详情
   - 逐个标记商品为已打包
   - 所有商品打包完成后选择箱型
   - 订单状态变为 Ready

5. **订单完成**
   - Ready 状态的订单可以发货
   - 可选：调用 Shopify API 标记为 fulfilled

## 环境变量说明

```env
# Shopify API 配置
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token

# 服务器配置
PORT=3001
NODE_ENV=development

# 应用 URL（用于 webhook）
APP_URL=https://your-app-url.com

# 数据库路径
DATABASE_PATH=./database.db
```

## 部署注意事项

1. **生产环境**
   - 设置 `NODE_ENV=production`
   - 使用 HTTPS（webhook 要求）
   - 配置反向代理（nginx/Apache）
   - 使用 PM2 或类似工具管理进程

2. **Webhook 配置**
   - 确保 APP_URL 可公网访问
   - 运行 `npm run setup-webhooks` 自动配置
   - 或手动在 Shopify Admin 配置

3. **数据备份**
   - 定期备份 database.db
   - 备份上传的 CSV 文件

4. **安全性**
   - 保护 .env 文件
   - 启用 webhook HMAC 验证
   - 使用 HTTPS
   - 限制 API 访问