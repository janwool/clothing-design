const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(allowed = true) {
  const classes = new Set();
  const events = [];
  const handlers = {};
  const dialogHandlers = {};
  const paintCallbacks = [];
  const workspace = { dataset: {} };
  let focused = false;
  const link = { id: 'entry', href: 'http://localhost/3d-models/t-shirt/test/try-on?project=saved', setAttribute() {}, removeAttribute() {}, focus() { focused = true; } };
  const dialog = {
    open: false,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    querySelector: selector => selector === '#aiTryOnApp' ? workspace : selector === '.detail-tryon-message' ? { textContent: '' } : { addEventListener() {} },
    addEventListener: (name, handler) => { dialogHandlers[name] = handler; },
    showModal() { this.open = true; }, close() { this.open = false; dialogHandlers.close(); }
  };
  const bodyClasses = new Set();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/detail-try-on.js'), 'utf8'), {
    document: { getElementById: () => dialog, addEventListener: (name, handler) => { handlers[name] = handler; }, body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } } },
    window: { UpgradeModal: { requireTryOnAccess: async () => allowed }, trackEvent: name => events.push(name) },
    location: { href: 'http://localhost/garment', origin: 'http://localhost' }, URL,
    requestAnimationFrame: callback => paintCallbacks.push(callback)
  });
  return { dialog, workspace, paintCallbacks, bodyClasses, classes, events, focused: () => focused,
    click: () => handlers.click({ target: { closest: () => link }, button: 0, preventDefault() {} }) };
}

test('opens the existing native workspace before any garment initialization', async () => {
  const h = harness();
  await h.click();
  assert.equal(h.dialog.open, true);
  assert.equal(h.classes.has('is-ready'), true);
  assert.equal(h.workspace.dataset.projectId, 'saved');
  assert.equal(h.paintCallbacks.length, 1);
  assert.equal(h.events.includes('ai_tryon_editor_open'), true);
  h.dialog.close();
  assert.equal(h.bodyClasses.size, 0);
  assert.equal(h.focused(), true);
});

test('preserves the access gate before opening the native dialog', async () => {
  const h = harness(false);
  await h.click();
  assert.equal(h.dialog.open, false);
  assert.equal(h.paintCallbacks.length, 0);
});

test('shared workspace renders in a dialog without loading a second garment before opening', () => {
  const ejs = require('ejs');
  const template = fs.readFileSync(path.join(__dirname, '../views/partials/ai-try-on-workspace.ejs'), 'utf8');
  const html = ejs.render(template, { embeddedTryOn: true, personModels: require('../lib/try-on-models.json'), model: { name: 'T-shirt', slug: 'test', file_url: '/test.glb' }, categorySlug: 't-shirt', tryOnCreditCost: 10 });
  assert.match(html, /id="aiTryOnApp"/);
  assert.match(html, /src=""\s+data-model-src="\/test.glb"/);
  const detail = fs.readFileSync(path.join(__dirname, '../views/model-detail.ejs'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../public/js/detail-try-on.js'), 'utf8');
  assert.doesNotMatch(detail, /detailTryOnFrame|<iframe/);
  assert.doesNotMatch(controller, /contentWindow|postMessage|frame\.src/);
});

test('Worker model detail preserves all presets in the embedded try-on workspace', () => {
  const templates = require('../src/worker-templates.cjs');
  const presets = require('../lib/try-on-models.json');
  const html = templates.render('model-detail', {
    t: key => key, i18next: { language: 'en' }, user: null,
    model: { id: 223, name: 'T-shirt', slug: 'test', category_slug: 't-shirt', file_url: '/test.glb', image_url: '' },
    aiTryOnEnabled: true, tryOnPersonModels: presets, tryOnCreditCost: 10, related: []
  });
  const workspace = html.slice(html.indexOf('id="aiTryOnApp"'));
  assert.equal((workspace.match(/data-model-card/g) || []).length, presets.length);
  for (const preset of presets) assert.ok(workspace.includes(`data-model-name="${preset.name}"`));
});
