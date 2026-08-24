(function initializeOnModelMockup() {
  'use strict';

  const modal = document.getElementById('modelMockupModal');
  if (!modal) return;

  const canvas = document.getElementById('modelMockupCanvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const artworkInput = document.getElementById('modelMockupArtworkInput');
  const uploadZone = document.getElementById('modelMockupUploadZone');
  const uploadLabel = document.getElementById('modelMockupUploadLabel');
  const emptyState = document.getElementById('modelMockupEmpty');
  const loadingState = document.getElementById('modelMockupLoading');
  const status = document.getElementById('modelMockupStatus');
  const downloadButton = document.getElementById('modelMockupDownload');
  const mapButtons = [...modal.querySelectorAll('[data-map-view]')];
  const launchButtons = [
    document.getElementById('modelMockupBtn'),
    document.getElementById('designModelMockupBtn')
  ].filter(Boolean);
  const closeButton = document.getElementById('modelMockupClose');
  const resetButton = document.getElementById('modelMockupReset');
  const centerButton = document.getElementById('modelMockupCenter');
  const emptyUploadButton = document.getElementById('modelMockupEmptyUpload');

  const controls = {
    scale: document.getElementById('modelMockupScale'),
    x: document.getElementById('modelMockupX'),
    y: document.getElementById('modelMockupY'),
    rotation: document.getElementById('modelMockupRotation'),
    warp: document.getElementById('modelMockupWarp'),
    opacity: document.getElementById('modelMockupOpacity')
  };

  const assetUrls = {
    base: modal.dataset.baseImage,
    mask: modal.dataset.maskImage,
    depth: modal.dataset.depthImage
  };

  const template = {
    garmentType: modal.dataset.garmentType || 'garment',
    exportSlug: modal.dataset.exportSlug || 'garment',
    centerX: Number(modal.dataset.artworkCenterX) || canvas.width / 2,
    centerY: Number(modal.dataset.artworkCenterY) || canvas.height * 0.47,
    baseWidth: Number(modal.dataset.artworkBaseWidth) || 620,
    maxHeight: Number(modal.dataset.artworkMaxHeight) || 650,
    renderLeft: Number(modal.dataset.renderLeft) || 0,
    renderTop: Number(modal.dataset.renderTop) || 0,
    renderRight: Number(modal.dataset.renderRight) || canvas.width,
    renderBottom: Number(modal.dataset.renderBottom) || canvas.height,
    defaultScale: Number(modal.dataset.defaultScale) || 54,
    defaultWarp: Number(modal.dataset.defaultWarp) || 42
  };

  const state = {
    ready: false,
    loading: false,
    rendering: false,
    renderQueued: false,
    mapView: 'result',
    baseImage: null,
    maskImage: null,
    depthImage: null,
    maskPixels: null,
    depthPixels: null,
    artworkImage: null,
    artworkName: '',
    returnFocus: null
  };

  const artworkCanvas = document.createElement('canvas');
  const warpedCanvas = document.createElement('canvas');
  const mapCanvas = document.createElement('canvas');
  [artworkCanvas, warpedCanvas, mapCanvas].forEach((item) => {
    item.width = canvas.width;
    item.height = canvas.height;
  });
  const artworkContext = artworkCanvas.getContext('2d', { willReadFrequently: true });
  const warpedContext = warpedCanvas.getContext('2d');
  const mapContext = mapCanvas.getContext('2d', { willReadFrequently: true });

  function setStatus(message, type) {
    status.textContent = message || '';
    status.classList.toggle('is-ready', type === 'ready');
    status.classList.toggle('is-error', type === 'error');
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load mockup asset: ${url}`));
      image.src = url;
    });
  }

  function readMapPixels(image) {
    mapContext.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapContext.drawImage(image, 0, 0, mapCanvas.width, mapCanvas.height);
    return mapContext.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
  }

  async function ensureAssets() {
    if (state.ready || state.loading) return;
    state.loading = true;
    loadingState.hidden = false;
    setStatus('Loading garment mask and fold depth data…');

    try {
      const [baseImage, maskImage, depthImage] = await Promise.all([
        loadImage(assetUrls.base),
        loadImage(assetUrls.mask),
        loadImage(assetUrls.depth)
      ]);
      state.baseImage = baseImage;
      state.maskImage = maskImage;
      state.depthImage = depthImage;
      state.maskPixels = readMapPixels(maskImage);
      state.depthPixels = readMapPixels(depthImage);
      state.ready = true;
      setStatus('Garment maps ready. Upload artwork to begin.', 'ready');
      scheduleRender();
    } catch (error) {
      console.error(error);
      setStatus('The garment maps could not be loaded. Please refresh and try again.', 'error');
    } finally {
      state.loading = false;
      loadingState.hidden = true;
    }
  }

  function updateControlOutput(controlKey) {
    const input = controls[controlKey];
    const output = input?.closest('label')?.querySelector('output');
    if (!input || !output) return;
    const suffix = ['scale', 'warp', 'opacity'].includes(controlKey)
      ? '%'
      : controlKey === 'rotation'
        ? '°'
        : '';
    output.value = `${input.value}${suffix}`;
  }

  function drawTechnicalMap() {
    context.fillStyle = '#858585';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (state.mapView === 'mask') {
      context.drawImage(state.maskImage, 0, 0, canvas.width, canvas.height);
    } else {
      context.drawImage(state.depthImage, 0, 0, canvas.width, canvas.height);
    }
  }

  function drawArtworkLayer() {
    artworkContext.clearRect(0, 0, artworkCanvas.width, artworkCanvas.height);
    if (!state.artworkImage) return null;

    const scale = Number(controls.scale.value) / 100;
    const targetWidth = template.baseWidth * scale;
    const aspectRatio = state.artworkImage.naturalHeight / Math.max(1, state.artworkImage.naturalWidth);
    const targetHeight = Math.min(template.maxHeight, targetWidth * aspectRatio);
    const centerX = template.centerX + Number(controls.x.value) * 2.35;
    const centerY = template.centerY + Number(controls.y.value) * 2.75;
    const rotation = Number(controls.rotation.value) * Math.PI / 180;

    artworkContext.save();
    artworkContext.translate(centerX, centerY);
    artworkContext.rotate(rotation);
    artworkContext.imageSmoothingEnabled = true;
    artworkContext.imageSmoothingQuality = 'high';
    artworkContext.drawImage(
      state.artworkImage,
      -targetWidth / 2,
      -targetHeight / 2,
      targetWidth,
      targetHeight
    );
    artworkContext.restore();
    return artworkContext.getImageData(0, 0, artworkCanvas.width, artworkCanvas.height);
  }

  function warpArtwork(sourceImageData) {
    const width = canvas.width;
    const height = canvas.height;
    const source = sourceImageData.data;
    const output = new ImageData(width, height);
    const outputPixels = output.data;
    const maskPixels = state.maskPixels;
    const depthPixels = state.depthPixels;
    const warpStrength = Number(controls.warp.value) / 100;
    const opacity = Number(controls.opacity.value) / 100;
    const xStart = Math.max(0, template.renderLeft);
    const xEnd = Math.min(width, template.renderRight);
    const yStart = Math.max(0, template.renderTop);
    const yEnd = Math.min(height, template.renderBottom);

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const pixelIndex = (y * width + x) * 4;
        const maskAlpha = maskPixels[pixelIndex] / 255;
        if (maskAlpha <= 0.004) continue;

        const leftIndex = (y * width + Math.max(0, x - 2)) * 4;
        const rightIndex = (y * width + Math.min(width - 1, x + 2)) * 4;
        const upperIndex = (Math.max(0, y - 2) * width + x) * 4;
        const lowerIndex = (Math.min(height - 1, y + 2) * width + x) * 4;
        const gradientX = depthPixels[rightIndex] - depthPixels[leftIndex];
        const gradientY = depthPixels[lowerIndex] - depthPixels[upperIndex];
        const sourceX = Math.round(x + gradientX * warpStrength * 0.82);
        const sourceY = Math.round(y + gradientY * warpStrength * 0.58);
        if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue;

        const sourceIndex = (sourceY * width + sourceX) * 4;
        const sourceAlpha = source[sourceIndex + 3] / 255;
        if (sourceAlpha <= 0.004) continue;

        outputPixels[pixelIndex] = source[sourceIndex];
        outputPixels[pixelIndex + 1] = source[sourceIndex + 1];
        outputPixels[pixelIndex + 2] = source[sourceIndex + 2];
        outputPixels[pixelIndex + 3] = Math.round(255 * sourceAlpha * maskAlpha * opacity);
      }
    }

    warpedContext.clearRect(0, 0, warpedCanvas.width, warpedCanvas.height);
    warpedContext.putImageData(output, 0, 0);
  }

  function render() {
    state.renderQueued = false;
    if (!state.ready || state.rendering) return;
    state.rendering = true;

    try {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (state.mapView !== 'result') {
        drawTechnicalMap();
        return;
      }

      context.drawImage(state.baseImage, 0, 0, canvas.width, canvas.height);
      const artworkImageData = drawArtworkLayer();
      if (artworkImageData) {
        warpArtwork(artworkImageData);
        context.save();
        context.globalCompositeOperation = 'multiply';
        context.drawImage(warpedCanvas, 0, 0);
        context.restore();
      }
    } finally {
      state.rendering = false;
    }
  }

  function scheduleRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(render);
  }

  function setMapView(view) {
    state.mapView = view;
    mapButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.mapView === view);
    });
    scheduleRender();
  }

  function setArtworkImage(image, name) {
    state.artworkImage = image;
    state.artworkName = name || 'artwork';
    uploadLabel.textContent = name || 'Artwork loaded';
    uploadZone.classList.add('has-artwork');
    emptyState.hidden = true;
    downloadButton.disabled = false;
    setMapView('result');
    setStatus(`Artwork mapped to the ${template.garmentType.replace(/-/g, ' ')} silhouette and folds.`, 'ready');
    scheduleRender();
  }

  function loadArtworkDataUrl(dataUrl, name) {
    return loadImage(dataUrl).then((image) => {
      setArtworkImage(image, name);
      return image;
    });
  }

  function handleArtworkFile(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setStatus('Choose a PNG, JPG, or WebP image.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('Artwork must be smaller than 10 MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      loadArtworkDataUrl(reader.result, file.name).catch((error) => {
        console.error(error);
        setStatus('The artwork image could not be opened.', 'error');
      });
    };
    reader.onerror = () => setStatus('The artwork file could not be read.', 'error');
    reader.readAsDataURL(file);
  }

  function resetPlacement() {
    const defaults = {
      scale: template.defaultScale,
      x: 0,
      y: 0,
      rotation: 0,
      warp: template.defaultWarp,
      opacity: 96
    };
    Object.entries(defaults).forEach(([key, value]) => {
      controls[key].value = String(value);
      updateControlOutput(key);
    });
    setMapView('result');
    scheduleRender();
  }

  function centerArtwork() {
    ['x', 'y', 'rotation'].forEach((key) => {
      controls[key].value = '0';
      updateControlOutput(key);
    });
    scheduleRender();
  }

  function openModal() {
    state.returnFocus = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeButton.focus({ preventScroll: true });
    ensureAssets();
    window.trackEvent?.('begin_design', {
      design_entry: 'on_model_mockup',
      item_id: window.location.pathname
    });
  }

  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    const designModalOpen = document.getElementById('designModal')?.classList.contains('active');
    document.body.style.overflow = designModalOpen ? 'hidden' : '';
    state.returnFocus?.focus?.({ preventScroll: true });
  }

  function downloadMockup() {
    if (!state.ready || !state.artworkImage) return;
    const previousView = state.mapView;
    state.mapView = 'result';
    render();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      const safeName = state.artworkName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'artwork';
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${safeName}-on-model-${template.exportSlug}-mockup.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setStatus(`Mockup downloaded as a ${canvas.width} × ${canvas.height} PNG.`, 'ready');
      window.trackEvent?.('design_export', {
        export_format: 'png',
        export_type: 'on_model_mockup',
        item_id: window.location.pathname
      });
      state.mapView = previousView;
      mapButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.mapView === previousView);
      });
      scheduleRender();
    }, 'image/png');
  }

  Object.entries(controls).forEach(([key, input]) => {
    updateControlOutput(key);
    input.addEventListener('input', () => {
      updateControlOutput(key);
      scheduleRender();
    });
  });

  launchButtons.forEach((button) => button.addEventListener('click', openModal));
  closeButton.addEventListener('click', closeModal);
  resetButton.addEventListener('click', resetPlacement);
  centerButton.addEventListener('click', centerArtwork);
  emptyUploadButton.addEventListener('click', () => artworkInput.click());
  artworkInput.addEventListener('change', () => handleArtworkFile(artworkInput.files?.[0]));
  downloadButton.addEventListener('click', downloadMockup);
  mapButtons.forEach((button) => {
    button.addEventListener('click', () => setMapView(button.dataset.mapView));
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.remove('is-dragover');
    });
  });
  uploadZone.addEventListener('drop', (event) => {
    handleArtworkFile(event.dataTransfer?.files?.[0]);
  });

  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('active') || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal();
  }, true);

  window.ModelMockupStudio = {
    open: openModal,
    close: closeModal,
    loadArtworkDataUrl,
    reset: resetPlacement
  };
})();
