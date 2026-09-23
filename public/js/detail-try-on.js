(() => {
  const dialog = document.getElementById('detailTryOnDialog');
  const frame = document.getElementById('detailTryOnFrame');
  if (!dialog || !frame) return;
  let returnFocus;
  let checkingAccess = false;
  const message = dialog.querySelector('[role="status"]');
  function trackTryOnEntry(eventName, parameters = {}) {
    window.trackEvent?.(eventName, { item_category: 'ai_try_on', ...parameters });
  }
  function close() {
    trackTryOnEntry('ai_tryon_editor_close');
    dialog.close();
  }
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('[data-ai-try-on-link]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (checkingAccess) return;
    trackTryOnEntry('ai_tryon_entry_click', { entry_id: link.id || undefined });
    checkingAccess = true;
    link.setAttribute('aria-busy', 'true');
    try {
      if (!(await window.UpgradeModal.requireTryOnAccess({ checkCredits: false }))) {
        trackTryOnEntry('ai_tryon_entry_access_blocked');
        return;
      }
    } catch (error) {
      returnFocus = link;
      dialog.classList.remove('is-ready');
      message.textContent = error.message;
      dialog.showModal();
      document.body.classList.add('detail-tryon-open');
      trackTryOnEntry('ai_tryon_entry_access_error', { failure_reason: 'access_check_failed' });
      return;
    } finally {
      checkingAccess = false;
      link.removeAttribute('aria-busy');
    }
    // Run after the designer's own click listener has persisted the current design.
    returnFocus = link;
    dialog.classList.remove('is-ready');
    message.textContent = 'Loading editor…';
    frame.src = link.href;
    dialog.showModal();
    document.body.classList.add('detail-tryon-open');
    trackTryOnEntry('ai_tryon_editor_open', { entry_id: link.id || undefined });
  });
  const resumeUrl = new URL(location.href);
  if (resumeUrl.searchParams.has('resumeTryOn')) {
    resumeUrl.searchParams.delete('resumeTryOn');
    history.replaceState(null, '', resumeUrl.pathname + resumeUrl.search + resumeUrl.hash);
    document.querySelector('[data-ai-try-on-link]')?.click();
  }
  frame.addEventListener('load', () => {
    const isEditor = Boolean(frame.contentDocument?.getElementById('aiTryOnApp'));
    dialog.classList.toggle('is-ready', isEditor);
    if (!isEditor) message.textContent = 'The editor could not be opened. Close and try again.';
    if (isEditor) frame.contentDocument.querySelector('.ai-tryon__close')?.focus();
    trackTryOnEntry(isEditor ? 'ai_tryon_editor_load_success' : 'ai_tryon_editor_load_error');
  });
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('close', () => {
    document.body.classList.remove('detail-tryon-open');
    returnFocus?.focus();
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'tryon:close') close();
  });
})();
