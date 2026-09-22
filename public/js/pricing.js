(() => {
  const options = [...document.querySelectorAll('[data-billing-option]')];
  const prices = [...document.querySelectorAll('[data-plan-price]')];
  const periods = [...document.querySelectorAll('[data-plan-period]')];
  const alternatePrices = [...document.querySelectorAll('[data-plan-alt]')];
  const planLinks = [...document.querySelectorAll('[data-plan-link]')];
  const pricingCtas = [...document.querySelectorAll('[data-pricing-cta]')];
  const caption = document.querySelector('[data-billing-caption]');
  const plansRoot = document.querySelector('[data-pricing-plans]');
  const authenticated = plansRoot?.dataset.authenticated === 'true';
  const planDetails = {
    free: { name: 'Free', monthly: 0, yearly: 0 },
    pro: { name: 'Pro', monthly: 9.9, yearly: 80 },
    max: { name: 'Max', monthly: 29, yearly: 236 },
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
    const price = details[billing];
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
      currency: price === undefined ? undefined : 'USD',
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
      price.textContent = price.dataset[billing];
    });

    periods.forEach(period => {
      period.textContent = period.dataset[billing];
    });

    alternatePrices.forEach(price => {
      price.textContent = price.dataset[billing];
    });

    document.querySelectorAll('[data-plan-saving]').forEach(saving => {
      saving.hidden = billing !== 'yearly';
    });

    planLinks.forEach(link => {
      const params = new URLSearchParams({ plan: link.dataset.plan, billing });
      const returnPath = `/pricing?${params.toString()}&checkout=resume`;
      link.dataset.billing = billing;
      link.href = authenticated
        ? `/pricing?${params.toString()}`
        : `/auth/register?next=${encodeURIComponent(returnPath)}`;
    });

    if (caption) {
      caption.textContent = billing === 'yearly'
        ? 'Monthly equivalent, billed annually. All prices in USD.'
        : 'Flexible monthly billing. Change plans anytime.';
    }

    if (trackChange) {
      trackPricing(`pricing_billing_${billing}_click`, {
        billing_interval: billing,
        previous_billing_interval: previousBilling
      });
    }
  };

  options.forEach(option => {
    option.addEventListener('click', () => setBilling(option.dataset.billingOption, true));
  });

  async function startCheckout(link, source = 'pricing_cta') {
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
        body: JSON.stringify({ plan: link.dataset.plan, billingInterval: selected })
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
  setBilling(initialBilling);
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
