// 🆕 SQLite 分支已移除（chore/remove-sqlite 清理）：项目实际只跑 PostgreSQL（生产在 Render，
// 本地开发直接连同一个 Render Postgres 实例），SQLite 从来不是真正被使用的路径，且这次 Return
// 功能新增的表（return_items 等）在 SQLite 那套 schema 里已经跟 Postgres 版本字段不一致
// （缺 reason_name_snapshot），保留下去反而是隐患，所以彻底删掉，不做"双数据库切换"。
//
// DATABASE_URL 必须配置（Render 上已经配置好；本地开发也指向同一个库，见 .env.example）。
// 不再给 DATABASE_TYPE 任何默认值/兜底行为——之前 `DB_TYPE || 'sqlite'` 的写法，
// 一旦环境变量意外缺失就会静默切到本地 SQLite 文件（生产环境下这是个隐患），
// 现在改成缺失 DATABASE_URL 时直接抛错、启动失败，而不是静默连错库。

const { Pool } = require('pg');

class DatabaseAdapter {
  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL environment variable is required — this app only supports PostgreSQL. ' +
        'Set it in your .env (local) or Render environment variables (production).'
      );
    }

    // Render Postgres 无论本地远程连接还是同网络内连接都要求 SSL；这里不再按 NODE_ENV 判断
    // （之前只有 NODE_ENV === 'production' 才开 SSL，导致本地开发如果想直连 Render Postgres
    // 会连不上）——固定开启，对生产环境行为没有影响（生产原本就是 NODE_ENV=production）。
    //
    // 🆕 从单个 pg.Client 换成 pg.Pool：本地开发现在直接连的是远程 Render Postgres（而不是
    // 本地 SQLite 文件），单个长连接一旦因为网络抖动 / Render 的空闲连接超时断开，后面所有
    // 查询都会失败，只能重启进程才能恢复——这跟"点了 Settings/Rules/Portal 都报 500，
    // 停掉再重开又恢复正常"的症状完全对得上。Pool 按需从连接池取连接、自动重连，
    // 单次查询失败不会拖垮后面所有请求。
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    // Pool 在某个空闲连接上出错时会 emit('error')，不监听的话会直接把整个 Node 进程崩掉
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PG client:', err.message);
    });
    this.type = 'postgres';
  }

  async connect() {
    // Pool 是按需连接的，这里做一次真实查询，一是保留"启动时快速失败"的行为
    // （凭证不对、库连不上，进程直接退出，而不是等第一个请求来了才发现），
    // 二是让 server/index.js 可以等这个 promise 完了再开始监听端口，
    // 避免"迁移还没跑完，请求就已经打进来"的启动期竞态。
    await this.pool.query('SELECT 1');
  }

  prepare(sql) {
    return new PostgresStatement(this.pool, sql);
  }

  async close() {
    await this.pool.end();
  }
}

class PostgresStatement {
  constructor(pool, sql) {
    // 🆕 现在传进来的是 Pool，不是单个 Client —— pool.query() 跟 client.query() 同样的用法
    // （内部自动拿一个连接、跑完查询再还回去），这个类剩下的代码不用改
    this.client = pool;
    this.sql = this.convertSQLiteToPostgres(sql);
  }

  convertSQLiteToPostgres(sql) {
    // 转换 SQLite 语法到 PostgreSQL（历史遗留写法：路由文件里的 SQL 是照着 SQLite 语法写的，
    // 用 ? 占位符 + AUTOINCREMENT 这些写法，这一层转换逻辑本身不是"双数据库支持"，
    // 是为了不用把全仓库几十个路由文件里的 SQL 语句全部重写成 Postgres 原生语法，保留不动）
    let converted = sql
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/REAL/gi, 'NUMERIC');

    // 转换 ? 为 $1, $2, $3...
    let paramCount = 0;
    converted = converted.replace(/\?/g, () => {
      paramCount++;
      return `$${paramCount}`;
    });

    return converted;
  }

  async run(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async get(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async all(...params) {
    try {
      const result = await this.client.query(this.sql, params);
      return result.rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseAdapter;
