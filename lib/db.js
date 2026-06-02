let sqliteDb;

function getEnvValue(key) {
  return process.env[key] || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__[key]) || '';
}

function getDbType() {
  return getEnvValue('DB_TYPE') || 'sqlite';
}

function getD1Binding() {
  return globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__.DB;
}

function getSqliteDb() {
  if (!sqliteDb) {
    const nodeRequire = eval('require');
    const sqlite3 = nodeRequire('sqlite3').verbose();
    sqliteDb = new sqlite3.Database('./database.sqlite');
  }
  return sqliteDb;
}

function shouldUseD1() {
  return getDbType() === 'd1';
}

function assertD1Available() {
  if (getD1Binding()) return;
  if (getEnvValue('D1_DATABASE_ID') && getEnvValue('CF_API_TOKEN')) return;
  throw new Error('DB_TYPE=d1 requires a D1 binding named DB or D1_DATABASE_ID + CF_API_TOKEN environment variables');
}

/**
 * D1 REST API 查询封装
 * 通过 Cloudflare API 直接查询 D1 数据库
 */
async function d1Query(sql, params = []) {
  const D1_DATABASE_ID = getEnvValue('D1_DATABASE_ID');
  const CF_ACCOUNT_ID = getEnvValue('CF_ACCOUNT_ID') || getEnvValue('R2_ACCOUNT_ID');
  const CF_API_TOKEN = getEnvValue('CF_API_TOKEN');
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

  // 将参数绑定到 SQL 中（简单替换，生产环境建议使用参数化查询）
  let boundSql = sql;
  if (params && params.length > 0) {
    // 使用参数化方式：D1 API 支持 params 数组
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: boundSql,
        params: params.map(p => p === null || p === undefined ? null : String(p))
      })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'D1 query failed');
    }

    // 解析 D1 返回结果
    const result = data.result?.[0];
    if (!result) return [];

    if (result.results) {
      // SELECT 查询返回结果集
      return result.results;
    }

    // INSERT/UPDATE/DELETE 返回影响行数
    return [{ changes: result.meta?.changes || 0, last_row_id: result.meta?.last_row_id || 0 }];
  }

  // 无参数查询
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: boundSql })
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  }

  const result = data.result?.[0];
  if (!result) return [];

  if (result.results) {
    return result.results;
  }

  return [{ changes: result.meta?.changes || 0, last_row_id: result.meta?.last_row_id || 0 }];
}

async function d1All(sql, params = []) {
  const binding = getD1Binding();
  if (binding) {
    const statement = params.length > 0
      ? binding.prepare(sql).bind(...params)
      : binding.prepare(sql);
    const result = await statement.all();
    return result.results || [];
  }
  return d1Query(sql, params);
}

async function d1Get(sql, params = []) {
  const binding = getD1Binding();
  if (binding) {
    const statement = params.length > 0
      ? binding.prepare(sql).bind(...params)
      : binding.prepare(sql);
    return statement.first();
  }
  const rows = await d1Query(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function d1Run(sql, params = []) {
  const binding = getD1Binding();
  if (binding) {
    const statement = params.length > 0
      ? binding.prepare(sql).bind(...params)
      : binding.prepare(sql);
    const result = await statement.run();
    return {
      lastID: result.meta?.last_row_id || 0,
      changes: result.meta?.changes || 0
    };
  }
  const result = await d1Query(sql, params);
  const meta = result[0] || {};
  return {
    lastID: meta.last_row_id || 0,
    changes: meta.changes || 0
  };
}

/**
 * 统一数据库查询接口
 * 根据 DB_TYPE 自动选择 SQLite 或 D1
 */
const db = {
  /**
   * 执行 SELECT 查询，返回所有行
   */
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      if (shouldUseD1()) {
        try {
          assertD1Available();
        } catch (err) {
          reject(err);
          return;
        }
        d1All(sql, params)
          .then(rows => resolve(rows))
          .catch(err => reject(err));
      } else {
        getSqliteDb().all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }
    });
  },

  /**
   * 执行 SELECT 查询，返回第一行
   */
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      if (shouldUseD1()) {
        try {
          assertD1Available();
        } catch (err) {
          reject(err);
          return;
        }
        d1Get(sql, params)
          .then(row => resolve(row || null))
          .catch(err => reject(err));
      } else {
        getSqliteDb().get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      }
    });
  },

  /**
   * 执行 INSERT/UPDATE/DELETE 语句
   */
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      if (shouldUseD1()) {
        try {
          assertD1Available();
        } catch (err) {
          reject(err);
          return;
        }
        d1Run(sql, params)
          .then(result => resolve(result))
          .catch(err => reject(err));
      } else {
        getSqliteDb().run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  },

  /**
   * 执行原始 SQL（用于初始化表结构等）
   */
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      if (shouldUseD1()) {
        try {
          assertD1Available();
        } catch (err) {
          reject(err);
          return;
        }
        // D1 不支持多语句 exec，需要拆分执行
        const statements = sql.split(';').filter(s => s.trim());
        Promise.all(statements.map(s => d1Run(s.trim())))
          .then(() => resolve())
          .catch(err => reject(err));
      } else {
        getSqliteDb().exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    });
  }
};

module.exports = db;
