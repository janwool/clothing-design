const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const entitlements = require('../lib/user-entitlements');
const storage = require('../lib/object-storage');
const tables = require('../lib/user-content-db');
const db = require('../lib/db');
const originalEntitlements = entitlements.getUserEntitlements;
const originalStore = entitlements.canStoreImage;
const originalUpload = storage.uploadImageDataUrl;
const originalDelete = storage.deleteObject;
const originalTables = tables.ensureUserContentTables;
const originalRun = db.run;
entitlements.getUserEntitlements = async id => ({ features: { exports: id === 'paid' } });
entitlements.canStoreImage = async () => ({ allowed: true });
tables.ensureUserContentTables = async () => {};
const uploaded = [];
const deleted = [];
storage.uploadImageDataUrl = async (data, options) => {
  uploaded.push(options.keyBase);
  return { key: `${options.keyBase}.png`, url: `https://cdn.example/${options.keyBase}.png`, contentType: 'image/png', size: 9 };
};
storage.deleteObject = async key => { deleted.push(key); };
const inserted = [];
db.run = async (sql, values) => { inserted.push({ sql, values }); };
const router = require('../routes/ai-render-export');
const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64')}`;

test('AI image rendering checks the user, plan, and screenshot before calling the model', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = req.get('x-user') ? { user: { id: req.get('x-user') } } : {}; next(); });
  app.use('/api/ai-render-export', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/ai-render-export`;
  try {
    const anonymous = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(anonymous.status, 401);
    const free = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': 'free' }, body: '{}' });
    assert.equal(free.status, 403);
    assert.equal((await free.json()).code, 'EXPORT_UPGRADE_REQUIRED');
    const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': 'paid' }, body: JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=' }) });
    assert.equal(invalid.status, 400);
    const anonymousList = await fetch(url);
    assert.equal(anonymousList.status, 401);
    const anonymousDownload = await fetch(`${url}/00000000-0000-0000-0000-000000000000/download`);
    assert.equal(anonymousDownload.status, 401);
    const malformedDownload = await fetch(`${url}/not-an-id/download`, { headers: { 'x-user': 'paid' } });
    assert.equal(malformedDownload.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('AI export uses the same Cloudflare binding pattern as try-on and saves the result', async () => {
  const previousEnv = globalThis.__WORKER_ENV__;
  let call;
  globalThis.__WORKER_ENV__ = { AI: { run: async (model, input, options) => { call = { model, input, options }; return { state: 'Completed', result: { image: png } }; } } };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 'paid' } }; next(); });
  app.use('/api/ai-render-export', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai-render-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: png, modelSlug: 'shirt', layout: 'front-back' }) });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(call.model, 'openai/gpt-image-2.5-sunburst');
    assert.equal(call.input.images[0], png);
    assert.equal(call.input.quality, 'high');
    assert.equal(call.input.output_format, 'png');
    assert.deepEqual(call.options, { gateway: { id: 'default' } });
    assert.match(payload.image.name, /^shirt-front-back-ai\.png$/);
    assert.equal(uploaded.length, 1);
    assert.equal(deleted.length, 0);
    assert.match(inserted[0].sql, /ai-render-export/);
    globalThis.__WORKER_ENV__.AI.run = async () => { throw new Error('Model execution failed (Payment error)'); };
    const unavailable = await fetch(`http://127.0.0.1:${server.address().port}/api/ai-render-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: png }) });
    assert.equal(unavailable.status, 503);
    assert.match((await unavailable.json()).error, /temporarily unavailable/);
  } finally {
    globalThis.__WORKER_ENV__ = previousEnv;
    await new Promise(resolve => server.close(resolve));
    entitlements.getUserEntitlements = originalEntitlements;
    entitlements.canStoreImage = originalStore;
    storage.uploadImageDataUrl = originalUpload;
    storage.deleteObject = originalDelete;
    tables.ensureUserContentTables = originalTables;
    db.run = originalRun;
  }
});
