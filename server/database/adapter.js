// 数据库适配层 —— 只支持 PostgreSQL（2026-10 移除了 SQLite / better-sqlite3）
//
// 为什么去掉 SQLite：
//   - 生产一直跑在 Render Postgres 上，SQLite 只是早期本地开发用，两套建表代码已经对不齐
//   - better-sqlite3 是需要编译的原生模块，而且原来不管用不用都会被加载，升级到 Node 24 后容易装不上
//   - 原来 DATABASE_TYPE 没设置时会默认回落到 SQLite，环境变量一旦漏配就会静默连错库
//
// 路由文件里的 SQL 仍然是 SQLite 风格写法（? 占位符等），由下面的 convertSQLiteToPostgres 统一转换，
// 所以路由代码不用改。

const { Pool } = require('pg');
const { getPgConfig } = require('./pgConfig');

class DatabaseAdapter {
  constructor() {
    // 用连接池代替原来的单个 pg.Client：单连接一旦被网络抖动或 Render 的空闲超时断开，
    // 之后所有查询都会失败、只能重启进程；连接池会按需重新建连接。
    this.pool = new Pool(getPgConfig());
    // 空闲连接出错时 Pool 会 emit('error')，不监听的话整个 Node 进程会崩溃
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });
    this.type = 'postgres';
  }

  async connect() {
    // 启动时做一次真实查询：数据库连不上就立刻失败退出，而不是等第一个请求进来才发现
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
    this.pool = pool;
    this.sql = this.convertSQLiteToPostgres(sql);
  }

  convertSQLiteToPostgres(sql) {
    // 转换 SQLite 语法到 PostgreSQL
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
      const result = await this.pool.query(this.sql, params);
      // 注意：只有 SQL 里写了 RETURNING id 时 lastInsertRowid 才有值
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async get(...params) {
    try {
      const result = await this.pool.query(this.sql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  async all(...params) {
    try {
      const result = await this.pool.query(this.sql, params);
      return result.rows;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseAdapter;
