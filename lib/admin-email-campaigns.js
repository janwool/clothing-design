const db = require('./db');
const { randomUUID } = require('node:crypto');
const { validEmail, validateMessage, messagePayload, getEmailConfig, sendBatch } = require('./resend-email');
let ready;
function ensureCampaignTables() {
  if (!ready) ready = (async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS admin_email_campaigns (
      id TEXT PRIMARY KEY, admin_user_id INTEGER NOT NULL, audience TEXT NOT NULL,
      subject TEXT NOT NULL, input_json TEXT NOT NULL, recipients_json TEXT NOT NULL,
      base_payload TEXT NOT NULL, recipient_count INTEGER NOT NULL,
      ready INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.run(`CREATE TABLE IF NOT EXISTS admin_email_batches (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, batch_index INTEGER NOT NULL,
      payload TEXT NOT NULL, recipient_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', provider_ids TEXT, error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, first_attempt_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.run('CREATE INDEX IF NOT EXISTS idx_email_batches_campaign ON admin_email_batches(campaign_id, batch_index)');
    await db.run('CREATE TABLE IF NOT EXISTS admin_email_runner (id INTEGER PRIMARY KEY, lease_until INTEGER NOT NULL, lease_token TEXT)');
    await db.run('INSERT OR IGNORE INTO admin_email_runner (id, lease_until) VALUES (1, 0)');
  })().catch(error => { ready = null; throw error; });
  return ready;
}

function normalizeCampaign(input) {
  const audience = input?.audience || 'all';
  if (!['all', 'selected', 'manual'].includes(audience)) throw new Error('Choose a valid recipient group.');
  const message = validateMessage({ ...input, to: 'validation@example.test' });
  let userIds = [], addresses = [];
  if (audience === 'selected') {
    if (!Array.isArray(input.userIds) || input.userIds.length > 5000) throw new Error('Select between 1 and 5,000 users.');
    userIds = [...new Set(input.userIds.map(Number))].sort((a, b) => a - b);
    if (!userIds.length || userIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Select at least one valid user.');
  }
  if (audience === 'manual') {
    addresses = [...new Set(String(input.addresses || '').split(/[\s,;]+/).filter(Boolean).map(value => value.toLowerCase()))].sort();
    if (!addresses.length || addresses.length > 1000 || addresses.some(value => !validEmail(value))) throw new Error('Enter 1–1,000 valid email addresses, separated by commas or new lines.');
  }
  return { audience, subject: message.subject, text: message.text, replyTo: message.replyTo, userIds, addresses };
}

async function recipientsFor(input) {
  if (input.audience === 'manual') return input.addresses;
  const users = await db.all('SELECT id, email FROM users ORDER BY id');
  const selected = new Set(input.userIds);
  const matched = input.audience === 'all' ? users : users.filter(user => selected.has(user.id));
  if (input.audience === 'selected' && matched.length !== selected.size) throw new Error('Some selected users no longer exist. Refresh the user list.');
  const emails = [...new Set(matched.map(user => String(user.email || '').trim().toLowerCase()).filter(validEmail))];
  if (!emails.length) throw new Error('There are no users with a valid email address in this group.');
  return emails;
}

async function materializeCampaign(row) {
  const recipients = JSON.parse(row.recipients_json);
  const base = JSON.parse(row.base_payload);
  // 20 messages keeps even maximum-length escaped HTML below Resend's request size.
  for (let index = 0; index < recipients.length; index += 20) {
    const batchIndex = index / 20;
    const addresses = recipients.slice(index, index + 20);
    const payload = JSON.stringify(addresses.map(to => ({ ...base, to: [to] })));
    await db.run('INSERT OR IGNORE INTO admin_email_batches (id, campaign_id, batch_index, payload, recipient_count) VALUES (?, ?, ?, ?, ?)', [`${row.id}/${batchIndex}`, row.id, batchIndex, payload, addresses.length]);
  }
  await db.run('UPDATE admin_email_campaigns SET ready = 1 WHERE id = ?', [row.id]);
}

async function createCampaign(input, adminId) {
  const normalized = normalizeCampaign(input);
  const id = String(input.requestId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid message reference. Reload the page.');
  await ensureCampaignTables();
  const inputJson = JSON.stringify(normalized);
  let row = await db.get('SELECT * FROM admin_email_campaigns WHERE id = ?', [id]);
  if (row) {
    if (row.admin_user_id !== adminId || row.input_json !== inputJson) throw new Error('This message reference is already in use. Refresh its sending history.');
  } else {
    const recipients = await recipientsFor(normalized);
    const recent = await db.get("SELECT COUNT(*) AS total FROM admin_email_campaigns WHERE created_at > datetime('now', '-1 minute')");
    if (recent.total >= 10) throw new Error('Please wait a minute before creating another message.');
    await db.run(`INSERT OR IGNORE INTO admin_email_campaigns
      (id, admin_user_id, audience, subject, input_json, recipients_json, base_payload, recipient_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, adminId, normalized.audience, normalized.subject, inputJson, JSON.stringify(recipients), JSON.stringify(messagePayload({ ...normalized, to: recipients[0] })), recipients.length]);
    row = await db.get('SELECT * FROM admin_email_campaigns WHERE id = ?', [id]);
    if (row.admin_user_id !== adminId || row.input_json !== inputJson) throw new Error('This message reference is already in use.');
  }
  if (!row.ready) await materializeCampaign(row);
  return { id: row.id, status: 'queued', total: row.recipient_count };
}

async function campaignHistory(limit = 30, offset = 0) {
  await ensureCampaignTables();
  const rows = await db.all(`SELECT c.id, c.subject, c.audience, c.recipient_count, c.created_at, c.ready,
    COALESCE(SUM(CASE WHEN b.status = 'accepted' THEN b.recipient_count ELSE 0 END), 0) AS accepted,
    COALESCE(SUM(CASE WHEN b.status = 'failed' THEN b.recipient_count ELSE 0 END), 0) AS failed,
    COALESCE(SUM(CASE WHEN b.status IN ('unknown', 'pending') THEN b.recipient_count ELSE 0 END), 0) AS unconfirmed,
    COALESCE(SUM(CASE WHEN b.status = 'queued' THEN b.recipient_count ELSE 0 END), 0) AS queued,
    MAX(b.error) AS error
    FROM admin_email_campaigns c LEFT JOIN admin_email_batches b ON b.campaign_id = c.id
    GROUP BY c.id ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, [limit, offset]);
  return rows.map(row => ({ ...row, status: row.accepted === row.recipient_count ? 'Accepted' : row.failed ? 'Needs attention' : row.unconfirmed ? 'Sending / unconfirmed' : 'Queued' }));
}

async function retryCampaign(id) {
  await ensureCampaignTables();
  const row = await db.get('SELECT * FROM admin_email_campaigns WHERE id = ?', [id]);
  if (!row) throw new Error('Message not found.');
  if (!row.ready) { await materializeCampaign(row); return; }
  const result = await db.run(`UPDATE admin_email_batches SET status = 'queued', error = NULL, attempts = 0, updated_at = CURRENT_TIMESTAMP
    WHERE campaign_id = ? AND status IN ('failed', 'unknown', 'pending')
    AND updated_at <= datetime('now', '-3 minutes')
    AND (first_attempt_at IS NULL OR first_attempt_at > datetime('now', '-23 hours'))`, [id]);
  if (!result.changes) throw new Error('No recipients are ready for retry. Wait three minutes after the last attempt; check attempts older than 23 hours in Resend.');
}

async function processCampaignQueue({ maxBatches = 3, fetchImpl = fetch } = {}) {
  if (!getEmailConfig().ready) return;
  await ensureCampaignTables();
  const token = randomUUID();
  const lease = await db.run("UPDATE admin_email_runner SET lease_until = unixepoch() + 120, lease_token = ? WHERE id = 1 AND lease_until <= unixepoch()", [token]);
  if (!lease.changes) return;
  try {
    // Recover interrupted campaign creation from the immutable snapshot.
    const incomplete = await db.get('SELECT * FROM admin_email_campaigns WHERE ready = 0 ORDER BY created_at LIMIT 1');
    if (incomplete) await materializeCampaign(incomplete);
    await db.run(`UPDATE admin_email_batches SET status = 'unknown', error = 'Sending was interrupted. Check or retry this message.'
      WHERE status = 'pending' AND updated_at <= datetime('now', '-3 minutes')`);
    for (let count = 0; count < maxBatches; count++) {
      const row = await db.get(`SELECT b.* FROM admin_email_batches b JOIN admin_email_campaigns c ON c.id = b.campaign_id
        WHERE c.ready = 1 AND (b.status = 'queued' OR (b.status = 'unknown' AND b.attempts < 3 AND b.updated_at <= datetime('now', '-3 minutes')))
        ORDER BY c.created_at, c.id, b.batch_index LIMIT 1`);
      if (!row) break;
      if (row.first_attempt_at && Date.parse(row.first_attempt_at.replace(' ', 'T') + 'Z') < Date.now() - 23 * 3600000) {
        await db.run("UPDATE admin_email_batches SET status = 'failed', error = 'Safe retry window expired. Check this batch in Resend before sending again.' WHERE id = ?", [row.id]);
        continue;
      }
      const claim = await db.run(`UPDATE admin_email_batches SET status = 'pending', attempts = attempts + 1,
        first_attempt_at = COALESCE(first_attempt_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('queued', 'unknown')`, [row.id]);
      if (!claim.changes) continue;
      let ids;
      try { ids = await sendBatch(JSON.parse(row.payload), row.id, fetchImpl); }
      catch (error) {
        await db.run('UPDATE admin_email_batches SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [error.uncertain ? 'unknown' : 'failed', error.message, row.id]);
        // Pause remaining batches on a provider rejection; continuing could exhaust
        // quota or repeat the same configuration failure across the audience.
        if (!error.uncertain) {
          await db.run("UPDATE admin_email_batches SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND status = 'queued'", [error.message, row.campaign_id]);
          break;
        }
        continue;
      }
      await db.run("UPDATE admin_email_batches SET status = 'accepted', provider_ids = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(ids), row.id]);
      if (count + 1 < maxBatches) await new Promise(resolve => setTimeout(resolve, 600));
    }
  } finally {
    await db.run('UPDATE admin_email_runner SET lease_until = 0, lease_token = NULL WHERE id = 1 AND lease_token = ?', [token]);
  }
}

module.exports = { ensureCampaignTables, normalizeCampaign, recipientsFor, createCampaign, campaignHistory, retryCampaign, processCampaignQueue };
