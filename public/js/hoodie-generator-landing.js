(() => {
  const root = document.querySelector('[data-hmg-carousel]');
  if (!root) return;

  const stage = root.querySelector('.hmg-model-stage');
  const slides = [...root.querySelectorAll('[data-hmg-slide]')];
  const viewers = [...root.querySelectorAll('.hmg-model-viewer')];
  const editorLinks = [...root.querySelectorAll('.hmg-editor-link')];
  const angleButtons = [...root.querySelectorAll('[data-hmg-orbit]')];
  const colorButtons = [...root.querySelectorAll('[data-hmg-color]')];
  const currentLabel = root.querySelector('[data-hmg-current]');
  const titleLabel = root.querySelector('[data-hmg-title]');
  const loadingIndicator = root.querySelector('[data-hmg-loading]');
  let activeIndex = 0;
  let activeColor = colorButtons.find(button => button.classList.contains('is-active'))?.dataset.hmgColor || '#e8e7e2';
  let activeOrbit = angleButtons.find(button => button.classList.contains('is-active'))?.dataset.hmgOrbit || '0deg 78deg 112%';

  if (!slides.length || slides.length !== viewers.length) return;

  const hexFactor = (hex) => {
    const value = Number.parseInt(String(hex).replace('#', ''), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
  };

  const applyColor = (viewer, color) => {
    (viewer.model?.materials || []).forEach(material => {
      material.pbrMetallicRoughness?.setBaseColorFactor?.(hexFactor(color));
    });
  };

  const slidePosition = (index) => {
    const distance = (index - activeIndex + slides.length) % slides.length;
    if (distance === 0) return 'active';
    if (distance === 1) return 'next';
    if (distance === slides.length - 1) return 'previous';
    return distance <= slides.length / 2 ? 'hidden-next' : 'hidden-previous';
  };

  const syncLoadingState = () => {
    const state = viewers[activeIndex].dataset.loadState;
    const loaded = state === 'loaded';
    stage?.setAttribute('aria-busy', String(!loaded));
    if (!loadingIndicator) return;
    loadingIndicator.hidden = loaded;
    loadingIndicator.classList.toggle('is-error', state === 'error');
    const label = loadingIndicator.querySelector('strong');
    if (label) label.textContent = state === 'error' ? '3D preview unavailable' : 'Loading 3D hoodie';
  };

  const selectModel = (index) => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.dataset.position = slidePosition(slideIndex);
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      viewers[slideIndex].tabIndex = active ? 0 : -1;
    });

    const activeSlide = slides[activeIndex];
    if (currentLabel) currentLabel.textContent = String(activeIndex + 1).padStart(2, '0');
    if (titleLabel) titleLabel.textContent = activeSlide.dataset.title;
    editorLinks.forEach(link => { link.href = activeSlide.dataset.href; });
    viewers[activeIndex].cameraOrbit = activeOrbit;
    viewers[activeIndex].jumpCameraToGoal?.();
    applyColor(viewers[activeIndex], activeColor);
    syncLoadingState();
  };

  root.querySelector('[data-hmg-prev]')?.addEventListener('click', () => selectModel(activeIndex - 1));
  root.querySelector('[data-hmg-next]')?.addEventListener('click', () => selectModel(activeIndex + 1));

  colorButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeColor = button.dataset.hmgColor;
      colorButtons.forEach(item => item.classList.toggle('is-active', item === button));
      applyColor(viewers[activeIndex], activeColor);
    });
  });

  angleButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeOrbit = button.dataset.hmgOrbit;
      angleButtons.forEach(item => item.classList.toggle('is-active', item === button));
      const viewer = viewers[activeIndex];
      viewer.cameraOrbit = activeOrbit;
      viewer.jumpCameraToGoal?.();
    });
  });

  viewers.forEach(viewer => {
    viewer.addEventListener('load', () => {
      viewer.dataset.loadState = 'loaded';
      applyColor(viewer, activeColor);
      if (viewers[activeIndex] === viewer) syncLoadingState();
    }, { once: true });
    viewer.addEventListener('error', () => {
      viewer.dataset.loadState = 'error';
      if (viewers[activeIndex] === viewer) syncLoadingState();
    }, { once: true });
  });

  syncLoadingState();
})();
