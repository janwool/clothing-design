(() => {
  const viewer = document.getElementById('pantsViewer');
  if (!viewer) return;
  const stage = document.querySelector('.pg-stage');
  const poster = document.querySelector('.pg-poster');
  const status = document.querySelector('[data-pg-status]');
  const retry = document.querySelector('.pg-retry');
  const colorButtons = [...document.querySelectorAll('[data-pg-color]')];
  const angleButtons = [...document.querySelectorAll('[data-pg-angle]')];
  const models = [...document.querySelectorAll('[data-pg-model]')];
  const originalBaseColors = new WeakMap();
  const baseColor = colorButtons[0].dataset.pgColor;
  let color = colorButtons[0].dataset.pgColor;
  let angle = 0;
  let timer;
  const fail = () => {
    clearTimeout(timer);
    stage.classList.remove('is-ready');
    stage.setAttribute('aria-busy', 'false');
    retry.hidden = false;
    status.textContent = 'Preview unavailable. Try again or open the editor.';
  };
  const begin = () => {
    clearTimeout(timer);
    retry.hidden = true;
    stage.classList.remove('is-ready');
    stage.setAttribute('aria-busy', 'true');
    status.textContent = 'Preparing preview…';
    timer = setTimeout(fail, 45000);
  };
  const applyColor = () => {
    if (!viewer.loaded) return;
    const n = parseInt(color.slice(1), 16);
    const rgba = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1];
    for (const material of viewer.model?.materials || []) {
      const pbr = material.pbrMetallicRoughness;
      if (!pbr?.setBaseColorFactor) continue;
      if (!originalBaseColors.has(material)) originalBaseColors.set(material, [...(pbr.baseColorFactor || [1, 1, 1, 1])]);
      pbr.setBaseColorFactor(color === baseColor ? originalBaseColors.get(material) : rgba);
    }
  };
  const ready = () => {
    clearTimeout(timer);
    retry.hidden = true;
    stage.classList.add('is-ready');
    stage.setAttribute('aria-busy', 'false');
    applyColor();
    viewer.cameraOrbit = `${angle}deg 78deg 112%`;
    status.textContent = 'Drag to explore your fit.';
  };
  viewer.addEventListener('load', ready);
  viewer.addEventListener('error', fail);
  begin();
  if (viewer.loaded) ready();
  retry.addEventListener('click', () => {
    // A full reload also recovers a failed viewer-module request.
    window.location.reload();
  });
  colorButtons.forEach(button => button.addEventListener('click', () => {
    color = button.dataset.pgColor;
    colorButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    applyColor();
    if (viewer.loaded) status.textContent = `${button.getAttribute('aria-label')} selected.`;
  }));
  angleButtons.forEach(button => button.addEventListener('click', () => {
    angle = Number(button.dataset.pgAngle);
    angleButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    viewer.cameraOrbit = `${angle}deg 78deg 112%`;
    viewer.jumpCameraToGoal?.();
    if (viewer.loaded) status.textContent = `${button.textContent} view.`;
  }));
  models.forEach(button => button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') {
      document.getElementById('pants-studio').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'});
      return;
    }
    begin();
    models.forEach(item => {
      const selected = item === button;
      item.setAttribute('aria-pressed', String(selected));
      item.closest('.pg-model-card').classList.toggle('is-selected', selected);
      item.querySelector('.pg-selected-tag').textContent = selected ? 'Selected' : 'Preview in 3D';
    });
    poster.src = button.dataset.image;
    poster.alt = button.dataset.title;
    viewer.alt = `${button.dataset.title} interactive preview`;
    document.querySelector('[data-pg-title]').textContent = button.dataset.title;
    document.querySelectorAll('[data-pg-editor]').forEach(link => { link.href = button.dataset.href; });
    viewer.src = button.dataset.src;
    document.getElementById('pants-studio').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'});
  }));
})();
