const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sqlite3 = require('sqlite3');

test('charges ten credits atomically and refunds the reserved amount', async () => {
  const sql = new sqlite3.Database(':memory:');
  const db = {
    run: (q, p = []) => new Promise((resolve, reject) => sql.run(q, p, function(e) { e ? reject(e) : resolve({ changes: this.changes }); })),
    get: (q, p = []) => new Promise((resolve, reject) => sql.get(q, p, (e, row) => e ? reject(e) : resolve(row))),
    all: (q, p = []) => new Promise((resolve, reject) => sql.all(q, p, (e, rows) => e ? reject(e) : resolve(rows)))
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/user-entitlements'), 'utf8'), {
    module, Date, require: name => name === './db' ? db : { ensureUserContentTables: async () => {} }
  });
  const api = module.exports;
  const now = new Date('2026-09-22T00:00:00Z');
  try {
    await api.ensureEntitlementTables();
    await db.run("INSERT INTO user_subscriptions (user_id, plan, status) VALUES (1, 'pro', 'active')");
    await db.run("INSERT INTO user_entitlement_usage (user_id, period_key, try_on_credits_used, updated_at) VALUES (1, '2026-09', 241, CURRENT_TIMESTAMP)");
    assert.equal((await api.reserveTryOnCredit(1, now)).allowed, false);
    await db.run('UPDATE user_entitlement_usage SET try_on_credits_used = 240');
    const reservations = await Promise.all([api.reserveTryOnCredit(1, now), api.reserveTryOnCredit(1, now)]);
    assert.equal(reservations.filter(r => r.allowed).length, 1);
    assert.equal((await db.get('SELECT try_on_credits_used AS used FROM user_entitlement_usage')).used, 250);
    const reservation = reservations.find(r => r.allowed).reservation;
    assert.equal(reservation.amount, 10);
    await api.releaseTryOnCredit(reservation);
    assert.equal((await db.get('SELECT try_on_credits_used AS used FROM user_entitlement_usage')).used, 240);
    await db.run("UPDATE user_subscriptions SET plan = 'free'");
    await db.run('UPDATE user_entitlement_usage SET try_on_credits_used = 0, try_on_credits_granted = 20');
    assert.equal((await api.reserveTryOnCredit(1, now)).remaining, 10);
    assert.equal((await api.reserveTryOnCredit(1, now)).remaining, 0);
    assert.equal((await api.reserveTryOnCredit(1, now)).allowed, false);
  } finally { await new Promise(resolve => sql.close(resolve)); }
});
