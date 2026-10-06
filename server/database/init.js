// 数据库初始化入口（所有路由文件都 require 这个文件拿 db）
// 2026-10：移除了 SQLite 分支，只保留 PostgreSQL。建表和迁移全部在 init-postgres.js 里。

const DatabaseAdapter = require('./adapter');

const db = new DatabaseAdapter();

const initDatabase = async () => {
  try {
    await db.connect();
    const initPostgres = require('./init-postgres');
    await initPostgres();
    console.log('PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

// server/index.js 会等 db.ready 完成（连上数据库 + 建表迁移跑完）之后才开始监听端口，
// 避免启动期间有请求进来、表还没建好就报 500。
db.ready = initDatabase();

module.exports = db;
