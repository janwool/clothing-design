const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const ejs = require('ejs');
const workerTemplates = require('../src/worker-templates.cjs');

const root = path.join(__dirname, '..');
const routeSource = fs.readFileSync(path.join(root, 'routes/admin.js'), 'utf8');
const subscriberQuery = routeSource.match(/subscribers = await db\.get\(`([\s\S]*?)`\)/)?.[1];

test('dashboard counts only users with current paid plan access', async () => {
  assert.ok(subscriberQuery, 'dashboard subscriber query exists');
  const database = new sqlite3.Database(':memory:');
  const run = (sql, params = []) => new Promise((resolve, reject) => {
    database.run(sql, params, error => error ? reject(error) : resolve());
  });
  const get = sql => new Promise((resolve, reject) => {
    database.get(sql, (error, row) => error ? reject(error) : resolve(row));
  });
  try {
    await run('CREATE TABLE users (id INTEGER PRIMARY KEY, deleted_at DATETIME)');
    await run('CREATE TABLE user_subscriptions (user_id INTEGER, plan TEXT, status TEXT, current_period_end TEXT)');
    for (let id = 1; id <= 9; id += 1) await run('INSERT INTO users (id) VALUES (?)', [id]);
    const rows = [
      [1, 'pro', 'active', null],
      [2, 'business', 'scheduled_cancel', '2999-01-01 00:00:00'],
      [3, 'max', 'trialing', '2999-01-01T00:00:00Z'],
      [4, 'pro', 'past_due', null],
      [5, 'free', 'active', null],
      [6, 'pro', 'canceled', null],
      [7, 'pro', 'active', '2000-01-01 00:00:00'],
      [8, 'pro', 'paused', null],
      [10, 'pro', 'active', null]
    ];
    for (const row of rows) {
      await run('INSERT INTO user_subscriptions VALUES (?, ?, ?, ?)', row);
    }
    assert.equal((await get(subscriberQuery)).count, 4);
    const filter = routeSource.match(/subscribersOnly \? `AND ([\s\S]*?)` : ''/)?.[1];
    assert.ok(filter, 'subscriber list uses a paid access filter');
    const members = await new Promise((resolve, reject) => database.all(
      `SELECT u.id FROM users u LEFT JOIN user_subscriptions s ON s.user_id = u.id WHERE u.deleted_at IS NULL AND ${filter} ORDER BY u.id`,
      (error, rows) => error ? reject(error) : resolve(rows)
    ));
    assert.deepEqual(members.map(row => row.id), [1, 2, 3, 4]);
    await run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1');
    assert.equal((await get(subscriberQuery)).count, 3);
  } finally {
    await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
  }
});

test('dashboard subscriber card renders count, empty value, and unavailable state', () => {
  const file = path.join(root, 'views/admin/dashboard.ejs');
  const baseCounts = {
    models3d: 0, models2d: 0, gallery: 0, tools: 0, users: 0,
    projects: 0, images: 0, inquiries: 0, feedback: 0
  };
  const render = subscribers => ejs.render(fs.readFileSync(file, 'utf8'), {
    title: 'Admin Dashboard', page: 'admin', i18next: { language: 'en' },
    counts: { ...baseCounts, subscribers }
  }, { filename: file });
  assert.match(render(4), /Active Subscribers[\s\S]*?dashboard-metric-value">4/);
  assert.match(render(0), /Active Subscribers[\s\S]*?dashboard-metric-value">0/);
  assert.match(render(null), /Active Subscribers[\s\S]*?dashboard-metric-value">—[\s\S]*?Count unavailable/);
  assert.match(render(null), /href="\/admin" class="dashboard-metric dashboard-metric-primary dashboard-subscriber-metric"/);
  assert.match(render(null), /Refresh dashboard/);
  const html = render(4);
  assert.match(html, /href="\/admin\/users\?view=subscribers"/);
  assert.match(html, /View subscribers/);
  assert.ok(html.indexOf('Account Summary') < html.indexOf('Content &amp; Assets'));
  assert.ok(html.indexOf('Content &amp; Assets') < html.indexOf('User Activity'));
  assert.ok(html.indexOf('User Activity') < html.indexOf('Quick Actions'));
  const workerHtml = workerTemplates.render('admin/dashboard', {
    title: 'Admin Dashboard', page: 'admin', i18next: { language: 'en' },
    counts: { ...baseCounts, subscribers: 4 }
  });
  assert.match(workerHtml, /Active Subscribers[\s\S]*?dashboard-metric-value">4/);
  assert.match(workerHtml, /href="\/admin\/users\?view=subscribers"/);
});

test('subscriber list has a distinct heading, empty state, and all-users link in both runtimes', () => {
  const file = path.join(root, 'views/admin/users.ejs');
  const locals = { title: 'Active Subscribers', page: 'admin-users', i18next: { language: 'en' }, subscribersOnly: true, items: [] };
  for (const html of [ejs.render(fs.readFileSync(file, 'utf8'), locals, { filename: file }), workerTemplates.render('admin/users', locals)]) {
    assert.match(html, /No active subscribers/);
    assert.match(html, /href="\/admin\/users"[^>]*>View all users/);
    assert.doesNotMatch(html, /Users will appear here once they register/);
  }
});
