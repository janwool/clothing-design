(() => {
  const options = [...document.querySelectorAll('[data-billing-option]')];
  const prices = [...document.querySelectorAll('[data-plan-price]')];
  const periods = [...document.querySelectorAll('[data-plan-period]')];
  const alternatePrices = [...document.querySelectorAll('[data-plan-alt]')];
  const planLinks = [...document.querySelectorAll('[data-plan-link]')];
  const caption = document.querySelector('[data-billing-caption]');
  const plansRoot = document.querySelector('[data-pricing-plans]');
  const authenticated = plansRoot?.dataset.authenticated === 'true';

  if (!options.length) return;

  const setBilling = billing => {
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

    planLinks.forEach(link => {
      const params = new URLSearchParams({ plan: link.dataset.plan, billing });
      const returnPath = `/pricing?${params.toString()}&checkout=resume`;
      link.href = authenticated
        ? `/pricing?${params.toString()}`
        : `/auth/register?next=${encodeURIComponent(returnPath)}`;
    });

    if (caption) {
      caption.textContent = billing === 'yearly'
        ? 'One annual payment. Pro is billed in CNY; Max is billed in USD.'
        : 'Flexible monthly billing. Change plans anytime.';
    }
  };

  options.forEach(option => {
    option.addEventListener('click', () => setBilling(option.dataset.billingOption));
  });

  async function startCheckout(link) {
    const selected = options.find(option => option.classList.contains('is-active'))?.dataset.billingOption || 'monthly';
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
        window.location.assign(payload.loginUrl);
        return;
      }
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || 'Checkout could not be started.');
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      window.alert(error.message || 'Checkout could not be started.');
      link.classList.remove('is-loading');
      link.removeAttribute('aria-disabled');
      link.textContent = originalText;
    }
  }

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
  if (['monthly', 'yearly'].includes(requestedBilling)) setBilling(requestedBilling);
  if (authenticated && query.get('checkout') === 'resume') {
    const requestedPlan = query.get('plan');
    const link = planLinks.find(item => item.dataset.plan === requestedPlan);
    if (link) startCheckout(link);
  }
})();
