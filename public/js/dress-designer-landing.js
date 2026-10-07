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
  const timeout = (promise, milliseconds) => {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('timeout')), milliseconds); })
    ]).finally(() => window.clearTimeout(timer));
  };

  const waitForLoad = (element, milliseconds, start = () => {}) => new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener('load', onLoad);
      element.removeEventListener('error', onError);
    };
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('3D preview unavailable')); };
    const timer = window.setTimeout(onError, milliseconds);
    element.addEventListener('load', onLoad);
    element.addEventListener('error', onError);
    try { start(); } catch (error) { cleanup(); reject(error); }
  });

  const loadViewerLibrary = () => {
    // Configure the bundled decoder before a compressed garment starts loading.
    window.ModelViewerElement = window.ModelViewerElement || {};
    window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0';
    const viewerClass = customElements.get('model-viewer');
    if (viewerClass) {
      viewerClass.meshoptDecoderLocation = window.ModelViewerElement.meshoptDecoderLocation;
      return Promise.resolve();
    }
    let script = document.querySelector('script[data-dress-model-viewer]');
    const existing = Boolean(script);
    if (!script) {
      script = document.createElement('script');
      script.type = 'module';
      script.src = '/vendor/model-viewer/model-viewer.min.js?v=4.3.1';
      script.dataset.dressModelViewer = 'true';
    }
    return waitForLoad(script, 15000, () => {
      if (!existing) document.head.appendChild(script);
    }).then(() => timeout(customElements.whenDefined('model-viewer'), 5000))
      .catch((error) => { script.remove(); throw error; });
  };

  const ensureReady = () => {
    if (viewer.loaded && customElements.get('model-viewer')) return Promise.resolve(viewer);
    if (readyPromise) return readyPromise;

    stage.classList.add('is-loading');
    stage.setAttribute('aria-busy', 'true');
    loadButton.hidden = true;
    status.textContent = 'Loading preview…';

    readyPromise = loadViewerLibrary()
      .then(() => {
        viewer.hidden = false;
        if (viewer.loaded) return;
        return waitForLoad(viewer, 45000, () => {
          if (!viewer.dataset.modelSrc) throw new Error('Dress model unavailable');
          viewer.src = viewer.dataset.modelSrc;
        });
      })
      .then(() => {
        stage.classList.remove('is-loading');
        stage.classList.add('is-ready');
        stage.setAttribute('aria-busy', 'false');
        applyColor(page.querySelector('.dress-swatch.active')?.dataset.color || '#852c36');
        applyMaterial(page.querySelector('.dress-material-tabs button.active')?.dataset.material || 'matte');
        status.textContent = 'Drag to rotate';
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
        stage.classList.remove('is-loading', 'is-ready');
        stage.setAttribute('aria-busy', 'false');
        loadButton.hidden = false;
        status.textContent = 'Preview couldn’t load. Please retry.';
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
  ensureReady().catch(() => {});
})();
