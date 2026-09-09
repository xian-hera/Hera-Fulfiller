// 🆕 SQLite 分支已移除（chore/remove-sqlite 清理），只保留 PostgreSQL 初始化路径。
// 见 adapter.js 顶部注释——原因和清理范围一致。

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

// 🆕 把这个 promise 挂在 db 对象上（db.ready），让 server/index.js 可以在真正开始监听端口
// 之前 await 它——之前是 initDatabase() 调用了但没人等，server.listen() 立刻执行，
// 数据库还没连上/建表迁移还没跑完，这段时间内打进来的请求会直接 500。
// 本地连的是远程 Render Postgres，网络往返比以前本地 SQLite 慢得多，这个竞态窗口才变得
// 肉眼可见（点开 Settings/Rules/Portal 报错，等一会儿又正常，说明是启动期的时间窗口问题）。
db.ready = initDatabase();

module.exports = db;
