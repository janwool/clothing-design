const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loginHarness(success = true) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { addEventListener(type, callback) { this[type] = callback; }, reset() {}, focus() {} });
    return nodes.get(selector);
  };
  const dialog = {
    querySelector: node,
    setAttribute() {},
    addEventListener(type, callback) { this['on' + type] = callback; },
    showModal() { this.open = true; },
    close(value = '') { this.open = false; this.returnValue = value; this.onclose(); }
  };
  let request;
  const context = {
    window: {}, URL, AbortSignal,
    location: { href: 'https://cloz-design.com/garment?color=white', pathname: '/garment', search: '?color=white' },
    document: { currentScript: { dataset: { googleAuth: 'true' } }, activeElement: { focus() {} }, createElement: () => dialog, body: { appendChild() {} }, addEventListener() {} },
    FormData: class { get(key) { return key === 'email' ? 'test@example.com' : 'test-password'; } },
    fetch: async (url, options) => { request = JSON.parse(options.body); return { ok: success, json: async () => success ? { success: true } : { error: 'Invalid credentials' } }; }
  };
  vm.runInNewContext(fs.readFileSync('public/js/login-dialog.js', 'utf8'), context);
  return { api: context.window.AccountLoginDialog, dialog, node, request: () => request };
}

test('email sign-in and Google/register links carry the homepage collection destination', async () => {
  const h = loginHarness();
  const result = h.api.open({ title: 'Sign in to start designing', next: '/mockups' });
  assert.equal(h.node('#tryOnLoginTitle').textContent, 'Sign in to start designing');
  assert.equal(h.node('.account-login-google').href, '/auth/google?next=%2Fmockups');
  assert.equal(h.node('.account-login-register a').href, '/auth/register?next=%2Fmockups');
  await h.node('form').submit({ preventDefault() {}, target: {} });
  assert.equal(h.request().next, '/mockups');
  assert.equal(await result, true);
});

test('cancellation and failed sign-in do not report successful authentication', async () => {
  const h = loginHarness(false);
  const result = h.api.open({ next: '/mockups' });
  await h.node('form').submit({ preventDefault() {}, target: {} });
  assert.equal(h.dialog.open, true);
  assert.equal(h.node('[role="alert"]').textContent, 'Invalid credentials');
  h.dialog.close();
  assert.equal(await result, false);
});

test('existing Try-on callers retain their title and resume destination', async () => {
  const h = loginHarness();
  const result = h.api.open();
  assert.equal(h.node('#tryOnLoginTitle').textContent, 'Sign in to Try-on');
  assert.equal(h.node('.account-login-google').href, '/auth/google?next=%2Fgarment%3Fcolor%3Dwhite%26resumeTryOn%3D1');
  await h.node('form').submit({ preventDefault() {}, target: {} });
  assert.equal(h.request().next, '/garment?color=white');
  assert.equal(await result, true);
});

for (const authenticated of [true, false]) {
  test(`homepage only navigates after dialog resolves ${authenticated}`, async () => {
    let click, destination, options;
    const link = { dataset: { requiresLogin: 'true' }, addEventListener(type, callback) { click = callback; } };
    vm.runInNewContext(fs.readFileSync('public/js/home-v2.js', 'utf8'), {
      window: { matchMedia: () => ({ matches: true }), location: { assign(path) { destination = path; } }, AccountLoginDialog: { async open(value) { options = value; return authenticated; } } },
      document: { querySelector: selector => selector === '[data-home-start-design]' ? link : null, querySelectorAll: () => [] }
    });
    await click({ button: 0, preventDefault() {} });
    assert.equal(options.next, '/mockups');
    assert.equal(destination, authenticated ? '/mockups' : undefined);
  });
}
