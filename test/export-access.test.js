const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const entitlements = require('../lib/user-entitlements');

// Stub the data boundary; exercise the real HTTP middleware and route ordering.
entitlements.getUserEntitlements = async id => {
  if (id === 'unavailable') throw new Error('Database unavailable');
  return { features: { exports: ['pro', 'max', 'business'].includes(id) } };
};
const router = require('../routes/user-content');

test('export authorization and share writes require a paid session', async () => {
  const app = express();
  app.use((req, res, next) => {
    const id = req.get('x-test-plan');
    req.session = id ? { user: { id } } : {};
    next();
  });
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const plan of [null, 'free', 'pro', 'max', 'business', 'unavailable']) {
      const response = await fetch(`${origin}/api/account/exports/authorize`, {
        method: 'POST', headers: plan ? { 'x-test-plan': plan } : {}
      });
      assert.equal(response.status, plan === null ? 401 : plan === 'free' ? 403 : plan === 'unavailable' ? 503 : 200);
    }
    for (const [method, suffix] of [['POST', 'share'], ['PUT', 'share/model']]) {
      const response = await fetch(`${origin}/api/projects/123/${suffix}`, { method, headers: { 'x-test-plan': 'free' } });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'EXPORT_UPGRADE_REQUIRED');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('client rechecks each export and fails closed after expiry or network failure', async () => {
  let calls = 0;
  const elements = { h2: {}, p: {}, a: {} };
  const dialog = { setAttribute() {}, querySelector: key => elements[key], addEventListener() {}, showModal() { this.open = true; } };
  const context = {
    window: {},
    document: { createElement: () => dialog, body: { appendChild() {} } },
    fetch: async () => {
      calls++;
      if (calls === 1) return { ok: true, json: async () => ({ success: true }) };
      if (calls === 2) return { ok: false, status: 403, json: async () => ({ code: 'EXPORT_UPGRADE_REQUIRED' }) };
      throw new Error('Offline');
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/export-entitlements.js'), 'utf8'), context);
  assert.equal(await context.window.ExportEntitlements.requireExportAccess(), true);
  assert.equal(await context.window.ExportEntitlements.requireExportAccess(), false);
  assert.equal(elements.a.hidden, false);
  assert.equal(await context.window.ExportEntitlements.requireExportAccess(), false);
  assert.equal(elements.a.hidden, true);
  assert.equal(calls, 3);
});
