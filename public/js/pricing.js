(() => {
  const options = [...document.querySelectorAll('[data-billing-option]')];
  const prices = [...document.querySelectorAll('[data-plan-price]')];
  const periods = [...document.querySelectorAll('[data-plan-period]')];
  const alternatePrices = [...document.querySelectorAll('[data-plan-alt]')];
  const planLinks = [...document.querySelectorAll('[data-plan-link]')];
  const pricingCtas = [...document.querySelectorAll('[data-pricing-cta]')];
  const caption = document.querySelector('[data-billing-caption]');
  const plansRoot = document.querySelector('[data-pricing-plans]');
  const currencySelect = document.querySelector('[data-pricing-currency]');
  let quote = { currency: 'USD', monthly: 9.9, yearly: 80 };
  let quoteRequest = 0;
  let pricingReady = Promise.resolve();
  let pricingUnavailable = false;
  const money = amount => new Intl.NumberFormat(navigator.language || 'en', {
    style: 'currency', currency: quote.currency
  }).format(amount);
  const authenticated = plansRoot?.dataset.authenticated === 'true';
  const planDetails = {
    free: { name: 'Free', monthly: 0, yearly: 0 },
    pro: { name: 'Pro', monthly: 9.9, yearly: 80 },
    business: { name: 'Business' }
  };

  if (!options.length) return;

  const selectedBilling = () => (
    options.find(option => option.classList.contains('is-active'))?.dataset.billingOption || 'monthly'
  );

  const trackPricing = (eventName, parameters) => {
    if (typeof window.trackEvent !== 'function') return;
    window.trackEvent(eventName, {
      page_type: 'pricing',
      ...parameters
    });
  };

  const planEvent = (plan, billing = selectedBilling()) => {
    const details = planDetails[plan] || { name: plan };
    const price = plan === 'pro' ? quote[billing] : details[billing];
    const item = {
      item_id: plan,
      item_name: details.name,
      item_category: 'subscription',
      item_variant: plan === 'business' ? 'custom' : billing,
      price,
      quantity: 1
    };
    Object.keys(item).forEach(key => item[key] === undefined && delete item[key]);
    return {
      currency: price === undefined ? undefined : quote.currency,
      value: price,
      billing_interval: plan === 'business' ? 'custom' : billing,
      item_list_id: 'pricing_plans',
      item_list_name: 'Pricing plans',
      items: [item]
    };
  };

  const setBilling = (billing, trackChange = false) => {
    const previousBilling = selectedBilling();
    options.forEach(option => {
      const selected = option.dataset.billingOption === billing;
      option.classList.toggle('is-active', selected);
      option.setAttribute('aria-pressed', String(selected));
    });

    prices.forEach(price => {
      price.textContent = money(billing === 'yearly' ? quote.yearly / 12 : quote.monthly);
    });

    periods.forEach(period => {
      period.textContent = period.dataset[billing];
    });

    alternatePrices.forEach(price => {
      price.textContent = billing === 'yearly' ? `${money(quote.yearly)} billed annually` : 'Billed monthly';
    });

    document.querySelectorAll('[data-plan-saving]').forEach(saving => {
      const percent = (1 - quote.yearly / (quote.monthly * 12)) * 100;
      saving.hidden = billing !== 'yearly' || percent <= 0;
      saving.querySelector('s').textContent = `${money(quote.monthly)} / month`;
      saving.querySelector('span').textContent = `Save ${percent.toFixed(1)}%`;
    });

    planLinks.forEach(link => {
      const params = new URLSearchParams({ plan: link.dataset.plan, billing });
      params.set('currency', currencySelect?.value || 'auto');
      const returnPath = `/pricing?${params.toString()}&checkout=resume`;
      link.dataset.billing = billing;
      link.href = authenticated
        ? `/pricing?${params.toString()}`
        : `/auth/register?next=${encodeURIComponent(returnPath)}`;
    });

    if (caption) {
      caption.textContent = `${billing === 'yearly' ? 'Monthly equivalent. ' : ''}Prices in ${quote.currency}. Taxes calculated at checkout.${pricingUnavailable ? ' Local pricing unavailable.' : ''}`;
    }

    const freePrice = document.querySelector('[data-free-price]');
    if (freePrice) freePrice.textContent = money(0);

    if (trackChange) {
      trackPricing(`pricing_billing_${billing}_click`, {
        billing_interval: billing,
        previous_billing_interval: previousBilling
      });
    }
  };

  // Keep this in memory only: reloading after a VPN change must detect the new IP.
  const visitorCountry = (async () => {
    try {
      const response = await fetch('/api/billing/location', {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(4000)
      });
      const location = await response.json();
      if (response.ok && /^[A-Z]{2}$/.test(location.country || '')) return location.country;
    } catch (_) { /* Local previews may not have edge geolocation. */ }
    try {
      // Request from the browser so browser VPN/proxy settings are respected.
      // Only the country code is used; no IP address is stored or sent to our API.
      const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) return null;
      return (await response.text()).match(/^loc=([A-Z]{2})$/m)?.[1] || null;
    } catch (_) { return null; }
  })();

  async function loadPricing() {
    const request = ++quoteRequest;
    const params = new URLSearchParams();
    const country = await visitorCountry;
    if (request !== quoteRequest) return;
    if (country) params.set('country', country);
    if (currencySelect?.value === 'USD') params.set('currency', 'USD');
    plansRoot?.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/billing/pricing?${params}`, { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('Pricing unavailable');
      if (request !== quoteRequest) return;
      quote = result;
      pricingUnavailable = false;
    } catch (_) {
      if (request !== quoteRequest) return;
      quote = { currency: 'USD', monthly: 9.9, yearly: 80 };
      pricingUnavailable = true;
    }
    if (currencySelect?.value === 'auto') {
      currencySelect.options[0].textContent = `Local currency (${quote.currency})`;
    }
    setBilling(selectedBilling());
    plansRoot?.removeAttribute('aria-busy');
  }

  currencySelect?.addEventListener('change', () => {
    setBilling(selectedBilling());
    pricingReady = loadPricing();
  });

  options.forEach(option => {
    option.addEventListener('click', () => setBilling(option.dataset.billingOption, true));
  });

  async function startCheckout(link, source = 'pricing_cta') {
    link.setAttribute('aria-disabled', 'true');
    let pending;
    do { pending = pricingReady; await pending; } while (pending !== pricingReady);
    const selected = selectedBilling();
    const checkoutEvent = planEvent(link.dataset.plan, selected);
    trackPricing(`pricing_${link.dataset.plan}_checkout_begin`, { ...checkoutEvent, checkout_source: source });
    const originalText = link.textContent;
    link.classList.add('is-loading');
    link.setAttribute('aria-disabled', 'true');
    link.textContent = 'Opening checkout…';
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ plan: link.dataset.plan, billingInterval: selected, currency: quote.currency, country: quote.country })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 && payload.loginUrl) {
        trackPricing(`pricing_${link.dataset.plan}_checkout_login_required`, {
          method: 'unknown',
          login_reason: 'checkout_session_expired',
          plan_name: link.dataset.plan,
          billing_interval: selected
        });
        window.location.assign(payload.loginUrl);
        return;
      }
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || 'Checkout could not be started.');
      trackPricing(`pricing_${link.dataset.plan}_checkout_redirect`, {
        checkout_provider: 'dodo_payments',
        plan_name: link.dataset.plan,
        billing_interval: selected
      });
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      trackPricing(`pricing_${link.dataset.plan}_checkout_error`, {
        checkout_provider: 'dodo_payments',
        plan_name: link.dataset.plan,
        billing_interval: selected,
        error_message: String(error.message || 'Checkout could not be started.').slice(0, 120)
      });
      window.alert(error.message || 'Checkout could not be started.');
      link.classList.remove('is-loading');
      link.removeAttribute('aria-disabled');
      link.textContent = originalText;
    }
  }

  pricingCtas.forEach(link => {
    link.addEventListener('click', () => {
      const plan = link.dataset.plan;
      const selection = planEvent(plan);
      if (plan === 'business') {
        trackPricing('pricing_business_contact_click', {
          lead_source: 'pricing',
          plan_name: 'business',
          billing_interval: 'custom'
        });
      } else if (plan === 'free') {
        trackPricing('pricing_free_signup_start', selection);
      } else if (authenticated) {
        trackPricing(`pricing_${plan}_checkout_click`, selection);
      } else {
        trackPricing(`pricing_${plan}_signup_start`, selection);
      }
    });
  });

  planLinks.forEach(link => {
    link.addEventListener('click', event => {
      if (!authenticated) return;
      event.preventDefault();
      if (link.getAttribute('aria-disabled') === 'true') return;
      startCheckout(link);
    });
  });

  const query = new URLSearchParams(window.location.search);
  const requestedBilling = query.get('billing');
  const initialBilling = ['monthly', 'yearly'].includes(requestedBilling) ? requestedBilling : 'monthly';
  if (currencySelect && query.get('currency') === 'USD') currencySelect.value = 'USD';
  setBilling(initialBilling);
  pricingReady = loadPricing();
  trackPricing('pricing_plans_view', {
    billing_interval: initialBilling,
    pricing_entry_source: query.get('source') || undefined,
    pricing_intent: query.get('intent') || undefined,
    source_item_id: query.get('model') || undefined,
    item_list_id: 'pricing_plans',
    item_list_name: 'Pricing plans',
    items: Object.keys(planDetails).map(plan => planEvent(plan, initialBilling).items[0])
  });
  if (authenticated && query.get('checkout') === 'resume') {
    const requestedPlan = query.get('plan');
    const link = planLinks.find(item => item.dataset.plan === requestedPlan);
    if (link) startCheckout(link, 'auth_resume');
  }
})();
