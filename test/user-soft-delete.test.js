const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sqlite3 = require('sqlite3');

function loadRoute(file, method, route, context) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  const start = source.indexOf(`router.${method}('${route}'`);
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    router: { [method]: (...args) => { handler = args.at(-1); } },
    console, ...context
  });
  return handler;
}
function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
    redirect(url) { this.url = url; return this; },
    set() {}
  };
}

async function fixture(t) {
  const connection = new sqlite3.Database(':memory:');
  t.after(() => new Promise(resolve => connection.close(resolve)));
  const db = {
    run: (sql, params = []) => new Promise((resolve, reject) => connection.run(sql, params, function(err) {
      if (err) reject(err); else resolve({ changes: this.changes, lastID: this.lastID });
    })),
    all: (sql, params = []) => new Promise((resolve, reject) => connection.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))),
    get: (sql, params = []) => new Promise((resolve, reject) => connection.get(sql, params, (err, row) => err ? reject(err) : resolve(row)))
  };
  await db.run('PRAGMA foreign_keys = ON');
  await db.run('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT, name TEXT)');
  await db.run("INSERT INTO users VALUES (1, 'maker@example.com', 'password-hash', 'Maker')");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/user-accounts'), 'utf8'), { require: () => db, module });
  return { db, ...module.exports };
}

test('upgrades old user tables and soft deletes without losing foreign-key records', async t => {
  const f = await fixture(t);
  await f.ensureUserAccountTable();
  await f.db.run('CREATE TABLE projects (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))');
  await f.db.run('INSERT INTO projects VALUES (1, 1)');
  const handler = loadRoute('../routes/admin', 'delete', '/users/:id', { ...f, requireAuth() {} });
  const req = { params: { id: '1' }, session: { user: { id: 2 } } };
  const res = response();
  await handler(req, res);
  assert.equal(res.body.success, true);
  assert.ok((await f.db.get('SELECT * FROM users')).deleted_at);
  assert.equal((await f.db.get('SELECT * FROM projects')).user_id, 1);
  await handler(req, response()); // Repeated deletion is safe.
  const missing = response();
  await handler({ ...req, params: { id: '999' } }, missing);
  assert.equal(missing.statusCode, 404);
});

test('existing sessions lose access after disable, while active sessions remain valid', async t => {
  const f = await fixture(t);
  const req = { session: { user: { id: 1 } } };
  let nextError;
  await f.validateUserSession(req, {}, error => { nextError = error; });
  assert.equal(req.session.user.id, 1);
  await f.db.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP');
  await f.validateUserSession(req, {}, error => { nextError = error; });
  assert.equal(req.session.user, undefined);
  assert.equal(nextError, undefined);
});

for (const route of ['/login', '/register']) {
  test(`disabled accounts cannot ${route.slice(1)} with their retained email`, async t => {
    const f = await fixture(t);
    await f.ensureUserAccountTable();
    await f.db.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP');
    const handler = loadRoute('../routes/auth', 'post', route, {
      db: f.db, ACCOUNT_DISABLED_ERROR: 'Account disabled',
      getAuthReturnPath: () => '', buildAuthPageData: () => ({}), wantsJson: () => true,
      bcrypt: { compare() { throw new Error('Disabled account must not check passwords'); }, hash() { throw new Error('Disabled account must not create passwords'); } }
    });
    const req = { body: { email: ' Maker@Example.com ', password: 'long-password', name: 'Maker' }, session: {}, t: key => key };
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Account disabled');
    assert.equal(req.session.user, undefined);
    assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM users')).count, 1);
  });
}

test('Google login blocks a disabled account after resolving its verified email', async t => {
  const f = await fixture(t);
  await f.ensureUserAccountTable();
  await f.db.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP');
  const handler = loadRoute('../routes/auth', 'get', '/google/callback', {
    db: f.db, safeReturnPath: value => value, oauthStatesMatch: () => true,
    getGoogleOAuthConfig: () => ({ enabled: true }),
    exchangeGoogleAuthorizationCode: async () => ({ access_token: 'token' }),
    fetchGoogleUserProfile: async () => ({ email: 'maker@example.com', name: 'Maker' }),
    redirectGoogleError: (res, code) => res.redirect(code)
  });
  const req = { session: { googleOAuth: { state: 'state', createdAt: Date.now() } }, query: { code: 'code', state: 'state' } };
  const res = response();
  await handler(req, res);
  assert.equal(res.url, 'account_disabled');
  assert.equal(req.session.user, undefined);
});
