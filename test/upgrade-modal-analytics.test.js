const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup({ status = 200, blocked = false, analyticsThrows = false } = {}) {
  const events = [], requests = [], elements = new Map(), listeners = {};
  const element = () => ({ textContent: '', dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
  const dialog = {
    ...element(), open: false,
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
    querySelectorAll() { return []; },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    showModal() { this.open = true; },
    close() { this.open = false; listeners.close.forEach(fn => fn()); }
  };
  const paymentTab = { location: {}, close() {} };
  const window = { trackEvent(name, data) { if (analyticsThrows) throw Error('analytics unavailable'); events.push({ name, data }); }, open: () => blocked ? null : paymentTab, location: { origin: 'http://localhost' } };
  vm.runInNewContext(fs.readFileSync('public/js/upgrade-modal.js', 'utf8'), {
    window, document: { createElement: () => dialog, body: { appendChild() {} }, documentElement: { classList: { add() {}, remove() {} } }, addEventListener() {} },
    URL, AbortSignal, Date,
    fetch: async (url, options) => { requests.push({ url, options }); return { status, ok: status === 200, json: async () => ({ checkoutUrl: 'https://checkout.example/pay' }) }; }
  });
  const click = async (selector, dataset) => {
    const target = { closest: value => value === selector ? { dataset } : null };
    listeners.click.forEach(fn => fn({ target }));
    await new Promise(resolve => setImmediate(resolve));
  };
  return { window, dialog, events, requests, paymentTab, click };
}
const free = { plan: { id: 'free', name: 'Free' } };

test('tracks view once, billing selection, checkout redirect and close with context', async () => {
  const h = setup();
  await h.window.UpgradeModal.open({ resource: 'storage', entitlements: free });
  await h.window.UpgradeModal.open();
  await h.click('[data-upgrade-billing]', { upgradeBilling: 'yearly' });
  await h.click('[data-upgrade-plan]', { upgradePlan: 'pro' });
  h.dialog.close();
  assert.deepEqual(h.events.map(e => e.name), ['upgrade_modal_view', 'upgrade_billing_change', 'upgrade_plan_select', 'upgrade_checkout_begin', 'upgrade_checkout_redirect', 'upgrade_modal_close']);
  const checkout = h.events.find(e => e.name === 'upgrade_checkout_redirect').data;
  assert.equal(checkout.value, 80);
  assert.equal(checkout.billing_interval, 'yearly');
  assert.equal(checkout.trigger_resource, 'storage');
  assert.equal(checkout.current_plan, 'free');
  assert.equal(h.paymentTab.location.href, 'https://checkout.example/pay');
});

for (const scenario of [
  { blocked: true, event: 'upgrade_checkout_error', reason: 'popup_blocked' },
  { status: 401, event: 'upgrade_checkout_login_required' },
  { status: 500, event: 'upgrade_checkout_error', reason: 'request_failed' }
]) test(`tracks checkout outcome ${scenario.reason || scenario.status}`, async () => {
  const h = setup(scenario);
  await h.window.UpgradeModal.open({ entitlements: free });
  await h.click('[data-upgrade-plan]', { upgradePlan: 'max' });
  assert.equal(h.events.at(-1).name, scenario.event);
  if (scenario.reason) assert.equal(h.events.at(-1).data.failure_reason, scenario.reason);
  assert.equal(h.events.some(e => e.name === 'upgrade_checkout_redirect'), false);
});

test('analytics failure cannot prevent checkout', async () => {
  const h = setup({ analyticsThrows: true });
  await h.window.UpgradeModal.open({ entitlements: free });
  await h.click('[data-upgrade-plan]', { upgradePlan: 'pro' });
  assert.equal(h.paymentTab.location.href, 'https://checkout.example/pay');
});
