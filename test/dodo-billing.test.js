const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Webhook } = require('standardwebhooks');
const {
  createDodoCheckout,
  extractDodoEventData,
  getAccessForProduct,
  getProduct,
  unwrapDodoWebhook
} = require('../lib/dodo-billing');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const productEnv = {
  DODO_PRO_MONTHLY_PRODUCT_ID: 'pdt_pro_monthly',
  DODO_PRO_YEARLY_PRODUCT_ID: 'pdt_pro_yearly',
  DODO_MAX_MONTHLY_PRODUCT_ID: 'pdt_max_monthly',
  DODO_MAX_YEARLY_PRODUCT_ID: 'pdt_max_yearly'
};

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('offers Pro checkout while recognizing legacy Max webhook products', () => {
  withEnv(productEnv, () => {
    assert.deepEqual(getProduct('pro', 'yearly'), {
      plan: 'pro', billingInterval: 'yearly', productId: 'pdt_pro_yearly'
    });
    assert.deepEqual(getAccessForProduct('pdt_max_monthly'), {
      plan: 'max', billingInterval: 'monthly', productId: 'pdt_max_monthly'
    });
    assert.equal(getProduct('max', 'monthly'), null);
    assert.equal(getProduct('max', 'yearly'), null);
    assert.equal(getProduct('business', 'monthly'), null);
    assert.equal(getAccessForProduct('pdt_unknown'), null);
  });
});

test('extracts identity and subscription dates from a Dodo Payments event', () => {
  const data = extractDodoEventData({
    type: 'subscription.active',
    data: {
      product_id: 'pdt_max_monthly',
      customer: {
        customer_id: 'cus_one',
        email: 'DESIGNER@example.com'
      },
      metadata: { userId: '42' },
      subscription_id: 'sub_one',
      status: 'active',
      cancel_at_next_billing_date: true,
      previous_billing_date: '2026-09-01T00:00:00.000Z',
      next_billing_date: '2026-10-01T00:00:00.000Z'
    }
  }, 'msg_one');
  assert.equal(data.eventId, 'msg_one');
  assert.equal(data.productId, 'pdt_max_monthly');
  assert.equal(data.customerEmail, 'designer@example.com');
  assert.equal(data.subscriptionId, 'sub_one');
  assert.equal(data.userId, '42');
  assert.equal(data.cancelAtNextBillingDate, true);
  assert.equal(data.periodEnd, '2026-10-01T00:00:00.000Z');
});

test('verifies Dodo Payments Standard Webhooks signatures', () => {
  const secret = `whsec_${Buffer.from('test-webhook-secret').toString('base64')}`;
  const timestamp = new Date();
  const webhookId = 'msg_signed';
  const body = '{"type":"subscription.active","data":{}}';
  const signature = new Webhook(secret).sign(webhookId, timestamp, body);
  withEnv({ DODO_PAYMENTS_WEBHOOK_KEY: secret }, () => {
    const event = unwrapDodoWebhook(body, {
      'webhook-id': webhookId,
      'webhook-signature': signature,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000))
    });
    assert.equal(event.type, 'subscription.active');
    assert.throws(() => unwrapDodoWebhook(`${body} `, {
      'webhook-id': webhookId,
      'webhook-signature': signature,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000))
    }));
  });
});

test('connects Pricing checkout and signed Dodo webhooks to the entitlement store', () => {
  const app = read('app-core.js');
  const route = read('routes/billing.js');
  const pricing = read('public/js/pricing.js');
  assert.match(app, /app\.use\('\/api\/billing', require\('\.\/routes\/billing'\)\)/);
  assert.match(app, /req\.rawBody = buffer\.toString\('utf8'\)/);
  assert.match(route, /router\.post\('\/checkout', requireUser/);
  assert.match(route, /MERCHANT_NOT_LIVE/);
  assert.match(route, /Payments are temporarily unavailable while billing verification is completed\./);
  assert.match(route, /router\.post\('\/webhooks\/dodo-payments'/);
  assert.match(route, /unwrapDodoWebhook/);
  assert.match(route, /ON CONFLICT\(user_id\) DO UPDATE SET/);
  assert.match(route, /billing_webhook_events/);
  assert.match(pricing, /fetch\('\/api\/billing\/checkout'/);
  assert.match(pricing, /checkout_provider: 'dodo_payments'/);
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

test('rejects new Max checkouts before contacting the payment provider', async () => {
  for (const billingInterval of ['monthly', 'yearly']) {
    await assert.rejects(createDodoCheckout({ plan: 'max', billingInterval }), { status: 400 });
  }
});
