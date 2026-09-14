const { Buffer } = require('node:buffer');
const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');

const CREEM_PRODUCTS = Object.freeze({
  pro: Object.freeze({
    monthly: 'prod_4DB5OshHH4CDUVqMt0cnTz',
    yearly: 'prod_5avizFjiyW2ou1CsHq7W0n'
  }),
  max: Object.freeze({
    monthly: 'prod_1HhIXZBU7fy2Nvu7VRBM9P',
    yearly: 'prod_52uqjqShw514bQpCXoSmsZ'
  })
});

const PRODUCT_ACCESS = Object.freeze(Object.entries(CREEM_PRODUCTS).reduce((result, [plan, intervals]) => {
  Object.entries(intervals).forEach(([billingInterval, productId]) => {
    result[productId] = Object.freeze({ plan, billingInterval, productId });
  });
  return result;
}, {}));

function getEnvValue(key) {
  return process.env[key] || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__[key]) || '';
}

function getCreemApiBase() {
  return String(getEnvValue('CREEM_TEST_MODE')).toLowerCase() === 'true'
    ? 'https://test-api.creem.io'
    : 'https://api.creem.io';
}

function getProduct(plan, billingInterval) {
  const safePlan = String(plan || '').toLowerCase();
  const safeInterval = String(billingInterval || '').toLowerCase();
  const productId = CREEM_PRODUCTS[safePlan]?.[safeInterval];
  return productId ? { plan: safePlan, billingInterval: safeInterval, productId } : null;
}

function getAccessForProduct(productId) {
  return PRODUCT_ACCESS[String(productId || '')] || null;
}

async function createCreemCheckout({ plan, billingInterval, user, successUrl }) {
  const product = getProduct(plan, billingInterval);
  if (!product) {
    const error = new Error('Choose an available subscription plan.');
    error.status = 400;
    throw error;
  }
  const apiKey = getEnvValue('CREEM_API_KEY');
  if (!apiKey) {
    const error = new Error('Subscriptions are not configured yet.');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${getCreemApiBase()}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      product_id: product.productId,
      request_id: randomUUID(),
      units: 1,
      customer: { email: String(user.email || '').toLowerCase() },
      success_url: successUrl,
      metadata: {
        userId: String(user.id),
        plan: product.plan,
        billingInterval: product.billingInterval
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.checkout_url) {
    const error = new Error(payload.message || payload.error || 'Checkout could not be created.');
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw error;
  }
  return { checkoutUrl: payload.checkout_url, product };
}

function verifyCreemSignature(rawBody, signature) {
  const secret = getEnvValue('CREEM_WEBHOOK_SECRET');
  const received = String(signature || '').trim().toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = createHmac('sha256', secret).update(String(rawBody || '')).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

function extractCreemEventData(event) {
  const object = event?.object || {};
  const subscription = object.subscription && typeof object.subscription === 'object'
    ? object.subscription
    : object.object === 'subscription' ? object : {};
  const productValue = object.product || subscription.product || object.order?.product;
  const productId = typeof productValue === 'object' ? productValue.id : productValue;
  const customerValue = object.customer || subscription.customer || object.order?.customer;
  const customerId = typeof customerValue === 'object' ? customerValue.id : customerValue;
  const customerEmail = typeof customerValue === 'object'
    ? customerValue.email
    : object.customer_email || object.order?.customer_email;
  const metadata = object.metadata || subscription.metadata || object.checkout?.metadata || {};
  return {
    eventId: String(event?.id || ''),
    eventType: String(event?.eventType || ''),
    productId: String(productId || ''),
    customerId: String(customerId || ''),
    customerEmail: String(customerEmail || '').trim().toLowerCase(),
    subscriptionId: String(subscription.id || object.subscription_id || (typeof object.subscription === 'string' ? object.subscription : '')),
    subscriptionStatus: String(subscription.status || object.status || '').toLowerCase(),
    periodStart: subscription.current_period_start_date || object.current_period_start_date || null,
    periodEnd: subscription.current_period_end_date || object.current_period_end_date || null,
    userId: String(metadata.userId || metadata.referenceId || '').trim()
  };
}

module.exports = {
  CREEM_PRODUCTS,
  createCreemCheckout,
  extractCreemEventData,
  getAccessForProduct,
  getProduct,
  verifyCreemSignature
};
