(() => {
  'use strict';
  document.querySelectorAll('.render-pair img').forEach(image => {
    let errorPanel;
    const source = image.getAttribute('src');
    const clearError = () => {
      errorPanel?.remove();
      errorPanel = null;
      image.hidden = false;
    };
    const showError = () => {
      if (errorPanel) return;
      image.hidden = true;
      errorPanel = document.createElement('div');
      errorPanel.className = 'render-image-error';
      const message = document.createElement('span');
      message.setAttribute('role', 'status');
      message.textContent = 'Image unavailable';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.setAttribute('aria-label', `Retry ${image.alt}`);
      retry.addEventListener('click', () => {
        clearError();
        image.loading = 'eager';
        image.src = `${source}${source.includes('?') ? '&' : '?'}retry=${Date.now()}`;
      });
      errorPanel.append(message, retry);
      image.after(errorPanel);
    };
    image.addEventListener('error', showError);
    image.addEventListener('load', clearError);
    if (image.complete && !image.naturalWidth) showError();
  });
})();
