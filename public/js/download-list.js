(() => {
  'use strict';
  const trigger = document.querySelector('.nav-downloads-trigger');
  const panel = document.querySelector('.nav-downloads-panel');
  if (!trigger || !panel) return;
  document.body.append(panel);
  const content = panel.querySelector('.nav-downloads-content');
  const closeButton = panel.querySelector('.nav-downloads-close');
  let images = [];
  let loaded = false;
  let lastAddedId = null;
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function render() {
    if (!images.length) {
      content.innerHTML = '<div class="nav-downloads-empty"><strong>No rendered images yet</strong><p>Rendered images from the 3D editor will appear here.</p></div>';
      return;
    }
    content.innerHTML = `<ul class="nav-downloads-list">${images.map(image => {
      const date = image.createdAt ? new Date(image.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      return `<li class="nav-downloads-item ${image.id === lastAddedId ? 'is-new' : ''}" data-image-id="${escapeHtml(image.id)}"><img src="${escapeHtml(image.url)}" alt="" loading="lazy"><span class="nav-downloads-details"><strong title="${escapeHtml(image.name)}">${escapeHtml(image.name)}</strong><small>${image.id === lastAddedId ? 'Just added · ' : ''}${escapeHtml(date)}</small></span><a href="${escapeHtml(image.downloadUrl)}" download="${escapeHtml(image.name)}" aria-label="Download ${escapeHtml(image.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg><span>Download</span></a></li>`;
    }).join('')}</ul>`;
  }
  async function load() {
    content.innerHTML = '<div class="nav-downloads-empty">Loading downloads…</div>';
    try {
      const response = await fetch('/api/ai-render-export', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load downloads.');
      images = payload.images;
      loaded = true;
      render();
    } catch (error) {
      content.innerHTML = `<div class="nav-downloads-empty"><strong>Could not load downloads</strong><p>${escapeHtml(error.message)}</p><button type="button" class="nav-downloads-retry">Retry</button></div>`;
    }
  }
  function close() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus({ preventScroll: true }); }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (!loaded) load();
  });
  closeButton.addEventListener('click', close);
  content.addEventListener('click', event => { if (event.target.closest('.nav-downloads-retry')) load(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) close(); });

  function add(image, sourceElement) {
    lastAddedId = image.id;
    images = [image, ...images.filter(item => item.id !== image.id)].slice(0, 100);
    loaded = true;
    render();
    const dot = trigger.querySelector('.nav-downloads-dot');
    dot.hidden = false;
    trigger.classList.remove('nav-downloads-arrived');
    void trigger.offsetWidth;
    trigger.classList.add('nav-downloads-arrived');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !sourceElement) return;
    const start = sourceElement.getBoundingClientRect();
    const end = trigger.getBoundingClientRect();
    if (!start.width || !end.width) return;
    const flying = document.createElement('img');
    flying.className = 'nav-downloads-flying-image';
    flying.src = image.url;
    flying.alt = '';
    flying.style.left = `${start.left + start.width / 2 - 35}px`;
    flying.style.top = `${start.top + start.height / 2 - 35}px`;
    (sourceElement.closest('dialog[open]') || document.body).append(flying);
    const x = end.left + end.width / 2 - (start.left + start.width / 2);
    const y = end.top + end.height / 2 - (start.top + start.height / 2);
    flying.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${x}px, ${y}px) scale(.2)`, opacity: .25 }], { duration: 750, easing: 'cubic-bezier(.18,.74,.3,1)' }).finished.finally(() => flying.remove());
  }
  window.DownloadList = { add, open: () => trigger.click() };
})();
