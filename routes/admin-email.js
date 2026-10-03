const router = require('express').Router();
const { randomUUID } = require('node:crypto');
const db = require('../lib/db');
const { requireProjectAdmin } = require('../lib/project-admin-auth');
const { ensureAdminEmailTable } = require('../lib/admin-email-db');
const { getEmailConfig, validateMessage, messagePayload, sendEmail } = require('../lib/resend-email');
const { ensureCampaignTables, createCampaign, campaignHistory, retryCampaign } = require('../lib/admin-email-campaigns');

router.use(requireProjectAdmin);

function requireCsrf(req, res, next) {
  if (!req.session.emailCsrf || req.get('X-CSRF-Token') !== req.session.emailCsrf) {
    return res.status(403).json({ error: 'Your session has changed. Reload the page before sending.' });
  }
  next();
}

router.get('/', async (req, res) => {
  let items = [], campaigns = [], users = [], error = '';
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  let total = 0;
  try {
    await ensureAdminEmailTable();
    await ensureCampaignTables();
    users = await db.all('SELECT id, email, name FROM users ORDER BY id DESC');
    total = (await db.get('SELECT COUNT(*) AS total FROM admin_email_campaigns')).total;
    campaigns = await campaignHistory(30, (page - 1) * 30);
    items = await db.all('SELECT id, recipient, subject, status, provider_id, error, created_at FROM admin_emails ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET ?', [(page - 1) * 30]);
  } catch {
    error = 'Sending history is unavailable. Reload the page to try again.';
  }
  req.session.emailCsrf ||= randomUUID();
  const { apiKey, ...config } = getEmailConfig();
  res.render('admin/email', {
    title: 'Email | ClozDesign Admin', page: 'admin-email', config, items, campaigns, emailUsers: users, error,
    historyPage: page, pageCount: Math.max(1, Math.ceil(total / 30)), csrf: req.session.emailCsrf
  });
});

router.post('/campaigns', requireCsrf, async (req, res) => {
  if (!getEmailConfig().ready) return res.status(503).json({ error: 'Email sending is not configured.' });
  try {
    const campaign = await createCampaign(req.body, req.session.user.id);
    return res.status(202).json(campaign);
  } catch (error) {
    const validation = /^(Choose|Select|Enter|Some selected|There are no|Invalid message|This message|Please wait)/.test(error.message);
    return res.status(validation ? 400 : 500).json({ error: validation ? error.message : 'Could not save this message. Retry with the same message reference.' });
  }
});

router.post('/campaigns/:id/retry', requireCsrf, async (req, res) => {
  if (!getEmailConfig().ready) return res.status(503).json({ error: 'Email sending is not configured.' });
  try {
    await retryCampaign(req.params.id);
    return res.status(202).json({ id: req.params.id, status: 'queued' });
  } catch (error) {
    const validation = /^(No recipients|Message not found)/.test(error.message);
    return res.status(validation ? 400 : 500).json({ error: validation ? error.message : 'Could not retry this message. Refresh the sending history.' });
  }
});

function publicRecord(row) {
  return { id: row.id, status: row.status, providerId: row.provider_id, error: row.error };
}

async function dispatch(row, res) {
  let sent;
  try {
    sent = await sendEmail(JSON.parse(row.payload), row.id);
  } catch (error) {
    const status = error.uncertain ? 'unknown' : 'failed';
    await db.run('UPDATE admin_emails SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, error.message, row.id]);
    return res.status(error.status || 502).json({ id: row.id, status, error: error.message });
  }
  // If persistence fails after acceptance, leave the existing record pending. A retry
  // uses the identical stored payload and provider idempotency key.
  await db.run("UPDATE admin_emails SET status = 'accepted', provider_id = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [sent.id, row.id]);
  return res.json({ id: row.id, status: 'accepted', providerId: sent.id });
}

router.post('/send', requireCsrf, async (req, res) => {
  let value;
  try { value = validateMessage(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
  const id = String(req.body.requestId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({ error: 'Invalid message reference. Reload the page.' });
  if (!getEmailConfig().ready) return res.status(503).json({ error: 'Email sending is not configured.' });
  try {
    await ensureAdminEmailTable();
    const payload = JSON.stringify(messagePayload(value));
    const existing = await db.get('SELECT * FROM admin_emails WHERE id = ?', [id]);
    if (existing) {
      if (existing.admin_user_id !== req.session.user.id || existing.payload !== payload) return res.status(409).json({ error: 'This message reference is already in use. Reload the page.' });
      return res.status(existing.status === 'accepted' ? 200 : 409).json(publicRecord(existing));
    }
    const recent = await db.get("SELECT COUNT(*) AS total FROM admin_emails WHERE created_at > datetime('now', '-1 minute')");
    if (recent.total >= 10) return res.status(429).json({ error: 'Please wait a minute before sending another email.' });
    const inserted = await db.run('INSERT OR IGNORE INTO admin_emails (id, admin_user_id, recipient, subject, payload) VALUES (?, ?, ?, ?, ?)', [id, req.session.user.id, value.to, value.subject, payload]);
    if (!inserted.changes) return res.status(409).json({ id, status: 'pending', error: 'This message is already being sent. Check its history record.' });
    return await dispatch({ id, payload }, res);
  } catch {
    return res.status(500).json({ id, error: 'The sending result could not be saved. Check the history record before trying again.' });
  }
});

router.post('/:id/retry', requireCsrf, async (req, res) => {
  if (!getEmailConfig().ready) return res.status(503).json({ error: 'Email sending is not configured.' });
  try {
    await ensureAdminEmailTable();
    const row = await db.get('SELECT * FROM admin_emails WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Email record not found.' });
    if (row.status === 'accepted') return res.json(publicRecord(row));
    // Resend retains idempotency keys for 24 hours. Do not risk a duplicate later.
    const claim = await db.run(`UPDATE admin_emails SET status = 'pending', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND created_at > datetime('now', '-23 hours')
      AND updated_at <= datetime('now', '-30 seconds') AND status IN ('failed', 'unknown', 'pending')`, [row.id]);
    if (!claim.changes) return res.status(409).json({ error: 'Retry is unavailable. Wait 30 seconds after the last attempt; records older than 23 hours must be checked in Resend.' });
    return await dispatch(row, res);
  } catch {
    return res.status(500).json({ error: 'The sending result could not be saved. Check the history record before trying again.' });
  }
});

module.exports = router;
