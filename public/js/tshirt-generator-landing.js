// Animate each visible content group once without hiding content before JS runs.
(() => {
  const root = document.querySelector('.tmg-landing');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!root || preference.matches || !window.IntersectionObserver) return;
  const targets = root.querySelectorAll([
    '.tmg-breadcrumb', '.tmg-hero-copy h1', '.tmg-hero-lede', '.tmg-actions > a',
    '.tmg-model-stage', '.tmg-model-tabs > button', '.tmg-preview-caption',
    '.tmg-section-heading h2', '.tmg-section-lede', '.tmg-blank-toolbar',
    '.tmg-card-content',
    '.tmg-related-grid > a', '.tmg-existing-links > a', '.tmg-faq-grid h2',
    '.tmg-faq-grid .tmg-text-link', '.tmg-faq-list details', '.tmg-empty',
    '.tmg-scene h2', '.tmg-scene figure', '.tmg-scene .tmg-text-link', '.tmg-audience-card > div',
    '.tmg-scene-swatches'
  ].join(','));
  // Animate inside the card so transforms cannot move its scroll-snap anchor.
  const counts = new Map();
  targets.forEach(element => {
    const section = element.closest('section');
    const index = counts.get(section) || 0;
    element.style.setProperty('--tmg-entry-delay', `${Math.min(index, 5) * 60}ms`);
    counts.set(section, index + 1);
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('tmg-entering');
      observer.unobserve(entry.target);
    });
  }, { threshold: .08 });
  targets.forEach(element => observer.observe(element));
  root.addEventListener('animationend', event => {
    if (event.animationName === 'tmg-enter') event.target.classList.remove('tmg-entering');
  });
  root.addEventListener('focusin', event => {
    event.target.closest('.tmg-entering')?.classList.remove('tmg-entering');
  });
  preference.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    targets.forEach(element => element.classList.remove('tmg-entering'));
  });
})();

(() => {
  const sample = document.querySelector('[data-tmg-scene-background]');
  if (!sample) return;
  const swatches = [...document.querySelectorAll('[data-tmg-scene-swatch]')];
  swatches.forEach(button => button.addEventListener('click', () => {
    const background = button.dataset.tmgSceneSwatch;
    sample.dataset.tmgSceneBackground = background;
    sample.style.backgroundColor = background === 'transparent' ? '' : background;
    swatches.forEach(swatch => swatch.setAttribute('aria-pressed', String(swatch === button)));
  }));
})();

// The catalog also works when no interactive hero is available.
(() => {
  document.querySelectorAll('[data-tmg-blank-gallery]').forEach(gallery => {
  const track = gallery.querySelector('[data-tmg-blank-track]');
  const cards = [...track.querySelectorAll('.tmg-fit-card')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function scroll(direction) {
    const step = cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    const amount = step * Math.max(1, Math.floor(track.clientWidth / step));
    track.scrollBy({ left: direction * amount, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }
  track.addEventListener('keydown', event => {
    if (event.target !== track) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') {
      track.scrollTo({ left: event.key === 'Home' ? 0 : track.scrollWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    } else scroll(event.key === 'ArrowRight' ? 1 : -1);
  });
  let inView = false;
  let hovered = false;
  let paused = reducedMotion.matches;
  let resumeAt = 0;
  gallery.addEventListener('mouseenter', () => { hovered = true; });
  gallery.addEventListener('mouseleave', () => { hovered = false; resumeAt = Date.now() + 1500; });
  function hold() { resumeAt = Date.now() + 6000; }
  gallery.addEventListener('pointerdown', hold, { passive: true });
  gallery.addEventListener('wheel', hold, { passive: true });
  gallery.addEventListener('keydown', hold);
  reducedMotion.addEventListener('change', event => { paused = event.matches; });
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; }, { threshold: .3 }).observe(track);
  window.setInterval(() => {
    if (!inView || hovered || paused || document.hidden || Date.now() < resumeAt || gallery.contains(document.activeElement)) return;
    const maximum = track.scrollWidth - track.clientWidth;
    if (maximum <= 2) return;
    const step = cards[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    track.scrollTo({ left: track.scrollLeft >= maximum - 2 ? 0 : Math.min(maximum, track.scrollLeft + step), behavior: 'smooth' });
  }, 3000);
  });
})();

(() => {
  const root = document.querySelector('[data-tmg-carousel]');
  if (!root) return;
  const stage = root.querySelector('.tmg-model-stage');
  const tabs = [...root.querySelectorAll('[data-tmg-model]')];
  const slides = [...root.querySelectorAll('[data-tmg-slide]')];
  const viewers = [...root.querySelectorAll('.tmg-model-viewer')];
  if (!stage || !tabs.length || viewers.length !== tabs.length) return;
  const loading = root.querySelector('[data-tmg-loading]');
  const failure = root.querySelector('[data-tmg-error]');
  const retry = root.querySelector('[data-tmg-retry]');
  const status = root.querySelector('[data-tmg-status]');
  const editorLinks = [...root.querySelectorAll('.tmg-editor-link')];
  const angles = [...root.querySelectorAll('[data-tmg-angle]')];
  const colors = [...root.querySelectorAll('[data-tmg-color]')];
  let activeIndex = 0;
  let color = root.dataset.color;
  let orbit = angles[0].dataset.tmgAngle;
  const timers = new Map();
  const cottonSurfaces = new WeakMap();

  async function applyCotton(viewer) {
    const model = viewer.model;
    if (!cottonSurfaces.has(model)) {
      const surface = (async () => {
        const [normal, roughness] = await Promise.all([
          viewer.createTexture('/materials-v2/cotton-jersey/normal.webp'),
          viewer.createTexture('/materials-v2/cotton-jersey/roughness.png')
        ]);
        model.materials.forEach(material => {
          const pbr = material.pbrMetallicRoughness;
          pbr.setMetallicFactor(0);
          pbr.setRoughnessFactor(0.86);
          material.normalTexture.setTexture(normal);
          material.normalTexture.setScale?.(0.32);
          pbr.metallicRoughnessTexture.setTexture(roughness);
          [material.normalTexture, pbr.metallicRoughnessTexture].forEach(slot => {
            slot.texture.sampler.setWrapS(10497);
            slot.texture.sampler.setWrapT(10497);
            slot.texture.sampler.setScale({ u: 7, v: 7 });
          });
          // Optional GLTF extensions are not present on every catalog garment.
          try { material.setSheenColorFactor([0.28, 0.28, 0.28]); material.setSheenRoughnessFactor(0.82); } catch {}
          try { material.setSpecularFactor(0.42); } catch {}
        });
      })();
      cottonSurfaces.set(model, surface);
      surface.catch(() => cottonSurfaces.delete(model));
    }
    await cottonSurfaces.get(model);
  }

  async function paint(viewer) {
    if (!viewer.model) return;
    try {
      await Promise.all(viewer.model.materials.map(material => material.ensureLoaded()));
      await applyCotton(viewer);
    const hex = parseInt(color.slice(1), 16);
    const factor = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, 1];
    viewer.model.materials.forEach(material => material.pbrMetallicRoughness?.setBaseColorFactor(factor));
    return true;
    } catch { settle(viewer, 'error'); return false; }
  }
  function syncState() {
    const state = viewers[activeIndex].dataset.loadState;
    stage.setAttribute('aria-busy', String(state === 'loading'));
    loading.hidden = state !== 'loading';
    failure.hidden = state !== 'error';
    colors.forEach(button => { button.disabled = state !== 'loaded'; });
    angles.forEach(button => { button.disabled = state !== 'loaded'; });
  }
  async function settle(viewer, state) {
    clearTimeout(timers.get(viewer));
    timers.delete(viewer);
    if (state === 'loaded' && !await paint(viewer)) return;
    viewer.dataset.loadState = state;
    const slide = slides[viewers.indexOf(viewer)];
    if (state === 'loaded') {
      viewer.cameraOrbit = orbit;
      slide.classList.add('is-ready');
    } else {
      slide.classList.remove('is-ready');
    }
    if (viewer === viewers[activeIndex]) syncState();
  }
  function begin(viewer, src = viewer.dataset.modelSrc) {
    if (viewer.loaded) return settle(viewer, 'loaded');
    if (viewer.dataset.loadState === 'loading') return;
    viewer.dataset.loadState = 'loading';
    // Hidden fits only start loading when selected. The first fit initializes immediately.
    viewer.loading = 'eager';
    if (!viewer.getAttribute('src')) viewer.setAttribute('src', src);
    clearTimeout(timers.get(viewer));
    timers.set(viewer, setTimeout(() => settle(viewer, 'error'), 45000));
  }
  function selectModel(index, focus = false) {
    activeIndex = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => {
      const active = i === activeIndex;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    slides.forEach((slide, i) => {
      const active = i === activeIndex;
      slide.dataset.position = active ? 'active' : 'hidden-next';
      slide.setAttribute('aria-hidden', String(!active));
      viewers[i].tabIndex = active ? 0 : -1;
    });
    const tab = tabs[activeIndex];
    editorLinks.forEach(link => { link.href = tab.dataset.href; });
    root.querySelector('[data-tmg-caption]').textContent = tab.dataset.title;
    const viewer = viewers[activeIndex];
    if (viewer.dataset.loadState !== 'error') begin(viewer);
    if (viewer.loaded) { paint(viewer); viewer.cameraOrbit = orbit; }
    syncState();
    if (focus) tab.focus();
  }
  viewers.forEach(viewer => {
    viewer.addEventListener('load', () => settle(viewer, 'loaded'));
    viewer.addEventListener('error', () => settle(viewer, 'error'));
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectModel(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectModel(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1), true);
    });
  });
  colors.forEach(button => button.addEventListener('click', () => {
    color = button.dataset.tmgColor;
    paint(viewers[activeIndex]);
    colors.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    status.textContent = `${button.dataset.colorName} preview. Set your final garment color in the editor.`;
  }));
  angles.forEach(button => button.addEventListener('click', () => {
    orbit = button.dataset.tmgAngle;
    viewers[activeIndex].cameraOrbit = orbit;
    viewers[activeIndex].jumpCameraToGoal?.();
    angles.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    status.textContent = `${button.textContent} view selected. Drag to inspect other angles.`;
  }));
  document.querySelector('[data-tmg-runtime]')?.addEventListener('error', () => settle(viewers[activeIndex], 'error'));
  retry.addEventListener('click', async () => {
    const viewer = viewers[activeIndex];
    const source = new URL(viewer.dataset.modelSrc, window.location.href);
    source.searchParams.set('preview-retry', String(Date.now()));
    viewer.removeAttribute('src');
    await viewer.updateComplete;
    viewer.dataset.loadState = '';
    begin(viewer, source.href);
    syncState();
    if (!customElements.get('model-viewer')) {
      try {
        await import(`/vendor/model-viewer/model-viewer.min.js?v=4.3.1&retry=${Date.now()}`);
      } catch (_) { settle(viewer, 'error'); }
    }
  });
  selectModel(0);
})();
