const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const db = require('../lib/db');

test('soft deletion retains data and free quota, hides projects, and rejects access or revival', async () => {
  const memory = new sqlite3.Database(':memory:');
  const original = { run: db.run, get: db.get, all: db.all };
  db.run = (sql, params = []) => new Promise((resolve, reject) => memory.run(sql, params, function(error) {
    error ? reject(error) : resolve({ changes: this.changes });
  }));
  for (const method of ['get', 'all']) db[method] = (sql, params = []) => new Promise((resolve, reject) => {
    memory[method](sql, params, (error, result) => error ? reject(error) : resolve(result));
  });
  try {
    // Exercise an existing database upgrade, not just a fresh schema.
    const migration = require('node:fs').readFileSync(require.resolve('../migrations/0005_user_projects.sql'), 'utf8');
    await db.run(migration.match(/CREATE TABLE IF NOT EXISTS design_projects[^;]+/)[0]);
    const { ensureUserContentTables } = require('../lib/user-content-db');
    await ensureUserContentTables();
    const router = require('../routes/user-content');
    const invoke = async (method, path, { id, body = {}, userId = 1 } = {}) => {
      const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
      const req = { params: { id }, body, query: {}, session: { user: { id: userId } } };
      const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
      await route.stack.at(-1).handle(req, res);
      return res;
    };
    const payload = { projectType: '3d', name: 'Saved tee', sourceUrl: '/3d-models/tee', designData: { color: 'red' } };
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const created = await invoke('post', '/api/projects', { body: payload });
      assert.equal(created.code, 201);
      ids.push(created.data.project.id);
    }
    assert.equal((await invoke('delete', '/api/projects/:id', { id: ids[0], userId: 2 })).code, 404);
    assert.equal((await invoke('delete', '/api/projects/:id', { id: ids[0] })).code, 200);
    const retained = await db.get('SELECT * FROM design_projects WHERE id = ?', [ids[0]]);
    assert.ok(retained.deleted_at);
    assert.deepEqual(JSON.parse(retained.design_data), payload.designData);
    assert.equal((await invoke('get', '/api/projects')).data.projects.length, 2);
    for (const [method, path, body] of [
      ['get', '/api/projects/:id', {}],
      ['patch', '/api/projects/:id', { name: 'Revive' }],
      ['post', '/api/projects/:id/duplicate', {}],
      ['post', '/api/projects', { ...payload, id: ids[0] }],
      ['delete', '/api/projects/:id', {}]
    ]) assert.equal((await invoke(method, path, { id: ids[0], body })).code, 404);
    const access = await require('../lib/user-entitlements').canCreateProject(1);
    assert.equal(access.allowed, false);
    assert.equal(access.entitlements.projects.used, 3);
    assert.equal((await invoke('post', '/api/projects', { body: payload })).code, 403);
    assert.equal((await invoke('post', '/api/projects/:id/duplicate', { id: ids[1] })).code, 403);
  } finally {
    Object.assign(db, original);
    await new Promise(resolve => memory.close(resolve));
  }
});
