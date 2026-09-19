(() => {
  const page = document.querySelector('.dress-page');
  if (!page) return;

  const revealItems = page.querySelectorAll('.dress-reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -36px' });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  const stage = document.getElementById('dressModelStage');
  const viewer = document.getElementById('dressModelViewer');
  const loadButton = document.getElementById('dressLoadModel');
  const exportButton = document.getElementById('dressExportPreview');
  const status = document.getElementById('dressPreviewStatus');
  if (!stage || !viewer || !loadButton || !status) return;

  let readyPromise = null;
  const timeout = (promise, milliseconds) => Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), milliseconds))
  ]);

  const loadViewerLibrary = () => {
    if (customElements.get('model-viewer')) return Promise.resolve();
    const existing = document.querySelector('script[data-dress-model-viewer]');
    if (existing) {
      return timeout(new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }), 15000).then(() => customElements.whenDefined('model-viewer'));
    }

    return timeout(new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/vendor/model-viewer/model-viewer.min.js';
      script.dataset.dressModelViewer = 'true';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    }), 15000).then(() => customElements.whenDefined('model-viewer'));
  };

  const ensureReady = () => {
    if (viewer.loaded && customElements.get('model-viewer')) return Promise.resolve(viewer);
    if (readyPromise) return readyPromise;

    stage.classList.add('is-loading');
    stage.setAttribute('aria-busy', 'true');
    loadButton.querySelector('span').textContent = 'Loading 3D…';
    status.textContent = 'LOADING 3D';

    readyPromise = loadViewerLibrary()
      .then(() => {
        viewer.hidden = false;
        if (viewer.loaded) return;
        return timeout(new Promise((resolve, reject) => {
          viewer.addEventListener('load', resolve, { once: true });
          viewer.addEventListener('error', reject, { once: true });
          viewer.src = viewer.dataset.modelSrc;
        }), 45000);
      })
      .then(() => {
        stage.classList.remove('is-loading');
        stage.classList.add('is-ready');
        stage.setAttribute('aria-busy', 'false');
        status.textContent = 'INTERACTIVE 3D READY';
        window.trackEvent?.('dress_designer_3d_preview_load', {
          interaction_type: 'load_3d_preview',
          tool_name: 'dress-designer'
        });
        return viewer;
      })
      .catch((error) => {
        readyPromise = null;
        viewer.hidden = true;
        viewer.removeAttribute('src');
        stage.classList.remove('is-loading');
        stage.setAttribute('aria-busy', 'false');
        loadButton.querySelector('span').textContent = 'Try Live 3D Again';
        status.textContent = 'MODEL PREVIEW AVAILABLE';
        throw error;
      });
    return readyPromise;
  };

  const colorFactor = (hex) => {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
  };

  const materials = () => viewer.model?.materials || [];
  const applyColor = (hex) => {
    materials().forEach((material) => {
      material.pbrMetallicRoughness?.setBaseColorFactor?.(colorFactor(hex));
    });
  };

  const materialFinishes = {
    matte: { roughness: 0.9, metallic: 0 },
    satin: { roughness: 0.28, metallic: 0.04 },
    linen: { roughness: 1, metallic: 0 },
    twill: { roughness: 0.7, metallic: 0 }
  };

  const applyMaterial = (name) => {
    const finish = materialFinishes[name];
    if (!finish) return;
    materials().forEach((material) => {
      material.pbrMetallicRoughness?.setRoughnessFactor?.(finish.roughness);
      material.pbrMetallicRoughness?.setMetallicFactor?.(finish.metallic);
    });
  };

  const setActive = (button, selector) => {
    page.querySelectorAll(selector).forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  };

  const setOrbit = async (button, selector, orbit) => {
    setActive(button, selector);
    try {
      await ensureReady();
      viewer.cameraOrbit = orbit;
      viewer.jumpCameraToGoal?.();
      status.textContent = `${button.textContent.trim().toUpperCase()} VIEW`;
    } catch (_) {}
  };

  loadButton.addEventListener('click', () => ensureReady().catch(() => {}));

  page.querySelectorAll('.dress-swatch').forEach((button) => {
    button.addEventListener('click', async () => {
      setActive(button, '.dress-swatch');
      try {
        await ensureReady();
        applyColor(button.dataset.color);
        status.textContent = `${button.querySelector('small').textContent.toUpperCase()} SELECTED`;
      } catch (_) {}
    });
  });

  page.querySelectorAll('.dress-material-tabs button').forEach((button) => {
    button.addEventListener('click', async () => {
      setActive(button, '.dress-material-tabs button');
      try {
        await ensureReady();
        applyMaterial(button.dataset.material);
        status.textContent = `${button.textContent.trim().toUpperCase()} FINISH`;
      } catch (_) {}
    });
  });

  page.querySelectorAll('.dress-view-tabs button').forEach((button) => {
    button.addEventListener('click', () => setOrbit(button, '.dress-view-tabs button', button.dataset.orbit));
  });

  page.querySelectorAll('[data-hero-orbit]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setOrbit(button, '[data-hero-orbit]', button.dataset.heroOrbit);
    });
  });

  page.querySelectorAll('.dress-light-tabs button').forEach((button) => {
    button.addEventListener('click', async () => {
      setActive(button, '.dress-light-tabs button');
      try {
        await ensureReady();
        viewer.exposure = Number(button.dataset.exposure);
        viewer.setAttribute('shadow-intensity', button.dataset.shadow);
        status.textContent = `${button.textContent.trim().toUpperCase()} LIGHTING`;
      } catch (_) {}
    });
  });

  exportButton?.addEventListener('click', async () => {
    const originalText = exportButton.firstChild.textContent;
    exportButton.firstChild.textContent = 'Preparing PNG ';
    try {
      await ensureReady();
      const link = document.createElement('a');
      link.download = 'clozdesign-3d-dress-mockup.png';
      link.href = await viewer.toDataURL('image/png');
      link.click();
      status.textContent = 'PNG EXPORTED';
    } catch (_) {
      status.textContent = 'OPEN FULL EDITOR TO EXPORT';
    } finally {
      exportButton.firstChild.textContent = originalText;
    }
  });
})();
