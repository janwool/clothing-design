const test = require('node:test');
const assert = require('node:assert/strict');
const { getDodoPricing, createDodoCheckout } = require('../lib/dodo-billing');
const { currencyDigits, normalizeCurrency, normalizeCountry } = require('../lib/pricing-currency');
const Dodo = require('dodopayments').default;

async function configured(callback) {
  const values = { DODO_PAYMENTS_API_KEY: 'test', DODO_PRO_MONTHLY_PRODUCT_ID: 'monthly', DODO_PRO_YEARLY_PRODUCT_ID: 'yearly' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await callback(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('validates currency and handles fractional and zero-decimal amounts', () => {
  assert.equal(normalizeCurrency('cny'), 'CNY');
  assert.equal(normalizeCurrency('BAD'), null);
  assert.equal(normalizeCountry('cn'), 'CN');
  assert.equal(normalizeCountry('XX'), null);
  assert.equal(currencyDigits('CNY'), 2);
  assert.equal(currencyDigits('JPY'), 0);
  assert.equal(currencyDigits('KWD'), 3);
});

test('quotes both intervals using provider recurring prices and requested country', async () => configured(async () => {
  for (const currency of ['CNY', 'JPY']) {
    const requests = [];
    const client = { checkoutSessions: { preview: async input => {
      requests.push(input);
      return { currency, current_breakup: { subtotal: 0 }, recurring_breakup: {
        subtotal: input.product_cart[0].product_id === 'monthly' ? 6912 : 55850
      } };
    } } };
    const quote = await getDodoPricing({ country: 'CN', currency }, client);
    const divisor = currency === 'JPY' ? 1 : 100;
    assert.equal(quote.monthly, 6912 / divisor);
    assert.equal(quote.yearly, 55850 / divisor);
    assert.equal(quote.currency, currency);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(input => input.billing_currency === currency && input.billing_address.country === 'CN'));
  }
}));

test('uses actual returned currency when adaptive pricing falls back to USD', async () => configured(async () => {
  const quote = await getDodoPricing({ country: 'CN', currency: 'CNY' }, {
    checkoutSessions: { preview: async () => ({ currency: 'USD', current_breakup: { subtotal: 990 } }) }
  });
  assert.equal(quote.currency, 'USD');
  assert.equal(quote.monthly, 9.9);
}));

test('rejects failed, inconsistent and invalid quotes without fabricating converted prices', async () => configured(async () => {
  await assert.rejects(getDodoPricing({}, { checkoutSessions: { preview: async () => { throw new Error('offline'); } } }), /offline/);
  await assert.rejects(getDodoPricing({}, { checkoutSessions: { preview: async input => ({
    currency: input.product_cart[0].product_id === 'monthly' ? 'CNY' : 'USD', current_breakup: { subtotal: 990 }
  }) } }), /Inconsistent/);
  await assert.rejects(getDodoPricing({}, { checkoutSessions: { preview: async () => ({
    currency: 'USD', current_breakup: { subtotal: -1 }
  }) } }), /Invalid/);
}));

test('checkout carries the displayed currency and country to Dodo', async () => configured(async () => {
  // Intercept the SDK transport, without creating a real checkout.
  const original = Dodo.prototype.post;
  let body;
  Dodo.prototype.post = async (_path, options) => { body = options.body; return { checkout_url: 'https://example.com/checkout' }; };
  try {
    await createDodoCheckout({ plan: 'pro', billingInterval: 'yearly', currency: 'CNY', country: 'CN',
      user: { id: 1, email: 'test@example.com' }, successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' });
    assert.equal(body.billing_currency, 'CNY');
    assert.deepEqual(body.billing_address, { country: 'CN' });
    assert.equal(body.product_cart[0].product_id, 'yearly');
    assert.equal(body.feature_flags.allow_currency_selection, true);
  } finally { Dodo.prototype.post = original; }
}));

async function browserLocation(edgeCountry, trace, failTrace = false) {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const requests = [];
  const options = ['monthly', 'yearly'].map(billing => ({
    dataset: { billingOption: billing },
    classList: { contains: () => billing === 'monthly', toggle() {} },
    setAttribute() {}, addEventListener() {}
  }));
  let finish;
  const complete = new Promise(resolve => { finish = resolve; });
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/pricing.js'), 'utf8'), {
    Intl, URLSearchParams, AbortSignal,
    navigator: { language: 'en-US' },
    window: { location: { search: '' } },
    document: {
      querySelectorAll: selector => selector === '[data-billing-option]' ? options : [],
      querySelector: () => null
    },
    fetch: async url => {
      requests.push(url);
      if (url === '/api/billing/location') return { ok: true, json: async () => ({ country: edgeCountry }) };
      if (url.startsWith('https://')) {
        if (failTrace) throw new Error('offline');
        return { ok: true, text: async () => trace };
      }
      finish();
      return { ok: true, json: async () => ({ success: true, currency: 'SGD', monthly: 13.16, yearly: 106.31 }) };
    }
  });
  await complete;
  return requests;
}

test('local preview uses browser IP country instead of browser language', async () => {
  const requests = await browserLocation(null, 'loc=SG\n');
  assert.equal(requests.at(-1), '/api/billing/pricing?country=SG');
});

test('edge country takes priority without a third-party lookup', async () => {
  assert.deepEqual(await browserLocation('SG', 'loc=US\n'), ['/api/billing/location', '/api/billing/pricing?country=SG']);
});

test('IP lookup failure falls back without guessing location from language', async () => {
  const requests = await browserLocation(null, '', true);
  assert.equal(requests.at(-1), '/api/billing/pricing?');
});
