const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function restDb(result) {
  const calls = [];
  const context = vm.createContext({
    module: { exports: {} },
    process: { env: { DB_TYPE: 'd1', D1_DATABASE_ID: 'test', CF_API_TOKEN: 'test', CF_ACCOUNT_ID: 'test' } },
    fetch: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return { json: async () => ({ success: true, result: [result] }) };
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/db'), 'utf8'), context);
  return { db: context.module.exports, calls };
}

for (const params of [[], ['project-id', 1]]) {
  test(`D1 REST writes retain metadata with empty results (${params.length} parameters)`, async () => {
    const { db, calls } = restDb({ results: [], meta: { changes: 1, last_row_id: 42 } });
    const result = await db.run('UPDATE design_projects SET name = name', params);
    assert.equal(result.changes, 1);
    assert.equal(result.lastID, 42);
    assert.deepEqual(calls[0].params, params.length ? ['project-id', '1'] : undefined);
  });
}

test('D1 REST unmatched writes retain zero affected rows', async () => {
  const { db } = restDb({ results: [], meta: { changes: 0 } });
  assert.equal((await db.run('UPDATE design_projects SET name = name WHERE 0')).changes, 0);
});

test('D1 REST reads return rows, without exposing write metadata as a row', async () => {
  const row = { id: 'project-id' };
  const { db } = restDb({ results: [row], meta: { changes: 0 } });
  assert.deepEqual(await db.all('SELECT * FROM design_projects'), [row]);
  assert.deepEqual(await db.get('SELECT * FROM design_projects'), row);
  const empty = restDb({ results: [], meta: { changes: 0 } }).db;
  assert.equal((await empty.all('SELECT * FROM design_projects')).length, 0);
  assert.equal(await empty.get('SELECT * FROM design_projects'), null);
});
