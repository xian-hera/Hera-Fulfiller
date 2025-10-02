# Shopify Warehouse Management APP

一个完整的 Shopify 仓库管理系统，使用 **Shopify Polaris** 构建现代化 UI，包含拣货(Picker)、调货(Transfer)和打包(Packer)三大核心功能。

## ✨ 功能特点

### 📦 Picker (拣货)
- 实时显示所有待拣货商品
- 支持按产品类型 A-Z 排序
- 状态管理：Picking / Picked / Missing
- 拆分数量处理（部分缺货）
- WIG 产品特殊处理（CSV 映射）
- 移动端优先设计，大触摸按钮

### 🔄 Transfer (调货)
- 自动同步 Picker 中的缺货商品
- 调货信息管理（来源仓库、预计到货时间）
- 批量清理功能
- 智能复制文本（包含 emoji 标记）
- 实时状态更新（transferring/waiting/received）

### 📮 Packer (打包)
- 订单列表管理
- 多状态显示：Packing / Waiting / Ready / Holding
- 订单详情页面，逐个商品打包
- 重量警告提示和实时更新到 Shopify
- 箱型和重量录入
- 支持键盘左右切换订单（计划中）

## 🎨 技术栈

### 后端
- **Node.js + Express** - 服务器框架
- **SQLite (better-sqlite3)** - 轻量级数据库
- **Shopify Admin API** - 产品和订单管理
- **Webhooks** - 实时订单同步
- **CSV 处理** - 支持自定义数据映射

### 前端
- **React 18** - 现代化 UI 框架
- **Shopify Polaris** - 官方 UI 组件库（无需自定义 CSS）
- **React Router** - 页面路由
- **Axios** - HTTP 请求

## 📥 安装步骤

### 1. 克隆项目

```bash
git clone <repository-url>
cd shopify-warehouse-app
```

### 2. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

### 3. 配置环境变量

复制 `.env.example` 到 `.env` 并填写信息：

```env
# Shopify API 配置
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token_here

# 服务器配置
PORT=3001
NODE_ENV=development

# App URL (必须可公网访问，用于 webhooks)
APP_URL=https://your-app-url.com
```

### 4. 获取 Shopify API 凭证

1. 登录 [Shopify Partners](https://partners.shopify.com/)
2. 创建一个新的 App
3. 获取 API Key 和 API Secret
4. 生成 Access Token（需要以下权限）：
   - `read_products`
   - `write_products`
   - `read_orders`
   - `write_orders`
   - `read_fulfillments`
   - `write_fulfillments`

### 5. 配置 Webhooks

**方法一：自动配置（推荐）**

```bash
npm run setup-webhooks
```

**方法二：手动配置**

在 Shopify Admin 中配置以下 webhooks：

- `orders/create` → `https://your-app-url.com/api/webhooks/orders/create`
- `orders/updated` → `https://your-app-url.com/api/webhooks/orders/updated`
- `orders/cancelled` → `https://your-app-url.com/api/webhooks/orders/cancelled`
- `orders/fulfilled` → `https://your-app-url.com/api/webhooks/orders/fulfilled`

### 6. 启动应用

```bash
# 开发模式（同时启动前后端，带热重载）
npm run dev

# 或分别启动
npm run server  # 后端: http://localhost:3001
npm run client  # 前端: http://localhost:3000
```

## 📱 使用说明

### Dashboard (主页)
从 Shopify Admin 进入后的首页，四个按钮：
- **Picker** - 拣货功能（移动端优化）
- **Transfer** - 调货功能（移动端优化）
- **Packer** - 打包功能（移动端优化）
- **Settings** - 设置（推荐 PC 端）

### Picker 使用流程

1. **查看待拣货商品**
   - 自动显示所有未拣取的商品
   - 显示：数量、图片、订单号、SKU、品牌、标题、尺寸

2. **拣货操作**
   - 点击**绿色按钮**：标记为 Picked ✓
   - 点击**红色按钮**：标记为 Missing
     - 数量=1：直接标记缺货
     - 数量>1：弹窗输入已拣取数量，自动拆分

3. **功能按钮**
   - **Sort**: 按产品类型 A-Z 排序
   - **Show**: 筛选显示 Picking/Missing/Picked 状态

### Transfer 使用流程

1. **查看缺货商品**
   - 自动显示 Picker 中 Missing 的商品

2. **录入调货信息**
   - 点击**蓝色按钮 (Transfer)**：弹出调货窗口
   - 输入：
     - Transfer From：仓库编号（如 01, 02, 03）
     - Estimated：预计到货日期
     - Transfer Quantity：如需部分调货
   - 提交后状态变为 Waiting

3. **复制功能**
   - **Copy All 按钮**：复制完整调货信息
     - Transferring 状态：`数量 - CSV列内容`
     - Waiting 状态：`🟫01🟫 - 数量 - CSV列内容 - 订单号`
   - **SKU Copy 按钮**：仅复制 SKU

4. **确认到货**
   - Transferring 状态：点击绿色按钮 → Found
   - Waiting 状态：点击绿色按钮 → Received

5. **批量清理**
   - 点击 **Clear Mode**：进入多选模式
   - 选择要删除的项目
   - 点击 **Delete Selected**：删除

### Packer 使用流程

1. **订单列表**
   - 显示所有未完成订单
   - 状态标识：
     - ⬜ **Packing**（灰框）：默认状态
     - 🔵 **Waiting**（蓝色）：有商品在调货中
     - 🟢 **Ready**（绿色）：已完成打包
     - 🟣 **Holding**（紫色）：暂时搁置

2. **进入订单详情**
   - 点击订单条目
   - 查看：地址、商品列表、调货信息

3. **打包商品**
   - 点击商品右侧**绿色圆圈** ○ → 变为 ✓
   - 再次点击可取消
   - 商品状态标识：
     - ○ 蓝色圆环：商品在 Transfer 中 transferring
     - ○ 蓝色圆点：商品在 Transfer 中 waiting
     - ✓ 绿色：已打包

4. **重量警告处理**
   - 如看到 ⚠️ 图标：商品重量为 0 或单位不是 g
   - 点击警告图标
   - 输入正确重量（克）
   - 自动更新到 Shopify

5. **完成订单**
   - 所有商品打包完成后自动弹窗
   - 选择 **Box Type**（A-H 或自定义）
   - 如有重量警告：输入订单总重量
   - 点击 **Complete** → 订单变为 Ready

6. **Holding 功能**
   - 点击订单右侧状态图标：切换 Holding
   - 用于暂时搁置订单

### Settings 配置（PC 端推荐）

1. **CSV 上传**
   - 拖放或选择 CSV 文件
   - 用于：
     - WIG 产品信息映射
     - Transfer 复制文本的 C 内容

2. **列配置**
   - **Transfer CSV Column**: Transfer 复制文本使用的列（默认 E）
   - **Picker WIG Column**: WIG 产品号码使用的列（默认 E）

3. **箱型管理**
   - 添加：输入代码（如 I）和尺寸（如 26x24x20）
   - 编辑：直接修改表格中的值，失焦自动保存
   - 删除：点击 Delete 按钮

4. **保存设置**
   - 修改后点击右上角 **Save** 按钮

## 📊 数据流程

```
Shopify Order Created (Webhook)
         ↓
    [Database]
         ↓
    ┌─────────┐
    │ Picker  │ → Mark as Missing → Transfer
    └─────────┘                          ↓
         ↓ Mark as Picked           Record Info
         ↓                               ↓
    ┌─────────┐                    Waiting/Received
    │ Packer  │ ← Transfer Info ────────┘
    └─────────┘
         ↓ Pack Items
         ↓ Select Box
         ↓
      Ready
         ↓
   (可选) Fulfill
```

## 🗂️ 数据库表

- **orders**: 订单信息
- **line_items**: 商品详情（picker_status, packer_status）
- **transfer_items**: 调货记录
- **settings**: 系统设置
- **csv_data**: CSV 数据缓存
- **box_types**: 箱型列表

## 🚀 部署

### 生产环境部署

```bash
# 1. 构建前端
cd client
npm run build
cd ..

# 2. 设置环境变量
export NODE_ENV=production
export APP_URL=https://your-domain.com

# 3. 启动服务器
npm start
```

### 使用 PM2 部署（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start server/index.js --name warehouse-app

# 开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs warehouse-app

# 重启
pm2 restart warehouse-app
```

### Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Docker 部署（可选）

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci --only=production
RUN npm run build

WORKDIR /app
COPY . .

EXPOSE 3001

CMD ["node", "server/index.js"]
```

```bash
# 构建镜像
docker build -t warehouse-app .

# 运行容器
docker run -d \
  -p 3001:3001 \
  --env-file .env \
  --name warehouse-app \
  warehouse-app
```

## 🔧 开发

### 项目结构

```
shopify-warehouse-app/
├── server/              # 后端
│   ├── database/       # 数据库
│   ├── middleware/     # 中间件
│   ├── routes/         # API 路由
│   ├── shopify/        # Shopify API 客户端
│   ├── scripts/        # 工具脚本
│   └── webhooks/       # Webhook 处理器
│
├── client/             # 前端
│   └── src/
│       └── pages/      # 页面组件
│
├── .env                # 环境变量
├── database.db         # SQLite 数据库
└── uploads/            # CSV 上传目录
```

### 可用脚本

```bash
npm run dev              # 开发模式（前后端）
npm run server           # 仅后端
npm run client           # 仅前端
npm run build            # 构建生产版本
npm start                # 生产模式启动
npm run setup-webhooks   # 配置 Shopify webhooks
```

### API 文档

详细 API 文档请查看 `PROJECT_STRUCTURE.md`

## 🐛 常见问题

**Q: Webhook 没有触发？**
- 检查 APP_URL 是否正确且可公网访问
- 确认 Shopify Admin 中 webhook 配置正确
- 查看服务器日志：`pm2 logs warehouse-app`

**Q: CSV 上传后没有效果？**
- 确认 CSV 第一列（Column A）为 SKU
- 在 Settings 中配置正确的列（默认 E）
- 查看浏览器控制台是否有错误

**Q: 重量更新不生效？**
- 确认 Shopify API Token 有 `write_products` 权限
- 检查网络连接
- 查看服务器日志

**Q: 订单状态不更新？**
- 检查 webhook 是否正常工作
- 查看数据库是否正常
- 重启应用：`pm2 restart warehouse-app`

**Q: 移动端显示异常？**
- Polaris 自动适配移动端
- 如有问题，清除浏览器缓存
- 尝试其他浏览器

## 📝 更新日志

### v1.0.0 (2025-01-01)
- ✨ 使用 Shopify Polaris 重构 UI
- ✨ 完整的 Picker/Transfer/Packer 功能
- ✨ Webhook 实时同步
- ✨ CSV 数据映射
- ✨ 重量管理和警告
- ✨ 箱型配置
- ✨ 移动端优化

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👥 联系方式

如有问题或建议，请联系开发团队。

---

**注意事项：**
1. 首次使用前必须配置 webhooks
2. Settings 推荐在 PC 端操作
3. 定期备份 `database.db` 文件
4. 生产环境务必使用 HTTPS
5. 保护好 `.env` 文件，不要提交到版本控制# Shopify Warehouse Management APP

一个完整的 Shopify 仓库管理系统，包含拣货(Picker)、调货(Transfer)和打包(Packer)三大核心功能。

## 功能特点

### 📦 Picker (拣货)
- 实时显示所有待拣货商品
- 支持按产品类型排序
- 状态管理：Picking / Picked / Missing
- 拆分数量处理（部分缺货）
- WIG 产品特殊处理
- 移动端优先设计

### 🔄 Transfer (调货)
- 自动同步 Picker 中的缺货商品
- 调货信息管理（来源仓库、预计到货时间）
- 批量清理功能
- 智能复制文本（包含 emoji 标记）
- 实时状态更新

### 📮 Packer (打包)
- 订单列表管理
- 多状态显示：Packing / Waiting / Ready / Holding
- 订单详情页面
- 重量警告提示
- 箱型和重量录入
- 左右滑动切换订单

## 技术栈

### 后端
- Node.js + Express
- SQLite 数据库
- Shopify Webhooks
- CSV 文件处理

### 前端
- React 18
- React Router
- Axios
- CSS Modules

## 安装步骤

### 1. 克隆项目并安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写以下信息：

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token
APP_URL=https://your-app-url.com
PORT=3001
```

### 3. 初始化数据库

数据库会在首次运行时自动创建。

### 4. 配置 Shopify Webhooks

在 Shopify Partner Dashboard 中配置以下 webhooks：

- `orders/create` → `https://your-app-url.com/api/webhooks/orders/create`
- `orders/updated` → `https://your-app-url.com/api/webhooks/orders/updated`
- `orders/cancelled` → `https://your-app-url.com/api/webhooks/orders/cancelled`
- `orders/fulfilled` → `https://your-app-url.com/api/webhooks/orders/fulfilled`

### 5. 启动应用

```bash
# 开发模式（同时启动前后端）
npm run dev

# 或分别启动
npm run server  # 后端
npm run client  # 前端
```

## 项目结构

```
shopify-warehouse-app/
├── server/
│   ├── database/
│   │   └── init.js           # 数据库初始化
│   ├── routes/
│   │   ├── picker.js         # Picker API
│   │   ├── transfer.js       # Transfer API
│   │   ├── packer.js         # Packer API
│   │   ├── settings.js       # Settings API
│   │   └── webhooks.js       # Webhook处理
│   ├── webhooks/
│   │   └── orderHandler.js   # 订单Webhook逻辑
│   └── index.js              # Express服务器
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImageModal.js
│   │   │   ├── NumberPad.js
│   │   │   ├── TransferModal.js
│   │   │   ├── WeightModal.js
│   │   │   └── OrderCompleteModal.js
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── Picker.js
│   │   │   ├── Transfer.js
│   │   │   ├── Packer.js
│   │   │   ├── OrderDetail.js
│   │   │   └── Settings.js
│   │   ├── App.js
│   │   └── App.css
│   └── package.json
├── .env
├── package.json
└── README.md
```

## 使用说明

### Dashboard (主页)
从 Shopify Admin 进入后的首页，包含四个按钮：
- **Picker** - 拣货功能
- **Transfer** - 调货功能
- **Packer** - 打包功能
- **Settings** - 设置（PC端操作）

### Picker 使用流程

1. **查看待拣货商品列表**
   - 每个条目显示：数量、图片、订单号、SKU、品牌、标题、尺寸
   - 点击图片可查看大图和产品链接

2. **标记状态**
   - 点击**绿色框**：标记为已拣取 (Picked)
   - 点击**红色框**：标记为缺货 (Missing)
     - 数量=1：直接标记为缺货
     - 数量>1：弹出数字盘输入已拣取数量，剩余自动标记为缺货

3. **排序和筛选**
   - **Sort** 按钮：按产品类型 A-Z 排序
   - **Show** 控制：选择显示 Picking / Missing / Picked 状态

### Transfer 使用流程

1. **查看缺货商品**
   - 自动显示 Picker 中标记为 Missing 的商品
   - 实时同步更新

2. **录入调货信息**
   - 点击**蓝色框**：弹出调货窗口
   - 输入：Transfer From（仓库编号）、Estimated（预计到货日期）
   - 如果部分调货，可修改 Transfer Quantity

3. **复制功能**
   - **大复制按钮**：复制完整调货信息（含 emoji 标记）
   - **小复制按钮**：仅复制 SKU

4. **确认到货**
   - 点击**绿色框**：标记为 Received/Found

5. **批量清理**
   - 点击 **Clear**：进入选择模式
   - 勾选要清理的条目
   - 再次点击 **Clear**：删除选中项

### Packer 使用流程

1. **订单列表**
   - 显示所有未完成订单
   - 状态：Packing / Waiting / Ready / Holding
   - 颜色标识：灰色/蓝色/绿色/紫色

2. **订单详情**
   - 点击订单进入详情页
   - 显示所有商品、重量、地址等信息
   - 左右滑动切换订单

3. **打包流程**
   - 点击商品右侧**绿色圆圈**：标记为已打包
   - 所有商品打包完成后：弹出完成窗口
   - 选择箱型 (Box Type)
   - 如有重量警告：需输入总重量
   - 点击 Done：订单状态变为 Ready

4. **重量警告处理**
   - 点击 ⚠️ 图标：弹出重量输入窗口
   - 输入正确重量并提交
   - 系统会更新 Shopify 产品重量信息

5. **Holding 状态**
   - 点击订单右侧状态图标：切换 Holding 状态
   - 用于暂时搁置订单

### Settings 配置

**注意：Settings 仅在 PC 端操作**

1. **CSV 上传**
   - 点击 Upload 选择 CSV 文件
   - 用于 WIG 产品信息和 Transfer 复制文本

2. **列配置**
   - **Transfer CSV Column**：指定 Transfer 复制文本使用的列
   - **Picker WIG Column**：指定 WIG 产品号码使用的列

3. **箱型管理**
   - 添加新箱型：输入代码和尺寸
   - 编辑/删除现有箱型
   - 默认箱型：A-H

## API 端点

### Picker
- `GET /api/picker/items` - 获取所有拣货商品
- `PATCH /api/picker/items/:id/status` - 更新商品状态
- `POST /api/picker/items/:id/split` - 拆分商品数量

### Transfer
- `GET /api/transfer/items` - 获取所有调货商品
- `PATCH /api/transfer/items/:id` - 更新调货信息
- `POST /api/transfer/items/:id/split` - 拆分调货数量
- `GET /api/transfer/items/:id/copy-text` - 获取复制文本
- `POST /api/transfer/items/bulk-delete` - 批量删除

### Packer
- `GET /api/packer/orders` - 获取所有订单
- `GET /api/packer/orders/:shopifyOrderId` - 获取订单详情
- `PATCH /api/packer/orders/:shopifyOrderId/status` - 更新订单状态
- `PATCH /api/packer/items/:id/packer-status` - 更新商品打包状态
- `POST /api/packer/orders/:shopifyOrderId/complete` - 完成订单
- `PATCH /api/packer/items/:id/update-weight` - 更新重量

### Settings
- `GET /api/settings` - 获取所有设置
- `POST /api/settings/update` - 更新设置
- `POST /api/settings/upload-csv` - 上传 CSV
- `GET /api/settings/box-types` - 获取箱型列表
- `POST /api/settings/box-types` - 添加箱型
- `DELETE /api/settings/box-types/:id` - 删除箱型
- `PATCH /api/settings/box-types/:id` - 更新箱型

### Webhooks
- `POST /api/webhooks/orders/create` - 订单创建
- `POST /api/webhooks/orders/updated` - 订单更新
- `POST /api/webhooks/orders/cancelled` - 订单取消
- `POST /api/webhooks/orders/fulfilled` - 订单完成

## 数据库表结构

### orders (订单表)
- 存储订单基本信息
- 包含配送地址、状态、箱型、重量等

### line_items (商品行表)
- 存储订单中的商品
- 包含 picker_status 和 packer_status

### transfer_items (调货表)
- 存储需要调货的商品
- 包含调货来源和预计到货时间

### settings (设置表)
- 存储系统设置（CSV 列配置等）

### csv_data (CSV 数据表)
- 存储上传的 CSV 数据
- 用于 WIG 产品和 Transfer 文本查询

### box_types (箱型表)
- 存储箱型代码和尺寸

## 开发注意事项

1. **移动端优先**
   - Picker、Transfer、Packer 优先考虑手机屏幕
   - Settings 仅在 PC 端操作

2. **实时同步**
   - Webhook 实时更新订单和商品
   - Transfer 自动同步 Picker 的缺货状态

3. **数据完整性**
   - 订单取消时自动删除相关数据
   - 外键约束确保数据一致性

4. **CSV 处理**
   - 支持动态列配置
   - SKU 作为主键匹配

## 部署

### 生产环境部署

```bash
# 构建前端
cd client
npm run build
cd ..

# 设置环境变量
export NODE_ENV=production

# 启动服务器
npm start
```

### 使用 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start server/index.js --name warehouse-app

# 查看状态
pm2 status

# 查看日志
pm2 logs warehouse-app
```

## 常见问题

**Q: Webhook 没有触发？**
A: 检查 Shopify Admin 中 webhook 配置是否正确，确保 URL 可公网访问。

**Q: CSV 上传后没有效果？**
A: 确认 CSV 第一列（Column A）为 SKU，并在 Settings 中正确配置了列。

**Q: 重量更新不生效？**
A: 需要配置 Shopify API 权限以更新产品信息。

**Q: 订单状态不更新？**
A: 检查数据库连接和 webhook 处理逻辑，查看服务器日志。

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系开发团队。