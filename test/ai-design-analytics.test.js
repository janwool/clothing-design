const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/detail-ai-design.js'), 'utf8');

function setup({ authenticated = true, status = 200, code, applyFails = false, saveFails = false, loaded = true, analyticsFails = false } = {}) {
  class Element {
    constructor() { this.listeners = {}; this.children = []; this.dataset = {}; this.hidden = true; this.files = []; this.value = ''; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    async fire(name, event = {}) { return this.listeners[name]?.({ preventDefault() {}, ...event }); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    replaceChildren() { this.children = []; }
    remove() {}
    focus() {}
    click() { return this.fire('click'); }
    setAttribute(key, value) { this[key] = value; }
    removeAttribute(key) { delete this[key]; }
    reportValidity() { return true; }
  }
  const panel = new Element();
  panel.dataset = { authenticated: String(authenticated), modelSlug: 'cargo-pants' };
  const form = new Element(), prompt = new Element(), button = new Element();
  prompt.value = 'PRIVATE DESIGN TEXT';
  form.elements = { prompt };
  form.querySelector = () => button;
  form.requestSubmit = () => form.fire('submit');
  const selectors = ['[data-design-status]', '[data-design-history]', '[data-design-access]', '[data-design-reference]', '[data-reference-add]', '[data-reference-grid]', '[data-reference-error]', '[data-reference-count]'];
  const nodes = Object.fromEntries(selectors.map(selector => [selector, new Element()]));
  panel.querySelector = selector => selector === 'form' ? form : nodes[selector];
  const events = [], calls = [];
  const api = {
    prepareAiDesign: async () => ({}), capture: async () => 'PRIVATE IMAGE',
    applyAiDesign: async () => { if (applyFails) throw Error('PRIVATE ERROR'); return 'blob:design'; },
    saveAiDesignProject: async () => { if (saveFails) throw Error('PRIVATE SAVE ERROR'); }
  };
  const context = {
    document: { querySelector: selector => selector === '[data-ai-design]' ? panel : { loaded }, createElement: () => new Element() },
    location: { pathname: '/3d-models/pants/cargo-pants', search: '' },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { trackEvent: (name, parameters) => { if (analyticsFails) throw Error('tracker failed'); events.push({ name, parameters }); }, ModelDesignerExport: api, ModelLoginModal: { open: () => calls.push('login') }, crypto: { randomUUID: () => 'attempt-1' } },
    fetch: async () => { calls.push('request'); return { ok: status === 200, status, json: async () => ({ success: status === 200, code, image: { url: 'PRIVATE ASSET URL', downloadUrl: 'PRIVATE DOWNLOAD URL' } }) }; },
    AbortController, setTimeout: () => 1, clearTimeout() {},
    FileReader: class { readAsDataURL() { this.result = 'PRIVATE FILE CONTENT'; this.onload(); } },
    Image: class { constructor() { this.width = this.height = 10; } async decode() {} }
  };
  vm.runInNewContext(source, context);
  return { form, nodes, events, calls, names: () => events.map(e => e.name) };
}

test('records the generation funnel without design content and separates save from generation', async () => {
  const h = setup(); await h.form.fire('submit');
  assert.deepEqual(h.names(), ['ai_design_submit', 'ai_design_generation_start', 'ai_design_generation_success', 'ai_design_apply_start', 'ai_design_apply_success', 'ai_design_project_save_start', 'ai_design_project_save_success']);
  assert.doesNotMatch(JSON.stringify(h.events), /PRIVATE/);
  for (const e of h.events) assert.ok(e.name.length <= 40);
});
test('anonymous submission reports login gate without starting a generation', async () => {
  const h = setup({ authenticated: false }); await h.form.fire('submit');
  assert.deepEqual(h.names(), ['ai_design_submit', 'ai_design_login_required']);
  assert.deepEqual(h.calls, ['login']);
});
test('expired session records one generation error and a login gate', async () => {
  const h = setup({ status: 401 }); await h.form.fire('submit');
  assert.equal(h.names().filter(n => n === 'ai_design_generation_error').length, 1);
  assert.ok(h.names().includes('ai_design_login_required'));
  assert.ok(!h.names().includes('ai_design_generation_success'));
});
test('insufficient credits records a single rejection and access block', async () => {
  const h = setup({ status: 403, code: 'INSUFFICIENT_CREDITS' }); await h.form.fire('submit');
  const errors = h.events.filter(e => e.name === 'ai_design_generation_error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].parameters.error_code, 'insufficient_credits');
  assert.ok(h.names().includes('ai_design_access_blocked'));
});
test('application failure does not overwrite a successful generation', async () => {
  const h = setup({ applyFails: true }); await h.form.fire('submit');
  assert.ok(h.names().includes('ai_design_generation_success'));
  assert.ok(h.names().includes('ai_design_apply_error'));
  assert.ok(!h.names().includes('ai_design_generation_error'));
});
test('save failure preserves generation and application success', async () => {
  const h = setup({ saveFails: true }); await h.form.fire('submit');
  assert.ok(h.names().includes('ai_design_project_save_error'));
  assert.ok(h.names().includes('ai_design_apply_success'));
  assert.ok(!h.names().includes('ai_design_generation_error'));
});
test('unready garment is a preparation failure, not a generation request', async () => {
  const h = setup({ loaded: false }); await h.form.fire('submit');
  assert.ok(h.names().includes('ai_design_prepare_error'));
  assert.ok(!h.names().includes('ai_design_generation_start'));
  assert.deepEqual(h.calls, []);
});
test('reference attachment reports readiness even though the input is cleared', async () => {
  const h = setup(); const input = h.nodes['[data-design-reference]'];
  input.files = [{ name: 'PRIVATE FILENAME', type: 'image/png', size: 100 }];
  await input.fire('change');
  assert.deepEqual(h.names(), ['ai_design_reference_select', 'ai_design_reference_ready']);
  assert.equal(h.events[1].parameters.reference_count, 1);
  assert.doesNotMatch(JSON.stringify(h.events), /PRIVATE/);
});
test('analytics failure cannot block generation or application', async () => {
  const h = setup({ analyticsFails: true }); await h.form.fire('submit');
  assert.deepEqual(h.calls, ['request']);
  assert.equal(h.nodes['[data-design-history]'].children[1].children[1].textContent, 'Design applied and project saved.');
});

test('rejected reference file never reports readiness', async () => {
  const h = setup();
  h.nodes['[data-design-reference]'].files = [{ name: 'secret.txt', type: 'text/plain', size: 100 }];
  await h.nodes['[data-design-reference]'].fire('change');
  assert.ok(!h.names().includes('ai_design_reference_ready'));
  assert.equal(h.events.at(-1).parameters.error_code, 'unsupported_type');
});
test('save retry records saving again without another generation request', async () => {
  const h = setup({ saveFails: true }); await h.form.fire('submit');
  const reply = h.nodes['[data-design-history]'].children[1];
  await reply.children.at(-1).fire('click');
  assert.ok(h.names().includes('ai_design_project_save_retry'));
  assert.equal(h.names().filter(n => n === 'ai_design_generation_start').length, 1);
  assert.equal(h.names().filter(n => n === 'ai_design_project_save_error').length, 2);
});
