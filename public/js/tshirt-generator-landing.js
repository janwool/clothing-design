(() => {
  const root = document.querySelector('[data-tmg-carousel]');
  if (!root) return;

  const stage = root.querySelector('.tmg-model-stage');
  const tabs = [...root.querySelectorAll('[data-tmg-model]')];
  const slides = [...root.querySelectorAll('[data-tmg-slide]')];
  const viewers = [...root.querySelectorAll('.tmg-model-viewer')];
  const currentLabel = root.querySelector('[data-tmg-current]');
  const loadingIndicator = root.querySelector('[data-tmg-loading]');
  const editorLinks = [...root.querySelectorAll('.tmg-editor-link')];
  let activeIndex = 0;

  if (!tabs.length || slides.length !== tabs.length || viewers.length !== tabs.length) return;

  const modelAt = index => tabs[(index + tabs.length) % tabs.length];

  function syncActiveLoadingState() {
    const state = viewers[activeIndex].dataset.loadState;
    const isLoaded = state === 'loaded';
    stage.setAttribute('aria-busy', String(!isLoaded));
    if (!loadingIndicator) return;
    loadingIndicator.hidden = isLoaded;
    loadingIndicator.classList.toggle('is-error', state === 'error');
    const label = loadingIndicator.querySelector('strong');
    if (label) label.textContent = state === 'error' ? '3D preview unavailable' : 'Loading 3D';
  }

  function slidePosition(index) {
    const forwardDistance = (index - activeIndex + slides.length) % slides.length;
    if (forwardDistance === 0) return 'active';
    if (forwardDistance === 1) return 'next';
    if (forwardDistance === slides.length - 1) return 'previous';
    return forwardDistance <= slides.length / 2 ? 'hidden-next' : 'hidden-previous';
  }

  function selectModel(index, focusTab = false) {
    activeIndex = (index + tabs.length) % tabs.length;
    const activeTab = modelAt(activeIndex);

    tabs.forEach((tab, tabIndex) => {
      const isActive = tabIndex === activeIndex;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === activeIndex;
      slide.dataset.position = slidePosition(slideIndex);
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', String(!isActive));
      viewers[slideIndex].tabIndex = isActive ? 0 : -1;
    });

    currentLabel.textContent = String(activeIndex + 1).padStart(2, '0');
    editorLinks.forEach(link => { link.href = activeTab.dataset.href; });
    syncActiveLoadingState();

    if (focusTab) activeTab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectModel(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') selectModel(0, true);
      else if (event.key === 'End') selectModel(tabs.length - 1, true);
      else selectModel(index + (event.key === 'ArrowRight' ? 1 : -1), true);
    });
  });

  root.querySelector('[data-tmg-prev]')?.addEventListener('click', () => selectModel(activeIndex - 1));
  root.querySelector('[data-tmg-next]')?.addEventListener('click', () => selectModel(activeIndex + 1));

  const settledViewers = new Set();
  const markViewerSettled = (viewer, state) => {
    viewer.dataset.loadState = state;
    settledViewers.add(viewer);
    if (settledViewers.size === viewers.length) root.dataset.allModelsLoaded = 'true';
    if (viewers[activeIndex] === viewer) syncActiveLoadingState();
  };

  viewers.forEach(viewer => {
    viewer.addEventListener('load', () => markViewerSettled(viewer, 'loaded'), { once: true });
    viewer.addEventListener('error', () => markViewerSettled(viewer, 'error'), { once: true });
  });

  syncActiveLoadingState();
})();
