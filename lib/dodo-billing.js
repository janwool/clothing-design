const DodoPayments = require('dodopayments').default;
const { getOpeningOffer } = require('./opening-offer');

const PRODUCT_ENV_KEYS = Object.freeze({
  pro: Object.freeze({
    monthly: 'DODO_PRO_MONTHLY_PRODUCT_ID',
    yearly: 'DODO_PRO_YEARLY_PRODUCT_ID'
  }),
  max: Object.freeze({
    monthly: 'DODO_MAX_MONTHLY_PRODUCT_ID',
    yearly: 'DODO_MAX_YEARLY_PRODUCT_ID'
  })
});

function getEnvValue(key) {
  return process.env[key] || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__[key]) || '';
}

function getEnvironment() {
  return String(getEnvValue('DODO_PAYMENTS_ENVIRONMENT')).toLowerCase() === 'test_mode'
    ? 'test_mode'
    : 'live_mode';
}

function getClient({ webhookKey = '' } = {}) {
  return new DodoPayments({
    bearerToken: getEnvValue('DODO_PAYMENTS_API_KEY') || 'webhook-verification-only',
    webhookKey: webhookKey || getEnvValue('DODO_PAYMENTS_WEBHOOK_KEY') || null,
    environment: getEnvironment()
  });
}

function getProduct(plan, billingInterval) {
  const safePlan = String(plan || '').toLowerCase();
  const safeInterval = String(billingInterval || '').toLowerCase();
  const envKey = PRODUCT_ENV_KEYS[safePlan]?.[safeInterval];
  const productId = envKey ? String(getEnvValue(envKey)).trim() : '';
  return envKey && productId
    ? { plan: safePlan, billingInterval: safeInterval, productId }
    : null;
}

function getAccessForProduct(productId) {
  const candidate = String(productId || '').trim();
  if (!candidate) return null;
  for (const [plan, intervals] of Object.entries(PRODUCT_ENV_KEYS)) {
    for (const [billingInterval, envKey] of Object.entries(intervals)) {
      if (String(getEnvValue(envKey)).trim() === candidate) {
        return { plan, billingInterval, productId: candidate };
      }
    }
  }
  return null;
}

async function createDodoCheckout({ plan, billingInterval, user, successUrl, cancelUrl }) {
  const product = getProduct(plan, billingInterval);
  if (!PRODUCT_ENV_KEYS[String(plan || '').toLowerCase()]?.[String(billingInterval || '').toLowerCase()]) {
    const error = new Error('Choose an available subscription plan.');
    error.status = 400;
    throw error;
  }
  if (!product || !getEnvValue('DODO_PAYMENTS_API_KEY')) {
    const error = new Error('Subscriptions are not configured yet.');
    error.status = 503;
    throw error;
  }

  const email = String(user.email || '').trim().toLowerCase();
  const openingOffer = getOpeningOffer();
  const session = await getClient().checkoutSessions.create({
    feature_flags: { allow_discount_code: true },
    ...(openingOffer ? { discount_code: openingOffer.code } : {}),
    product_cart: [{ product_id: product.productId, quantity: 1 }],
    customer: {
      email,
      name: String(user.name || email.split('@')[0] || 'Customer').trim()
    },
    metadata: {
      userId: String(user.id),
      plan: product.plan,
      billingInterval: product.billingInterval
    },
    return_url: successUrl,
    cancel_url: cancelUrl
  });

  if (!session.checkout_url) {
    const error = new Error('Checkout could not be created.');
    error.status = 502;
    throw error;
  }
  return { checkoutUrl: session.checkout_url, product };
}

function unwrapDodoWebhook(rawBody, headers) {
  const webhookKey = getEnvValue('DODO_PAYMENTS_WEBHOOK_KEY');
  if (!webhookKey) throw new Error('Dodo Payments webhook key is not configured.');
  return getClient({ webhookKey }).webhooks.unwrap(String(rawBody || ''), {
    headers: {
      'webhook-id': String(headers?.['webhook-id'] || ''),
      'webhook-signature': String(headers?.['webhook-signature'] || ''),
      'webhook-timestamp': String(headers?.['webhook-timestamp'] || '')
    }
  });
}

function extractDodoEventData(event, webhookId) {
  const object = event?.data && typeof event.data === 'object' ? event.data : {};
  const customer = object.customer && typeof object.customer === 'object' ? object.customer : {};
  const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata : {};
  const productId = object.product_id || object.product_cart?.[0]?.product_id || '';
  const subscriptionId = object.subscription_id || '';
  return {
    eventId: String(webhookId || ''),
    eventType: String(event?.type || ''),
    productId: String(productId || ''),
    customerId: String(customer.customer_id || object.customer_id || ''),
    customerEmail: String(customer.email || object.customer_email || '').trim().toLowerCase(),
    subscriptionId: String(subscriptionId || ''),
    subscriptionStatus: String(object.status || '').toLowerCase(),
    cancelAtNextBillingDate: object.cancel_at_next_billing_date === true,
    periodStart: object.previous_billing_date || null,
    periodEnd: event?.type === 'subscription.past_due' && object.past_due_ends_at
      ? object.past_due_ends_at
      : object.next_billing_date || null,
    userId: String(metadata.userId || metadata.user_id || '').trim()
  };
}

module.exports = {
  PRODUCT_ENV_KEYS,
  createDodoCheckout,
  extractDodoEventData,
  getAccessForProduct,
  getProduct,
  unwrapDodoWebhook
};
