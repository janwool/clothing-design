(() => {
  const form = document.querySelector('[data-email-form]');
  if (!form) return;
  const result = document.querySelector('[data-email-result]');
  const button = form.querySelector('button[type="submit"]');
  const summary = form.querySelector('[data-recipient-summary]');
  const checkboxes = [...form.querySelectorAll('[name="userIds"]')];
  let requestId = crypto.randomUUID(), locked = false, attemptedPayload;
  const audience = () => form.querySelector('[name="audience"]:checked').value;
  function show(message, failed) {
    result.hidden = false; result.classList.toggle('is-error', failed); result.textContent = message;
  }
  function updateAudience() {
    const mode = audience();
    form.querySelectorAll('[data-audience-panel]').forEach(panel => { panel.hidden = panel.dataset.audiencePanel !== mode; });
    const selected = checkboxes.filter(input => input.checked).length;
    const manual = [...new Set(form.elements.addresses.value.split(/[\s,;]+/).filter(Boolean).map(value => value.toLowerCase()))].length;
    const count = mode === 'all' ? checkboxes.length : mode === 'selected' ? selected : manual;
    form.querySelector('[data-selected-count]').textContent = `${selected} selected`;
    summary.textContent = `${count} ${mode === 'all' ? 'registered users' : 'recipients'}`;
    button.textContent = mode === 'all' ? 'Send to all users' : 'Send email';
    button.disabled = locked || button.dataset.sendEnabled !== 'true' || !count;
  }
  form.addEventListener('change', updateAudience);
  form.elements.addresses.addEventListener('input', updateAudience);
  form.querySelector('[data-user-search]').addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    let visible = 0;
    form.querySelectorAll('[data-search-text]').forEach(row => { row.hidden = !row.dataset.searchText.includes(query); if (!row.hidden) visible++; });
    form.querySelector('[data-user-empty]').hidden = Boolean(visible);
  });
  form.querySelector('[data-select-visible]').addEventListener('click', () => { checkboxes.forEach(input => { if (!input.closest('[data-search-text]').hidden) input.checked = true; }); updateAudience(); });
  form.querySelector('[data-clear-selection]').addEventListener('click', () => { checkboxes.forEach(input => { input.checked = false; }); updateAudience(); });
  async function post(url, payload) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': form.dataset.csrf },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(45000)
    });
    const data = await response.json();
    if (response.ok) return data;
    const error = new Error(data.error || 'This message could not be submitted.');
    error.confirmedRejection = response.status < 500;
    throw error;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (locked) return;
    locked = true; button.disabled = true; button.textContent = 'Submitting…';
    // Retain immutable content after an ambiguous network response.
    attemptedPayload ||= { audience: audience(), subject: form.elements.subject.value, text: form.elements.text.value,
      replyTo: form.elements.replyTo.value, addresses: form.elements.addresses.value,
      userIds: checkboxes.filter(input => input.checked).map(input => Number(input.value)), requestId };
    try {
      const data = await post('/admin/email/campaigns', attemptedPayload);
      show(`Message queued for ${data.total} recipients. Sending continues automatically; refresh the history for progress.`, false);
      const link = document.createElement('a'); link.href = '/admin/email'; link.textContent = ' View sending history'; result.appendChild(link);
      form.reset(); requestId = crypto.randomUUID(); attemptedPayload = null;
    } catch (error) {
      show(error.name === 'TimeoutError' || error.name === 'TypeError' ? 'Submission could not be confirmed. Submit again to check the same saved message, or refresh sending history.' : error.message, true);
      if (error.confirmedRejection) attemptedPayload = null;
    } finally { locked = false; updateAudience(); }
  });
  document.querySelectorAll('[data-campaign-retry], [data-email-retry]').forEach(retry => {
    retry.addEventListener('click', async () => {
      retry.disabled = true; const previous = retry.textContent; retry.textContent = 'Retrying…';
      try {
        await post(retry.dataset.campaignRetry ? `/admin/email/campaigns/${encodeURIComponent(retry.dataset.campaignRetry)}/retry` : `/admin/email/${encodeURIComponent(retry.dataset.emailRetry)}/retry`, {});
        window.location.reload();
      } catch (error) { show(error.message, true); result.scrollIntoView({block:'center'}); retry.disabled = false; retry.textContent = previous; }
    });
  });
  updateAudience();
})();
