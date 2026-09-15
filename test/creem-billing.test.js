const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  CREEM_PRODUCTS,
  extractCreemEventData,
  getAccessForProduct,
  getProduct,
  verifyCreemSignature
} = require('../lib/creem-billing');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('maps all four Creem products to server-owned plan choices', () => {
  assert.equal(CREEM_PRODUCTS.pro.monthly, 'prod_4DB5OshHH4CDUVqMt0cnTz');
  assert.equal(CREEM_PRODUCTS.max.monthly, 'prod_1HhIXZBU7fy2Nvu7VRBM9P');
  assert.equal(CREEM_PRODUCTS.pro.yearly, 'prod_5avizFjiyW2ou1CsHq7W0n');
  assert.equal(CREEM_PRODUCTS.max.yearly, 'prod_52uqjqShw514bQpCXoSmsZ');
  assert.deepEqual(getProduct('pro', 'yearly'), {
    plan: 'pro', billingInterval: 'yearly', productId: CREEM_PRODUCTS.pro.yearly
  });
  assert.equal(getProduct('business', 'monthly'), null);
  assert.equal(getAccessForProduct('prod_unknown'), null);
});

test('extracts identity and subscription dates from a Creem checkout event', () => {
  const data = extractCreemEventData({
    id: 'evt_one',
    eventType: 'checkout.completed',
    object: {
      product: { id: CREEM_PRODUCTS.max.monthly },
      customer: { id: 'cust_one', email: 'DESIGNER@example.com' },
      metadata: { userId: '42' },
      subscription: {
        id: 'sub_one',
        status: 'active',
        current_period_start_date: '2026-09-01T00:00:00.000Z',
        current_period_end_date: '2026-10-01T00:00:00.000Z'
      }
    }
  });
  assert.equal(data.eventId, 'evt_one');
  assert.equal(data.productId, CREEM_PRODUCTS.max.monthly);
  assert.equal(data.customerEmail, 'designer@example.com');
  assert.equal(data.subscriptionId, 'sub_one');
  assert.equal(data.userId, '42');
});

test('verifies Creem webhook HMAC signatures without plain string comparison', () => {
  const previous = process.env.CREEM_WEBHOOK_SECRET;
  process.env.CREEM_WEBHOOK_SECRET = 'test-webhook-secret';
  const body = '{"id":"evt_signed"}';
  const signature = createHmac('sha256', process.env.CREEM_WEBHOOK_SECRET).update(body).digest('hex');
  assert.equal(verifyCreemSignature(body, signature), true);
  assert.equal(verifyCreemSignature(`${body} `, signature), false);
  if (previous === undefined) delete process.env.CREEM_WEBHOOK_SECRET;
  else process.env.CREEM_WEBHOOK_SECRET = previous;
});

test('connects Pricing checkout and signed webhooks to the entitlement store', () => {
  const app = read('app-core.js');
  const route = read('routes/billing.js');
  const pricing = read('public/js/pricing.js');
  assert.match(app, /app\.use\('\/api\/billing', require\('\.\/routes\/billing'\)\)/);
  assert.match(app, /req\.rawBody = buffer\.toString\('utf8'\)/);
  assert.match(route, /router\.post\('\/checkout', requireUser/);
  assert.match(route, /router\.post\('\/webhooks\/creem'/);
  assert.match(route, /verifyCreemSignature/);
  assert.match(route, /ON CONFLICT\(user_id\) DO UPDATE SET/);
  assert.match(route, /billing_webhook_events/);
  assert.match(pricing, /fetch\('\/api\/billing\/checkout'/);
  assert.match(pricing, /const initialBilling = \['monthly', 'yearly'\]\.includes\(requestedBilling\) \? requestedBilling : 'monthly'/);
  assert.match(pricing, /setBilling\(initialBilling\)/);
});

test('tracks each Pricing action with a dedicated functional event name', () => {
  const pricingView = read('views/pricing.ejs');
  const pricing = read('public/js/pricing.js');
  assert.match(pricingView, /data-pricing-cta data-plan="free"/);
  assert.match(pricingView, /data-pricing-cta data-plan="business"/);
  assert.match(pricing, /trackPricing\('pricing_plans_view'/);
  assert.match(pricing, /pricing_entry_source: query\.get\('source'\) \|\| undefined/);
  assert.match(pricing, /pricing_intent: query\.get\('intent'\) \|\| undefined/);
  assert.match(pricing, /pricing_\$\{link\.dataset\.plan\}_checkout_begin/);
  assert.match(pricing, /link\.dataset\.billing = billing/);
  assert.match(pricing, /pricing_billing_\$\{billing\}_click/);
  assert.match(pricing, /pricing_\$\{link\.dataset\.plan\}_checkout_redirect/);
  assert.match(pricing, /pricing_\$\{link\.dataset\.plan\}_checkout_error/);
  assert.match(pricing, /trackPricing\('pricing_business_contact_click'/);
  assert.match(pricing, /pricing_\$\{plan\}_signup_start/);
  assert.match(pricingView, /data-billing-option="monthly" data-analytics-managed="true"/);
  assert.match(pricingView, /data-plan="pro" data-analytics-managed="true"/);
});
