(() => {
  const dialog = document.getElementById('detailTryOnDialog');
  const workspace = dialog?.querySelector('#aiTryOnApp');
  if (!dialog || !workspace) return;
  let returnFocus;
  let checkingAccess = false;
  const message = dialog.querySelector('.detail-tryon-message');
  function trackTryOnEntry(eventName, parameters = {}) {
    window.trackEvent?.(eventName, { item_category: 'ai_try_on', ...parameters });
  }
  document.addEventListener('click', async event => {
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
      returnFocus = link;
      workspace.dataset.projectId = new URL(link.href, location.origin).searchParams.get('project') || '';
      dialog.classList.add('is-ready');
      dialog.showModal();
      document.body.classList.add('detail-tryon-open');
      trackTryOnEntry('ai_tryon_editor_open', { entry_id: link.id || undefined });
      // Paint the existing workspace before initializing the garment scene.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!dialog.open) return;
        window.ModelViewerElement = window.ModelViewerElement || {};
        window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0';
        import('/vendor/model-viewer/model-viewer.min.js?v=4.3.1').catch(() => {
          const error = workspace.querySelector('#tryOnError');
          error.textContent = 'Garment preview could not be loaded. Close and try again.';
          error.hidden = false;
          trackTryOnEntry('ai_tryon_editor_load_error');
        });
        window.initializeAiTryOn();
        trackTryOnEntry('ai_tryon_editor_load_success');
      }));
    } catch (error) {
      returnFocus = link;
      dialog.classList.remove('is-ready');
      message.textContent = error.message;
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('detail-tryon-open');
      trackTryOnEntry('ai_tryon_entry_access_error', { failure_reason: 'access_check_failed' });
    } finally {
      checkingAccess = false;
      link.removeAttribute('aria-busy');
    }
  });
  dialog.querySelector('.detail-tryon-loading-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    trackTryOnEntry('ai_tryon_editor_close');
    document.body.classList.remove('detail-tryon-open');
    returnFocus?.focus();
  });
  const resumeUrl = new URL(location.href);
  if (resumeUrl.searchParams.has('resumeTryOn')) {
    resumeUrl.searchParams.delete('resumeTryOn');
    history.replaceState(null, '', resumeUrl.pathname + resumeUrl.search + resumeUrl.hash);
    document.querySelector('[data-ai-try-on-link]')?.click();
  }
})();
