const db = require('./db');

async function requireProjectAdmin(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session?.user?.id) {
    return res.status(401).json({ success: false, error: 'Please sign in as an administrator.' });
  }
  const configured = process.env.ADMIN_EMAILS || globalThis.__WORKER_ENV__?.ADMIN_EMAILS || '';
  const emails = new Set(String(configured).split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
  try {
    const user = await db.get('SELECT email FROM users WHERE id = ?', [req.session.user.id]);
    if (!user || !emails.has(String(user.email).toLowerCase())) {
      return res.status(403).json({ success: false, error: 'Administrator access required.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Administrator access could not be verified.' });
  }
}

module.exports = { requireProjectAdmin };
