(function initFeedbackWidget() {
  const widget = document.querySelector('[data-feedback-widget]');
  if (!widget) return;

  const launcher = widget.querySelector('[data-feedback-launcher]');
  const panel = widget.querySelector('[data-feedback-panel]');
  const closeButton = widget.querySelector('[data-feedback-close]');
  const form = widget.querySelector('[data-feedback-form]');
  const emailInput = form.querySelector('input[name="email"]');
  const messageInput = form.querySelector('textarea[name="message"]');
  const sourceInput = form.querySelector('input[name="sourceUrl"]');
  const status = widget.querySelector('[data-feedback-status]');
  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton.querySelector('span');
  let closeTimer;

  function openPanel() {
    window.clearTimeout(closeTimer);
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    window.setTimeout(() => (emailInput.value ? messageInput : emailInput).focus(), 80);
  }

  function closePanel() {
    panel.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    closeTimer = window.setTimeout(() => { panel.hidden = true; }, 180);
    launcher.focus();
  }

  launcher.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });
  closeButton.addEventListener('click', closePanel);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !widget.contains(event.target)) closePanel();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = '';
    status.classList.remove('is-success');
    if (!form.reportValidity()) return;

    sourceInput.value = `${window.location.pathname}${window.location.search}`;
    submitButton.disabled = true;
    submitLabel.textContent = 'Sending…';

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Feedback could not be sent.');

      messageInput.value = '';
      status.textContent = result.message || 'Thanks — your feedback has been sent.';
      status.classList.add('is-success');
    } catch (error) {
      status.textContent = error.message || 'Feedback could not be sent. Please try again.';
    } finally {
      submitButton.disabled = false;
      submitLabel.textContent = 'Send feedback';
    }
  });
}());
