// PostgreSQL 连接配置（adapter.js 和 init-postgres.js 共用）
//
// SSL 规则：
//   - DATABASE_SSL=false  → 不用 SSL（本机自己装的 Postgres 一般没开 SSL）
//   - DATABASE_SSL=true   → 用 SSL
//   - 没设置时：生产环境（NODE_ENV=production）或连接串指向 Render 时用 SSL，其他情况不用
// Render 的证书链 node 默认校验不过，所以 rejectUnauthorized 设为 false（跟原来的行为一致）。

function getPgConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. This app only supports PostgreSQL — ' +
      'set DATABASE_URL in .env (local) or in the Render environment (production).'
    );
  }

  const flag = (process.env.DATABASE_SSL || '').toLowerCase();
  let useSsl;
  if (flag === 'true') useSsl = true;
  else if (flag === 'false') useSsl = false;
  else useSsl = process.env.NODE_ENV === 'production' || /render\.com/i.test(connectionString);

  return {
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  };
}

module.exports = { getPgConfig };
