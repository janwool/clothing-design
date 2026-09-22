(() => {
  'use strict';
  let dialog, trigger, access, resource, billing = 'monthly', busy = false, checkoutPending = false, planReady = false, revision = 0;
  const plans = { pro: { name: 'Pro', monthly: '9.90', yearly: '80', credits: '250', projects: '28', storage: '1 GB' }, max: { name: 'Max', monthly: '29', yearly: '236', credits: '1,000', projects: '99', storage: '100 GB' } };
  const contact = 'mailto:support@cloz-design.com?subject=ClozDesign%20plan%20upgrade';
  function mount() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'upgradeDialog';
    dialog.className = 'upgrade-dialog';
    dialog.setAttribute('aria-labelledby', 'upgradeTitle');
    dialog.setAttribute('aria-describedby', 'upgradeReason');
    dialog.innerHTML = `<div class="upgrade-shell">
      <header class="upgrade-header"><span class="upgrade-eyebrow">ClozDesign<span>Upgrade plan</span></span><button type="button" class="upgrade-close" aria-label="Close upgrade dialog" autofocus>×</button></header>
      <div class="upgrade-content"><h2 id="upgradeTitle">Upgrade plan</h2><p id="upgradeReason"></p>
      <div class="upgrade-controls"><span class="upgrade-current"></span><div class="upgrade-billing" role="group" aria-label="Billing period"><button type="button" data-upgrade-billing="monthly" aria-pressed="true">Monthly</button><button type="button" data-upgrade-billing="yearly" aria-pressed="false">Yearly <small>Save up to 33%</small></button></div></div>
      <div class="upgrade-plans"></div><p class="upgrade-error" role="alert"></p>
      <footer class="upgrade-footer"><span>Prices in USD · Checkout opens in a new tab</span><a href="/pricing" target="_blank" rel="noopener">Compare all plans ↗</a></footer></div>
    </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.upgrade-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
    // Keep Escape inside this dialog, including when it overlays the Try-on iframe.
    document.addEventListener('keydown', event => {
      if (dialog.open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dialog.close(); }
    }, true);
    dialog.addEventListener('close', () => { if (dialog.open) return; revision++; document.documentElement.classList.remove('upgrade-open'); trigger?.focus?.(); });
    dialog.addEventListener('click', event => {
      const option = event.target.closest('[data-upgrade-billing]');
      if (option && !busy) { billing = option.dataset.upgradeBilling; render(); }
      const button = event.target.closest('[data-upgrade-plan]');
      if (button && !busy && planReady) checkout(button.dataset.upgradePlan);
    });
  }
  function render() {
    const current = access?.plan?.id || 'free';
    const paid = current !== 'free';
    dialog.querySelector('.upgrade-footer > span').textContent = paid ? 'Prices in USD · Contact us to change your subscription' : 'Prices in USD · Checkout opens in a new tab';
    const titles = { tryOnCredits: current === 'free' ? 'Unlock AI Try-on' : 'More Try-on credits', projects: 'More room to create', storage: 'More space for your designs', watermark: 'Export without watermarks' };
    dialog.querySelector('#upgradeTitle').textContent = titles[resource] || 'Upgrade plan';
    const quota = access?.[resource];
    let reason = { tryOnCredits: current === 'free' ? 'Choose a plan to generate AI Try-ons.' : `Each Try-on needs ${access?.tryOnCredits?.costPerGeneration || 10} credits. You don’t have enough credits left.`, projects: 'You’ve reached your project limit.', storage: 'Your storage is full.', watermark: 'Watermark-free exports are included in Pro and Max.' }[resource] || 'Choose the plan that fits your workflow.';
    if (quota?.resetsAt && Number.isFinite(Date.parse(quota.resetsAt))) reason += ` Resets ${new Date(quota.resetsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`;
    dialog.querySelector('#upgradeReason').textContent = reason;
    dialog.querySelector('.upgrade-current').textContent = `Current plan · ${access?.plan?.name || 'Free'}`;
    dialog.querySelectorAll('[data-upgrade-billing]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.upgradeBilling === billing)); button.disabled = busy; });
    const available = current === 'free' ? ['pro', 'max'] : current === 'pro' ? ['max'] : [];
    dialog.querySelector('.upgrade-billing').hidden = !available.length;
    dialog.querySelector('.upgrade-plans').innerHTML = available.map((id, index) => {
      const plan = plans[id];
      const annual = billing === 'yearly';
      const monthlyPrice = annual ? (Number(plan.yearly) / 12).toFixed(2) : plan.monthly;
      const discount = ((1 - Number(plan.yearly) / (Number(plan.monthly) * 12)) * 100).toFixed(1);
      return `<section class="upgrade-plan ${index === 0 ? 'is-recommended' : ''}"><div class="upgrade-plan-heading"><h3>${plan.name}</h3>${index === 0 ? '<span>Recommended</span>' : ''}</div><p class="upgrade-price">$${monthlyPrice}<small> / month</small></p>${annual ? `<div class="upgrade-annual-saving"><s>$${plan.monthly} / month</s><span>Save ${discount}%</span></div>` : ''}<p class="upgrade-renewal">${annual ? `$${plan.yearly} billed annually` : 'Billed monthly'}</p><ul><li><strong>${plan.credits}</strong> Try-on credits / month</li><li><strong>${plan.projects}</strong> projects / month</li><li><strong>${plan.storage}</strong> storage</li><li>Watermark-free exports</li><li>All mockup models</li></ul>${paid ? `<a class="upgrade-cta" href="${contact}">Contact us to upgrade ↗</a>` : `<button type="button" class="upgrade-cta" data-upgrade-plan="${id}" ${busy || !planReady ? 'disabled' : ''}>${busy ? 'Loading…' : `Get ${plan.name} ↗`}</button>`}</section>`;
    }).join('') || `<section class="upgrade-business"><h3>Need more capacity?</h3><p>Contact us for a plan tailored to your team.</p><a class="upgrade-cta" href="${contact}">Contact us ↗</a></section>`;
    dialog.querySelector('.upgrade-plans').classList.toggle('is-single', available.length < 2);
  }
  async function open(options = {}) {
    mount();
    if (dialog.open) return;
    trigger = document.activeElement;
    access = options.entitlements;
    busy = checkoutPending;
    planReady = Boolean(access);
    resource = options.resource;
    billing = 'monthly';
    const token = ++revision;
    dialog.querySelector('.upgrade-error').textContent = '';
    render();
    dialog.showModal();
    document.documentElement.classList.add('upgrade-open');
    if (!access) {
      busy = true; render();
      try {
        const response = await fetch('/api/account/entitlements', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (response.status !== 401 && (!response.ok || !result.entitlements)) throw new Error('Could not load your plan. Close this window and try again.');
        if (token !== revision) return;
        access = result.entitlements;
        planReady = true;
      } catch (error) {
        if (token === revision) dialog.querySelector('.upgrade-error').textContent = error.message || 'Could not load your plan.';
        return;
      } finally {
        if (token === revision) { busy = checkoutPending; render(); }
      }
    }
  }
  async function checkout(plan) {
    const token = revision;
    const selectedBilling = billing;
    const errorBox = dialog.querySelector('.upgrade-error');
    // Resolve payment outside the editor so the current design stays available.
    const paymentTab = window.open('about:blank', '_blank');
    if (!paymentTab) { errorBox.textContent = 'Allow pop-ups to open secure checkout, then try again.'; return; }
    paymentTab.opener = null;
    checkoutPending = true;
    busy = true; errorBox.textContent = ''; render();
    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, billingInterval: selectedBilling }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (response.status === 401) {
        paymentTab.location.href = `/auth/login?next=${encodeURIComponent(`/pricing?plan=${plan}&billing=${selectedBilling}&checkout=resume`)}`;
        return;
      }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'Checkout is unavailable. Please try again.');
      const url = new URL(result.checkoutUrl, window.location.origin);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Checkout is unavailable. Please try again.');
      paymentTab.location.href = url.href;
    } catch (error) {
      paymentTab.close(); if (token === revision) errorBox.textContent = error.message || 'Checkout is unavailable. Please try again.';
    } finally { checkoutPending = false; busy = false; if (dialog.open) render(); }
  }
  async function requireTryOnAccess({ checkCredits = true } = {}, afterLogin = false) {
    const response = await fetch('/api/account/entitlements', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      if (afterLogin) throw new Error('Your session could not be verified. Please try again.');
      const signedIn = await window.AccountLoginDialog.open();
      return signedIn ? requireTryOnAccess({ checkCredits }, true) : false;
    }
    const entitlements = result.entitlements;
    if (!response.ok || !entitlements) {
      throw new Error('Could not check your Try-on credits. Please try again.');
    }
    if (!checkCredits) return true;
    const credits = entitlements.tryOnCredits;
    if (!credits || (credits.remaining !== null && Number(credits.remaining) < (Number(credits.costPerGeneration) || 10))) {
      await open({ resource: 'tryOnCredits', entitlements });
      return false;
    }
    return true;
  }
  window.UpgradeModal = { open, requireTryOnAccess, handleLimit(result) { if (result?.code !== 'ENTITLEMENT_LIMIT_REACHED') return false; open(result); return true; } };
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-upgrade-resource]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); open({ resource: link.dataset.upgradeResource });
  });
})();
