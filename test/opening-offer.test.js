const test = require('node:test');
const assert = require('node:assert/strict');
const { getOpeningOffer } = require('../lib/opening-offer');
test('opening discount includes November 30 in Beijing time and ends at midnight', () => {
  const offer = getOpeningOffer(Date.parse('2026-11-30T23:59:59+08:00'));
  assert.equal(offer.code, 'OPEN50');
  assert.equal(offer.percentOff, 50);
  assert.equal(offer.subscriptionCycles, 1);
  assert.equal(getOpeningOffer(Date.parse('2026-12-01T00:00:00+08:00')), null);
});

test('checkout applies OPEN50 during the campaign, then omits it after expiry', async () => {
  const { createDodoCheckout } = require('../lib/dodo-billing');
  const keys = ['DODO_PAYMENTS_API_KEY', 'DODO_PRO_MONTHLY_PRODUCT_ID'];
  const previous = keys.map(key => process.env[key]);
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const requests = [];
  process.env.DODO_PAYMENTS_API_KEY = 'test-key';
  process.env.DODO_PRO_MONTHLY_PRODUCT_ID = 'test-product';
  global.fetch = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ checkout_url: 'https://checkout.example.test/session' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const input = { plan: 'pro', billingInterval: 'monthly', user: { id: 1, email: 'test@example.test' }, successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' };
  try {
    Date.now = () => Date.parse('2026-11-30T15:59:59Z');
    await createDodoCheckout(input);
    assert.equal(requests[0].discount_code, 'OPEN50');
    assert.equal(requests[0].feature_flags.allow_discount_code, true);
    Date.now = () => Date.parse('2026-11-30T16:00:00Z');
    await createDodoCheckout(input);
    assert.equal(requests[1].discount_code, undefined);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
    keys.forEach((key, index) => previous[index] === undefined ? delete process.env[key] : process.env[key] = previous[index]);
  }
});
