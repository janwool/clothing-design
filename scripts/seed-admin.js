require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');

async function seedAdmin() {
  try {
    // 创建 users 表
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('✅ users 表创建成功');

    // 检查是否已存在 admin 用户
    const existing = await db.get('SELECT * FROM users WHERE email = ?', ['admin@test.com']);
    if (existing) {
      console.log('⚠️ admin@test.com 已存在，跳过创建');
      return;
    }

    // 生成密码哈希
    const hash = await bcrypt.hash('admin123', 10);

    // 插入 admin 用户
    const result = await db.run(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      ['admin@test.com', hash, 'Admin']
    );
    console.log('✅ Admin 用户创建成功，ID:', result.lastID);
  } catch (err) {
    console.error('❌ 失败:', err.message);
  }
}

seedAdmin();
