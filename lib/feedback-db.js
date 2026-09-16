const db = require('./db');

let feedbackTableReady;

async function ensureFeedbackTable() {
  if (!feedbackTableReady) {
    feedbackTableReady = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS feedback_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        source_url TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      const columns = await db.all('PRAGMA table_info(feedback_submissions)');
      if (!columns.some(column => column.name === 'updated_at')) {
        await db.run('ALTER TABLE feedback_submissions ADD COLUMN updated_at DATETIME');
        await db.run('UPDATE feedback_submissions SET updated_at = created_at WHERE updated_at IS NULL');
      }
      await db.run(
        'CREATE INDEX IF NOT EXISTS idx_feedback_submissions_status_created ON feedback_submissions (status, created_at)'
      );
    })().catch(error => {
      feedbackTableReady = null;
      throw error;
    });
  }

  return feedbackTableReady;
}

module.exports = {
  ensureFeedbackTable
};
