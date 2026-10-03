const db = require('./db');
let ready;
function ensureAdminEmailTable() {
  if (!ready) ready = db.run(`CREATE TABLE IF NOT EXISTS admin_emails (
    id TEXT PRIMARY KEY,
    admin_user_id INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    provider_id TEXT,
    error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).then(() => db.run('CREATE INDEX IF NOT EXISTS idx_admin_emails_created ON admin_emails(created_at)'))
    .catch(error => { ready = null; throw error; });
  return ready;
}
module.exports = { ensureAdminEmailTable };
