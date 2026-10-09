const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sqlite3 = require('sqlite3');

function handler(db) {
  const source = fs.readFileSync(require.resolve('../routes/admin'), 'utf8');
  const start = source.indexOf("router.patch('/models-3d/:id/status'");
  const end = source.indexOf('\n});', start) + 4;
  let route;
  vm.runInNewContext(source.slice(start, end), { db, requireAuth() {}, console: { error() {} }, router: { patch(path, auth, fn) { route = fn; } } });
  return route;
}
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
test('status updates persist both directions without overwriting model metadata', async t => {
  const connection = new sqlite3.Database(':memory:');
  t.after(() => new Promise(resolve => connection.close(resolve)));
  const db = {
    run(sql, params = []) { return new Promise((resolve, reject) => connection.run(sql, params, function(error) { error ? reject(error) : resolve({changes:this.changes}); })); },
    get(sql) { return new Promise((resolve, reject) => connection.get(sql, (error, row) => error ? reject(error) : resolve(row))); }
  };
  await db.run('CREATE TABLE models_3d (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, status TEXT, updated_at DATETIME)');
  await db.run("INSERT INTO models_3d VALUES (1, 'Original name', 'original-slug', 'inactive', '2000-01-01')");
  const update = handler(db);
  for (const status of ['active', 'inactive']) {
    const res = response();
    await update({params:{id:1},body:{status}},res);
    assert.equal(res.body.status,status);
    const row = await db.get('SELECT * FROM models_3d WHERE id = 1');
    assert.equal(row.status,status);
    assert.equal(row.name,'Original name');
    assert.equal(row.slug,'original-slug');
    assert.notEqual(row.updated_at,'2000-01-01');
  }
  const missing = response();
  await update({params:{id:999},body:{status:'active'}},missing);
  assert.equal(missing.statusCode,404);
});
test('rejects invalid publication states before touching the database', async () => {
  const update = handler({run() { throw new Error('Must not write'); }});
  for (const status of [undefined, 'deleted', 'ACTIVE', 1]) {
    const res = response();
    await update({params:{id:1},body:{status}},res);
    assert.equal(res.statusCode,400);
  }
});
test('database failure produces a retryable error without exposing SQL', async () => {
  const res = response();
  await handler({run:async()=>{throw new Error('private SQL details');}})({params:{id:1},body:{status:'active'}},res);
  assert.equal(res.statusCode,500);
  assert.equal(res.body.error,'Status could not be updated. Try again.');
});
