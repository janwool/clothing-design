require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();

// 数据库连接配置
const DB_TYPE = process.env.DB_TYPE || 'sqlite'; // 'sqlite' | 'd1'
const D1_DATABASE_ID = process.env.D1_DATABASE_ID || '';
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CF_API_TOKEN || '';

// SQLite 本地数据库（开发/备用）
const sqliteDb = new sqlite3.Database('./database.sqlite');

/**
 * D1 REST API 查询封装
 * 通过 Cloudflare API 直接查询 D1 数据库
 */
async function d1Query(sql, params = []) {
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
      if (DB_TYPE === 'd1' && D1_DATABASE_ID && CF_API_TOKEN) {
        d1Query(sql, params)
          .then(rows => resolve(rows))
          .catch(err => reject(err));
      } else {
        sqliteDb.all(sql, params, (err, rows) => {
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
      if (DB_TYPE === 'd1' && D1_DATABASE_ID && CF_API_TOKEN) {
        d1Query(sql, params)
          .then(rows => resolve(rows && rows.length > 0 ? rows[0] : null))
          .catch(err => reject(err));
      } else {
        sqliteDb.get(sql, params, (err, row) => {
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
      if (DB_TYPE === 'd1' && D1_DATABASE_ID && CF_API_TOKEN) {
        d1Query(sql, params)
          .then(result => {
            const meta = result[0] || {};
            resolve({
              lastID: meta.last_row_id || 0,
              changes: meta.changes || 0
            });
          })
          .catch(err => reject(err));
      } else {
        sqliteDb.run(sql, params, function(err) {
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
      if (DB_TYPE === 'd1' && D1_DATABASE_ID && CF_API_TOKEN) {
        // D1 不支持多语句 exec，需要拆分执行
        const statements = sql.split(';').filter(s => s.trim());
        Promise.all(statements.map(s => d1Query(s.trim())))
          .then(() => resolve())
          .catch(err => reject(err));
      } else {
        sqliteDb.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    });
  }
};

module.exports = db;
