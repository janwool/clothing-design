const db = require('./db');

let readyPromise;

function ensureUserAccountTable() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`);
      const columns = await db.all('PRAGMA table_info(users)');
      if (!columns.some(column => column.name === 'deleted_at')) {
        try {
          await db.run('ALTER TABLE users ADD COLUMN deleted_at DATETIME');
        } catch (error) {
          // Concurrent workers may upgrade the same database.
          const updated = await db.all('PRAGMA table_info(users)');
          if (!updated.some(column => column.name === 'deleted_at')) throw error;
        }
      }
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

// Check the database on every authenticated request, including signed Worker cookies.
async function validateUserSession(req, res, next) {
  if (!req.session?.user) return next();
  try {
    await ensureUserAccountTable();
    const user = await db.get('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [req.session.user.id]);
    if (!user) delete req.session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { ensureUserAccountTable, validateUserSession };
