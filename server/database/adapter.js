const sqlite3 = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');

const DB_TYPE = process.env.DATABASE_TYPE || 'sqlite';
const DATABASE_URL = process.env.DATABASE_URL;

class DatabaseAdapter {
  constructor() {
    if (DB_TYPE === 'postgres') {
      this.client = new Client({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      this.type = 'postgres';
    } else {
      const dbPath = path.resolve(__dirname, '../../database.db');
      this.db = sqlite3(dbPath);
      this.type = 'sqlite';
    }
  }

  async connect() {
    if (this.type === 'postgres') {
      await this.client.connect();
    }
  }

  prepare(sql) {
    if (this.type === 'postgres') {
      return new PostgresStatement(this.client, sql);
    } else {
      return this.db.prepare(sql);
    }
  }

  async close() {
    if (this.type === 'postgres') {
      await this.client.end();
    } else {
      this.db.close();
    }
  }
}

class PostgresStatement {
  constructor(client, sql) {
    this.client = client;
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