const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function overlayPage() {
  const listeners = {};
  const modal = {
    active: true,
    classList: { remove() { modal.active = false; } },
    setAttribute(name, value) { modal[name] = value; }
  };
  const document = {
    body: { style: { overflow: 'hidden' } },
    addEventListener() {},
    querySelectorAll(selector) { return selector === '.design-modal' ? [modal] : []; }
  };
  vm.runInNewContext(read('public/js/main.js'), {
    document,
    window: { addEventListener(name, callback) { listeners[name] = callback; } }
  });
  return { listeners, modal, document };
}

test('finishing the initial page load preserves an editor already opened by the user', () => {
  const { listeners, modal, document } = overlayPage();
  listeners.pageshow({ persisted: false });
  assert.equal(modal.active, true);
  assert.equal(document.body.style.overflow, 'hidden');
});

test('restoring a page from bfcache still clears stale overlays and scroll locks', () => {
  const { listeners, modal, document } = overlayPage();
  listeners.pageshow({ persisted: true });
  assert.equal(modal.active, false);
  assert.equal(modal['aria-hidden'], 'true');
  assert.equal(document.body.style.overflow, '');
});

function editorEntry({ authenticated = false, hash = '', storage = new Map() } = {}) {
  const callbacks = {};
  let entries = 0;
  const button = { addEventListener() {}, click() { entries += 1; } };
  const register = { addEventListener(name, fn) { callbacks.register = fn; } };
  const modal = { querySelector() { return register; }, addEventListener() {} };
  const source = read('views/model-detail.ejs');
  const start = source.indexOf('(() => {\n  const entryButtons');
  const end = source.indexOf('\n})();\n</script>', start) + '\n})();'.length;
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    window: { ModelDesignerConfig: { userAuthenticated: authenticated }, location: { pathname: '/3d-models/t-shirt/test', search: '', hash } },
    document: {
      readyState: 'complete',
      getElementById(id) { return id === 'designNowBtn' ? button : id === 'modelLoginModal' ? modal : null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    requestAnimationFrame: fn => fn(), URLSearchParams, URL
  });
  return { callbacks, entries: () => entries, storage };
}

test('registration from the editor resumes editing when the user returns signed in', () => {
  const before = editorEntry();
  before.callbacks.register();
  const after = editorEntry({ authenticated: true, storage: before.storage });
  assert.equal(after.entries(), 1);
  assert.equal(before.storage.has('clozdesign_resume_customize'), false);
});

test('tool #design links enter the editor flow once, even with a saved registration intent', () => {
  const before = editorEntry();
  before.callbacks.register();
  const after = editorEntry({ authenticated: true, hash: '#design', storage: before.storage });
  assert.equal(after.entries(), 1);
  assert.equal(editorEntry({ hash: '#design' }).entries(), 1);
  assert.equal(editorEntry().entries(), 0);
});
