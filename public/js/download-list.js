(() => {
  'use strict';
  const trigger = document.querySelector('.nav-downloads-trigger');
  const panel = document.querySelector('.nav-downloads-panel');
  if (!trigger || !panel) return;
  document.body.append(panel);
  const content = panel.querySelector('.nav-downloads-content');
  const tasks = new Map();
  const recent = new Map();
  let images = [], loaded = false, loading = false, lastAddedId = null;
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function render() {
    const active = [...tasks.values()].reverse();
    const saved = [...recent.values(), ...images].filter((image, index, all) => all.findIndex(item => item.id === image.id) === index).slice(0, 100);
    if (!active.length && !saved.length) {
      content.innerHTML = loading ? '<div class="nav-downloads-empty">Loading downloads…</div>' : '<div class="nav-downloads-empty"><strong>No rendered images yet</strong><p>Rendered images from the 3D editor will appear here.</p></div>';
      return;
    }
    content.innerHTML = `<ul class="nav-downloads-list">${active.map(task => `
      <li class="nav-downloads-item nav-downloads-task ${task.status === 'failed' ? 'is-failed' : 'is-rendering'}" data-task-id="${escapeHtml(task.id)}">
        <img src="${escapeHtml(task.thumbnail)}" alt="" loading="lazy">
        <span class="nav-downloads-details"><strong>${task.status === 'failed' ? 'Rendering failed' : 'Rendering image…'}</strong>
          <small>${task.status === 'failed' ? escapeHtml(task.error || 'Please try again.') : 'You can keep designing while this finishes.'}</small>
          ${task.status === 'failed' ? '' : '<span class="nav-downloads-progress" role="progressbar" aria-label="Rendering image" aria-valuetext="Rendering in progress"><i></i></span>'}
        </span>
        ${task.status === 'failed' ? '<button type="button" class="nav-downloads-retry" data-retry-task>Retry</button>' : '<span class="nav-downloads-spinner" aria-hidden="true"></span>'}
      </li>`).join('')}${saved.map(image => {
      const date = image.createdAt ? new Date(image.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      return `<li class="nav-downloads-item ${image.id === lastAddedId ? 'is-new' : ''}" data-image-id="${escapeHtml(image.id)}"><img src="${escapeHtml(image.url)}" alt="" loading="lazy"><span class="nav-downloads-details"><strong title="${escapeHtml(image.name)}">${escapeHtml(image.name)}</strong><small>${image.id === lastAddedId ? 'Ready · ' : ''}${escapeHtml(date)}</small></span><a href="${escapeHtml(image.downloadUrl)}" download="${escapeHtml(image.name)}" aria-label="Download ${escapeHtml(image.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg><span>Download</span></a></li>`;
    }).join('')}</ul>`;
  }
  async function load() {
    if (loading) return;
    loading = true;
    render();
    try {
      const response = await fetch('/api/ai-render-export', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load downloads.');
      images = payload.images;
      loaded = true;
    } catch (error) {
      if (!tasks.size && !images.length) content.innerHTML = `<div class="nav-downloads-empty"><strong>Could not load downloads</strong><p>${escapeHtml(error.message)}</p><button type="button" class="nav-downloads-retry" data-reload>Retry</button></div>`;
      return;
    } finally { loading = false; }
    render();
  }
  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.querySelector('.nav-downloads-dot').hidden = true;
    if (!loaded) load();
  }
  function close() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus({ preventScroll: true }); }
  trigger.addEventListener('click', () => panel.hidden ? open() : close());
  panel.querySelector('.nav-downloads-close').addEventListener('click', close);
  content.addEventListener('click', event => {
    if (event.target.closest('[data-reload]')) load();
    const retry = event.target.closest('[data-retry-task]');
    if (retry) execute(tasks.get(retry.closest('[data-task-id]')?.dataset.taskId));
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) close(); });

  function startDownload(image) {
    const link = document.createElement('a');
    link.href = image.downloadUrl;
    link.download = image.name;
    link.hidden = true;
    (document.querySelector('dialog[open]') || document.body).append(link);
    link.click();
    setTimeout(() => link.remove(), 60000);
  }
  function pulse() {
    trigger.querySelector('.nav-downloads-dot').hidden = !panel.hidden;
    trigger.classList.remove('nav-downloads-arrived');
    void trigger.offsetWidth;
    trigger.classList.add('nav-downloads-arrived');
  }
  async function execute(task) {
    if (!task || task.status === 'rendering') return;
    task.status = 'rendering';
    task.error = '';
    render();
    try {
      const image = await task.run();
      tasks.delete(task.id);
      if (task.thumbnail?.startsWith('blob:')) URL.revokeObjectURL(task.thumbnail);
      recent.set(image.id, image);
      lastAddedId = image.id;
      render();
      pulse();
      try { startDownload(image); }
      catch (error) { console.error('Automatic download could not start:', error); }
      task.onSettled?.('complete');
    } catch (error) {
      task.status = 'failed';
      task.error = error.message || 'Please try again.';
      render();
      pulse();
      task.onSettled?.('failed');
    }
  }
  function start({ id, thumbnail, run, onSettled }) {
    const task = { id, thumbnail, run, onSettled, status: 'queued', error: '' };
    tasks.set(id, task);
    render();
    pulse();
    execute(task);
    return id;
  }
  function reveal(id, sourceElement) {
    const task = tasks.get(id);
    if (!task) { open(); return; }
    const start = sourceElement?.getBoundingClientRect();
    const end = trigger.getBoundingClientRect();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !start?.width || !end.width) { open(); return; }
    const flying = document.createElement('img');
    flying.className = 'nav-downloads-flying-image';
    flying.src = task.thumbnail;
    flying.alt = '';
    flying.style.left = `${start.left + start.width / 2 - 35}px`;
    flying.style.top = `${start.top + start.height / 2 - 35}px`;
    document.body.append(flying);
    const x = end.left + end.width / 2 - (start.left + start.width / 2);
    const y = end.top + end.height / 2 - (start.top + start.height / 2);
    flying.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${x}px, ${y}px) scale(.22)`, opacity: .2 }], { duration: 620, easing: 'cubic-bezier(.18,.74,.3,1)' }).finished.catch(() => {}).finally(() => { flying.remove(); open(); });
  }
  window.DownloadList = { start, reveal, open, status: id => tasks.get(id)?.status || 'complete' };
})();
