(function initializeWhiteMockupEditor() {
  'use strict';

  const editor = document.getElementById('whiteMockupEditor');
  if (!editor) return;
  const WATERMARK_TILE_URL = '/images/watermarks/clozdesign-watermark-tile-v1.png';

  const stage = document.getElementById('whiteMockupStage');
  const canvas = document.getElementById('whiteMockupCanvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const input = document.getElementById('whiteMockupArtworkInput');
  const uploadZone = document.getElementById('whiteMockupUploadZone');
  const uploadLabel = document.getElementById('whiteMockupUploadLabel');
  const emptyUpload = document.getElementById('whiteMockupEmptyUpload');
  const loading = document.getElementById('whiteMockupLoading');
  const gestureHint = document.getElementById('whiteMockupGestureHint');
  const resetButton = document.getElementById('whiteMockupReset');
  const downloadButton = document.getElementById('whiteMockupDownload');
  const status = document.getElementById('whiteMockupStatus');
  const backgroundLabel = document.getElementById('whiteMockupBackgroundLabel');
  const backgroundButtons = [...editor.querySelectorAll('[data-background]')];
  const customBackground = document.getElementById('whiteMockupBackgroundColor');
  const customBackgroundSwatch = customBackground.closest('.white-detail-custom-swatch');
  const garmentColorLabel = document.getElementById('whiteMockupGarmentColorLabel');
  const garmentColorButtons = [...editor.querySelectorAll('[data-garment-color]')];
  const customGarmentColor = document.getElementById('whiteMockupGarmentColor');
  const customGarmentColorSwatch = customGarmentColor.closest('.white-detail-garment-custom-swatch');

  const assets = {
    base: editor.dataset.baseImage,
    mask: editor.dataset.maskImage,
    maskFallback: editor.dataset.maskFallback,
    depth: editor.dataset.depthImage
  };

  const template = {
    assetName: editor.dataset.assetName || 'white-garment',
    garmentType: editor.dataset.garmentType || 'garment',
    centerX: Number(editor.dataset.artworkCenterX) || canvas.width / 2,
    centerY: Number(editor.dataset.artworkCenterY) || canvas.height * 0.47,
    baseWidth: Number(editor.dataset.artworkBaseWidth) || canvas.width * 0.5,
    maxHeight: Number(editor.dataset.artworkMaxHeight) || canvas.height * 0.42,
    renderLeft: Number(editor.dataset.renderLeft) || 0,
    renderTop: Number(editor.dataset.renderTop) || 0,
    renderRight: Number(editor.dataset.renderRight) || canvas.width,
    renderBottom: Number(editor.dataset.renderBottom) || canvas.height,
    defaultScale: Number(editor.dataset.defaultScale) || 48,
    defaultWarp: Number(editor.dataset.defaultWarp) || 34
  };

  function trackWhiteMockup(eventName, parameters = {}) {
    window.trackEvent?.(eventName, {
      item_id: template.assetName,
      item_category: template.garmentType,
      ...parameters
    });
  }

  const signInDialog = document.getElementById('modelLoginModal');
  const signInForm = document.getElementById('modelLoginForm');
  const signInError = document.getElementById('modelLoginError');
  let signInBusy = false;

  function requireEditorSignIn(action) {
    if (editor.dataset.authenticated === 'true') return true;
    if (!signInDialog.open) {
      trackWhiteMockup('white_mockup_signin_required', { attempted_action: action });
      signInError.hidden = true;
      signInDialog.showModal();
    }
    return false;
  }

  document.getElementById('modelLoginClose').addEventListener('click', () => signInDialog.close());
  document.getElementById('modelLoginBackdrop').addEventListener('click', () => signInDialog.close());
  signInDialog.addEventListener('click', (event) => {
    if (event.target !== signInDialog) return;
    const bounds = signInDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) signInDialog.close();
  });
  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (signInBusy) return;
    signInBusy = true;
    const submit = signInForm.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    signInError.hidden = true;
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: signInForm.elements.email.value, password: signInForm.elements.password.value })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to sign in. Please try again.');
      editor.dataset.authenticated = 'true';
      signInForm.reset();
      signInDialog.close();
      uploadLabel.textContent = 'Upload your design';
      emptyUpload.querySelector('strong').textContent = 'Upload a design to begin';
      setStatus('Signed in. Upload your design to begin.');
      trackWhiteMockup('white_mockup_signin_success');
      await buildGarmentWatermark(true);
      scheduleRender({ forceQuality: true });
    } catch (error) {
      if (editor.dataset.authenticated === 'true') return;
      signInError.textContent = error.message || 'Unable to sign in. Please try again.';
      signInError.hidden = false;
    } finally {
      signInBusy = false;
      submit.disabled = false;
      submit.textContent = 'Sign in and customize';
    }
  });

  const state = {
    ready: false,
    renderQueued: false,
    background: 'studio',
    garmentColor: '#ffffff',
    foregroundReady: false,
    baseImage: null,
    maskImage: null,
    depthImage: null,
    maskPixels: null,
    depthPixels: null,
    artworkImage: null,
    artworkName: '',
    offsetX: 0,
    offsetY: 0,
    scale: template.defaultScale,
    rotation: 0,
    warp: template.defaultWarp,
    opacity: 0.96,
    interaction: null,
    artworkUrl: '',
    artworkDataUrl: '',
    artworkUploadPromise: null,
    artworkRevision: 0,
    autoSaveTimer: null,
    saveInProgress: false,
    savePending: false,
    watermarkEnabled: false,
    projectId: '',
    projectName: '',
    projectPreviewUrl: ''
  };

  const baseCanvas = document.createElement('canvas');
  const foregroundCanvas = document.createElement('canvas');
  const artworkCanvas = document.createElement('canvas');
  const compositeCanvas = document.createElement('canvas');
  const mapCanvas = document.createElement('canvas');
  const garmentMaskCanvas = document.createElement('canvas');
  const garmentTintCanvas = document.createElement('canvas');
  const watermarkSourceCanvas = document.createElement('canvas');
  const watermarkCanvas = document.createElement('canvas');
  [baseCanvas, foregroundCanvas, artworkCanvas, compositeCanvas, mapCanvas, garmentMaskCanvas, garmentTintCanvas, watermarkSourceCanvas, watermarkCanvas].forEach((item) => {
    item.width = canvas.width;
    item.height = canvas.height;
  });
  const baseContext = baseCanvas.getContext('2d', { willReadFrequently: true });
  const foregroundContext = foregroundCanvas.getContext('2d');
  const artworkContext = artworkCanvas.getContext('2d', { willReadFrequently: true });
  const compositeContext = compositeCanvas.getContext('2d', { willReadFrequently: true });
  const mapContext = mapCanvas.getContext('2d', { willReadFrequently: true });
  const garmentMaskContext = garmentMaskCanvas.getContext('2d');
  const garmentTintContext = garmentTintCanvas.getContext('2d');
  const watermarkSourceContext = watermarkSourceCanvas.getContext('2d', { willReadFrequently: true });
  const watermarkContext = watermarkCanvas.getContext('2d');

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load image: ${url}`));
      image.src = url;
    });
  }

  async function loadRealtimeMask() {
    try {
      return await loadImage(assets.mask);
    } catch (error) {
      if (!assets.maskFallback || assets.maskFallback === assets.mask) throw error;
      console.warn('SVG garment mask failed to load; using the raster fallback.', error);
      return loadImage(assets.maskFallback);
    }
  }

  function readPixels(image) {
    mapContext.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapContext.drawImage(image, 0, 0, mapCanvas.width, mapCanvas.height);
    return mapContext.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
  }

  function maskOpacityAt(index) {
    // SVG masks encode coverage as black/white luminance, not transparency:
    // the full-canvas black background is intentionally opaque. Reading only
    // the alpha channel therefore turns the entire SVG into an active mask.
    // Multiplying luminance by source alpha also keeps transparent raster masks
    // compatible with the grayscale PNG fallback.
    const red = state.maskPixels[index] / 255;
    const green = state.maskPixels[index + 1] / 255;
    const blue = state.maskPixels[index + 2] / 255;
    const sourceAlpha = state.maskPixels[index + 3] / 255;
    const coverage = (red * 0.2126 + green * 0.7152 + blue * 0.0722) * sourceAlpha;
    if (coverage <= 0.14) return 0;
    // Keep the antialiased edge inside the garment. The previous curve turned
    // a partially transparent studio-edge pixel fully opaque, which made color
    // spill visible around collars, cuffs, hands, and sleeve gaps.
    const normalized = Math.min(1, (coverage - 0.14) / 0.70);
    return normalized * normalized * (3 - 2 * normalized);
  }

  function buildGarmentMask() {
    const output = new ImageData(canvas.width, canvas.height);
    const target = output.data;
    for (let index = 0; index < target.length; index += 4) {
      target[index] = 255;
      target[index + 1] = 255;
      target[index + 2] = 255;
      target[index + 3] = Math.round(maskOpacityAt(index) * 255);
    }
    garmentMaskContext.clearRect(0, 0, garmentMaskCanvas.width, garmentMaskCanvas.height);
    garmentMaskContext.putImageData(output, 0, 0);
  }

  async function buildGarmentWatermark(refresh = false) {
    const entitlements = !refresh && window.ExportEntitlements?.getEntitlements
      ? await window.ExportEntitlements.getEntitlements()
      : await fetch('/api/account/entitlements', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        return response.ok ? payload.entitlements : null;
      }).catch(() => null);
    state.watermarkEnabled = !entitlements?.features?.removeWatermarks;
    canvas.dataset.watermarkEnabled = String(state.watermarkEnabled);
    watermarkSourceContext.clearRect(0, 0, canvas.width, canvas.height);
    watermarkContext.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.watermarkEnabled) return;

    const tile = await loadImage(WATERMARK_TILE_URL);
    const markWidth = Math.max(96, Math.min(220, Math.round(Math.min(canvas.width, canvas.height) * 0.12)));
    const markHeight = Math.round(markWidth * 0.58);
    const horizontalStep = Math.round(markWidth * 0.9);
    const verticalStep = Math.round(markHeight * 0.92);
    const markCanvas = document.createElement('canvas');
    markCanvas.width = 650;
    markCanvas.height = 480;
    const markContext = markCanvas.getContext('2d');
    markContext.drawImage(tile, 300, 390, 650, 480, 0, 0, markCanvas.width, markCanvas.height);
    markContext.globalCompositeOperation = 'source-in';
    markContext.fillStyle = '#c5c7c4';
    markContext.fillRect(0, 0, markCanvas.width, markCanvas.height);
    watermarkSourceContext.save();
    watermarkSourceContext.globalAlpha = 0.62;
    watermarkSourceContext.imageSmoothingEnabled = true;
    watermarkSourceContext.imageSmoothingQuality = 'high';
    let row = 0;
    for (let y = -verticalStep; y < canvas.height + verticalStep; y += verticalStep) {
      const rowOffset = row % 2 ? -horizontalStep / 2 : 0;
      for (let x = -horizontalStep; x < canvas.width + horizontalStep; x += horizontalStep) {
        watermarkSourceContext.drawImage(markCanvas, 0, 0, markCanvas.width, markCanvas.height, x + rowOffset, y, markWidth, markHeight);
      }
      row += 1;
    }
    watermarkSourceContext.restore();

    // This is a real canvas texture layer: crop the repeated artwork with the
    // garment alpha mask so no watermark pixels exist on the person/background.
    watermarkContext.drawImage(watermarkSourceCanvas, 0, 0);
    watermarkContext.save();
    watermarkContext.globalCompositeOperation = 'destination-in';
    watermarkContext.drawImage(garmentMaskCanvas, 0, 0);
    watermarkContext.restore();
    canvas.dataset.watermarkRendered = 'true';
  }

  function sampleRegion(pixels, xStart, yStart, xEnd, yEnd) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let y = yStart; y < yEnd; y += 3) {
      for (let x = xStart; x < xEnd; x += 3) {
        const index = (y * canvas.width + x) * 4;
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
        count += 1;
      }
    }
    return [red / count, green / count, blue / count];
  }

  function buildForegroundCutout() {
    try {
      baseContext.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      baseContext.drawImage(state.baseImage, 0, 0, baseCanvas.width, baseCanvas.height);
      const imageData = baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
      const source = imageData.data;
      const marginX = Math.max(12, Math.round(canvas.width * 0.055));
      const marginY = Math.max(12, Math.round(canvas.height * 0.04));
      const corners = [
        sampleRegion(source, 0, 0, marginX, marginY),
        sampleRegion(source, canvas.width - marginX, 0, canvas.width, marginY),
        sampleRegion(source, 0, canvas.height - marginY, marginX, canvas.height),
        sampleRegion(source, canvas.width - marginX, canvas.height - marginY, canvas.width, canvas.height)
      ];
      const output = new ImageData(canvas.width, canvas.height);
      const target = output.data;

      for (let y = 0; y < canvas.height; y += 1) {
        const vertical = y / Math.max(1, canvas.height - 1);
        for (let x = 0; x < canvas.width; x += 1) {
          const horizontal = x / Math.max(1, canvas.width - 1);
          const topRed = corners[0][0] + (corners[1][0] - corners[0][0]) * horizontal;
          const topGreen = corners[0][1] + (corners[1][1] - corners[0][1]) * horizontal;
          const topBlue = corners[0][2] + (corners[1][2] - corners[0][2]) * horizontal;
          const bottomRed = corners[2][0] + (corners[3][0] - corners[2][0]) * horizontal;
          const bottomGreen = corners[2][1] + (corners[3][1] - corners[2][1]) * horizontal;
          const bottomBlue = corners[2][2] + (corners[3][2] - corners[2][2]) * horizontal;
          const expectedRed = topRed + (bottomRed - topRed) * vertical;
          const expectedGreen = topGreen + (bottomGreen - topGreen) * vertical;
          const expectedBlue = topBlue + (bottomBlue - topBlue) * vertical;
          const index = (y * canvas.width + x) * 4;
          const redDelta = source[index] - expectedRed;
          const greenDelta = source[index + 1] - expectedGreen;
          const blueDelta = source[index + 2] - expectedBlue;
          const distance = Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
          const inferredAlpha = Math.max(0, Math.min(1, (distance - 9) / 38));
          const garmentAlpha = maskOpacityAt(index);
          const alpha = Math.max(inferredAlpha, garmentAlpha);
          target[index] = source[index];
          target[index + 1] = source[index + 1];
          target[index + 2] = source[index + 2];
          target[index + 3] = Math.round((source[index + 3] / 255) * alpha * 255);
        }
      }

      foregroundContext.clearRect(0, 0, foregroundCanvas.width, foregroundCanvas.height);
      foregroundContext.putImageData(output, 0, 0);
      state.foregroundReady = true;
    } catch (error) {
      console.warn('Background replacement is unavailable for this mockup.', error);
      state.foregroundReady = false;
    }
  }

  function artworkGeometry() {
    if (!state.artworkImage) return null;
    const scale = state.scale / 100;
    const width = template.baseWidth * scale;
    const aspectRatio = state.artworkImage.naturalHeight / Math.max(1, state.artworkImage.naturalWidth);
    const height = Math.min(template.maxHeight * scale, width * aspectRatio);
    return {
      centerX: template.centerX + state.offsetX,
      centerY: template.centerY + state.offsetY,
      width,
      height,
      rotation: state.rotation * Math.PI / 180
    };
  }

  function updateAccessibleTransform() {
    const geometry = artworkGeometry();
    if (!geometry) return;
    canvas.dataset.artworkCenterX = String(Math.round(geometry.centerX));
    canvas.dataset.artworkCenterY = String(Math.round(geometry.centerY));
    canvas.dataset.artworkScale = String(Math.round(state.scale * 10) / 10);
    canvas.dataset.artworkRotation = String(Math.round(state.rotation * 10) / 10);
    canvas.setAttribute(
      'aria-valuetext',
      `Artwork position ${Math.round(geometry.centerX)}, ${Math.round(geometry.centerY)}; scale ${Math.round(state.scale)} percent; rotation ${Math.round(state.rotation)} degrees.`
    );
  }

  function drawArtworkSource() {
    artworkContext.clearRect(0, 0, artworkCanvas.width, artworkCanvas.height);
    const geometry = artworkGeometry();
    if (!geometry) return null;
    artworkContext.save();
    artworkContext.translate(geometry.centerX, geometry.centerY);
    artworkContext.rotate(geometry.rotation);
    artworkContext.imageSmoothingEnabled = true;
    artworkContext.imageSmoothingQuality = 'high';
    artworkContext.drawImage(
      state.artworkImage,
      -geometry.width / 2,
      -geometry.height / 2,
      geometry.width,
      geometry.height
    );
    artworkContext.restore();
    return artworkContext.getImageData(0, 0, artworkCanvas.width, artworkCanvas.height);
  }

  function clipArtworkFast() {
    compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    compositeContext.drawImage(artworkCanvas, 0, 0);
    compositeContext.save();
    compositeContext.globalCompositeOperation = 'destination-in';
    compositeContext.globalAlpha = state.opacity;
    compositeContext.drawImage(garmentMaskCanvas, 0, 0, compositeCanvas.width, compositeCanvas.height);
    compositeContext.restore();
  }

  function warpArtwork(sourceImageData) {
    const source = sourceImageData.data;
    const output = new ImageData(canvas.width, canvas.height);
    const target = output.data;
    const xStart = Math.max(0, template.renderLeft);
    const xEnd = Math.min(canvas.width, template.renderRight);
    const yStart = Math.max(0, template.renderTop);
    const yEnd = Math.min(canvas.height, template.renderBottom);
    const warpStrength = state.warp / 100;

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const maskAlpha = maskOpacityAt(index);
        if (maskAlpha <= 0.004) continue;
        const left = (y * canvas.width + Math.max(0, x - 2)) * 4;
        const right = (y * canvas.width + Math.min(canvas.width - 1, x + 2)) * 4;
        const upper = (Math.max(0, y - 2) * canvas.width + x) * 4;
        const lower = (Math.min(canvas.height - 1, y + 2) * canvas.width + x) * 4;
        const gradientX = state.depthPixels[right] - state.depthPixels[left];
        const gradientY = state.depthPixels[lower] - state.depthPixels[upper];
        const sourceX = Math.round(x + gradientX * warpStrength * 0.82);
        const sourceY = Math.round(y + gradientY * warpStrength * 0.58);
        if (sourceX < 0 || sourceX >= canvas.width || sourceY < 0 || sourceY >= canvas.height) continue;
        const sourceIndex = (sourceY * canvas.width + sourceX) * 4;
        const sourceAlpha = source[sourceIndex + 3] / 255;
        if (sourceAlpha <= 0.004) continue;
        target[index] = source[sourceIndex];
        target[index + 1] = source[sourceIndex + 1];
        target[index + 2] = source[sourceIndex + 2];
        target[index + 3] = Math.round(255 * sourceAlpha * maskAlpha * state.opacity);
      }
    }

    compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    compositeContext.putImageData(output, 0, 0);
  }

  function drawBaseAndBackground() {
    if (state.background === 'studio') {
      context.drawImage(state.baseImage, 0, 0, canvas.width, canvas.height);
      return;
    }
    context.fillStyle = state.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      state.foregroundReady ? foregroundCanvas : baseCanvas,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  function drawGarmentColor() {
    if (state.garmentColor.toLowerCase() === '#ffffff') return;
    garmentTintContext.clearRect(0, 0, garmentTintCanvas.width, garmentTintCanvas.height);
    garmentTintContext.fillStyle = state.garmentColor;
    garmentTintContext.fillRect(0, 0, garmentTintCanvas.width, garmentTintCanvas.height);
    garmentTintContext.save();
    garmentTintContext.globalCompositeOperation = 'destination-in';
    garmentTintContext.drawImage(garmentMaskCanvas, 0, 0);
    garmentTintContext.restore();
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.drawImage(garmentTintCanvas, 0, 0);
    context.restore();
  }

  function drawGarmentWatermark() {
    if (!state.watermarkEnabled) return;
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.drawImage(watermarkCanvas, 0, 0);
    context.restore();
  }

  function canvasUiScale() {
    const rect = canvas.getBoundingClientRect();
    return canvas.width / Math.max(1, rect.width);
  }

  function rotatePoint(localX, localY, geometry) {
    const cosine = Math.cos(geometry.rotation);
    const sine = Math.sin(geometry.rotation);
    return {
      x: geometry.centerX + localX * cosine - localY * sine,
      y: geometry.centerY + localX * sine + localY * cosine
    };
  }

  function drawSelection() {
    const geometry = artworkGeometry();
    if (!geometry) return;
    const uiScale = canvasUiScale();
    const lineWidth = Math.max(2, 1.4 * uiScale);
    const handleSize = Math.max(12, 7 * uiScale);
    const rotationOffset = Math.max(34, 22 * uiScale);

    context.save();
    context.translate(geometry.centerX, geometry.centerY);
    context.rotate(geometry.rotation);
    context.strokeStyle = '#0875d1';
    context.lineWidth = lineWidth;
    context.setLineDash([]);
    context.strokeRect(-geometry.width / 2, -geometry.height / 2, geometry.width, geometry.height);
    context.beginPath();
    context.moveTo(0, -geometry.height / 2);
    context.lineTo(0, -geometry.height / 2 - rotationOffset);
    context.stroke();

    const corners = [
      [-geometry.width / 2, -geometry.height / 2],
      [geometry.width / 2, -geometry.height / 2],
      [geometry.width / 2, geometry.height / 2],
      [-geometry.width / 2, geometry.height / 2]
    ];
    context.fillStyle = '#fff';
    corners.forEach(([x, y]) => {
      context.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
      context.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    });
    context.beginPath();
    context.arc(0, -geometry.height / 2 - rotationOffset, handleSize * 0.62, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  function render(options = {}) {
    state.renderQueued = false;
    if (!state.ready) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBaseAndBackground();
    drawGarmentColor();
    if (state.artworkImage) {
      const source = drawArtworkSource();
      if (state.interaction && !options.forceQuality) clipArtworkFast();
      else warpArtwork(source);
      context.save();
      context.globalCompositeOperation = 'multiply';
      context.drawImage(compositeCanvas, 0, 0);
      context.restore();
      updateAccessibleTransform();
    }
    drawGarmentWatermark();
    if (state.artworkImage && options.overlay !== false) drawSelection();
  }

  function scheduleRender(options) {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => render(options));
  }

  async function prepareEditor() {
    try {
      const [baseImage, maskImage, depthImage] = await Promise.all([
        loadImage(assets.base),
        loadRealtimeMask(),
        loadImage(assets.depth)
      ]);
      state.baseImage = baseImage;
      state.maskImage = maskImage;
      state.depthImage = depthImage;
      state.maskPixels = readPixels(maskImage);
      state.depthPixels = readPixels(depthImage);
      buildGarmentMask();
      await buildGarmentWatermark();
      baseContext.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      baseContext.drawImage(baseImage, 0, 0, baseCanvas.width, baseCanvas.height);
      buildForegroundCutout();
      state.ready = true;
      render({ forceQuality: true });
      stage.classList.add('is-ready');
      loading.hidden = true;
      setStatus(editor.dataset.authenticated === 'true' ? 'Ready for your design.' : 'Sign in to upload your design and save your project.');
      trackWhiteMockup('white_mockup_editor_ready');
    } catch (error) {
      console.error(error);
      stage.classList.add('is-error');
      loading.hidden = true;
      setStatus('The preview is available, but editing controls could not be prepared. Refresh the page and try again.', true);
      trackWhiteMockup('white_mockup_editor_load_error', {
        error_message: String(error.message || 'Editor assets could not be prepared.').slice(0, 120)
      });
    }
  }

  function resetTransform(trackAction = false) {
    if (trackAction && !requireEditorSignIn('reset')) return;
    state.offsetX = 0;
    state.offsetY = 0;
    state.scale = template.defaultScale;
    state.rotation = 0;
    state.interaction = null;
    canvas.classList.remove('is-interacting');
    setStatus('Artwork placement reset.');
    scheduleRender({ forceQuality: true });
    if (trackAction) {
      trackWhiteMockup('white_mockup_artwork_reset_click');
      queueProjectSave();
    }
  }

  function setArtworkImage(image, name, source = 'external') {
    state.artworkImage = image;
    state.artworkName = name || 'artwork';
    uploadLabel.textContent = name || 'Design uploaded';
    uploadZone.classList.add('has-artwork');
    emptyUpload.hidden = true;
    gestureHint.hidden = false;
    resetButton.hidden = false;
    downloadButton.disabled = false;
    canvas.classList.add('has-artwork');
    resetTransform();
    setStatus('Design added. Adjust it directly on the garment.');
    trackWhiteMockup(`white_mockup_artwork_${source}_load_success`, {
      design_entry: 'white_mockup_detail',
      file_name: name || undefined
    });
  }

  function loadArtworkDataUrl(dataUrl, name, source = 'external') {
    if (!requireEditorSignIn('upload')) return Promise.resolve(null);
    return loadImage(dataUrl).then((image) => {
      setArtworkImage(image, name, source);
      return image;
    });
  }

  async function storeArtwork(dataUrl, name, revision) {
    if (editor.dataset.authenticated !== 'true' || !window.UserProjects) return null;
    setStatus('Uploading artwork securely…');
    const image = await window.UserProjects.uploadImage(dataUrl, name, 'artwork');
    if (revision !== state.artworkRevision) return image;
    state.artworkUrl = image.url;
    setStatus('Artwork uploaded. Adding it to your projects…');
    trackWhiteMockup('white_mockup_artwork_cloud_save_success', {
      file_name: name || undefined
    });
    return image;
  }

  function handleArtworkFile(file, source = 'picker') {
    if (!requireEditorSignIn('upload')) return;
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setStatus('Choose a PNG, JPG, or WebP image.', true);
      trackWhiteMockup(`white_mockup_artwork_${source}_invalid_type`, { file_type: file.type || undefined });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('Choose an image no larger than 10 MB.', true);
      trackWhiteMockup(`white_mockup_artwork_${source}_too_large`, { file_size: file.size });
      return;
    }
    trackWhiteMockup(`white_mockup_artwork_${source}_select`, {
      file_type: file.type,
      file_size: file.size
    });
    const reader = new FileReader();
    reader.onload = () => {
      const revision = state.artworkRevision + 1;
      state.artworkRevision = revision;
      state.artworkDataUrl = reader.result;
      state.artworkUrl = '';
      state.projectPreviewUrl = '';
      const artworkLoadPromise = loadArtworkDataUrl(reader.result, file.name, source).catch((error) => {
        console.error(error);
        setStatus('The selected image could not be opened.', true);
        trackWhiteMockup(`white_mockup_artwork_${source}_load_error`, {
          error_message: String(error.message || 'Selected image could not be opened.').slice(0, 120)
        });
        throw error;
      });
      state.artworkUploadPromise = storeArtwork(reader.result, file.name, revision).catch((error) => {
        console.error(error);
        setStatus(error.message || 'Artwork could not be saved.', true);
        trackWhiteMockup('white_mockup_artwork_cloud_upload_error', {
          error_message: String(error.message || 'Artwork could not be saved.').slice(0, 120)
        });
        throw error;
      });
      Promise.all([artworkLoadPromise, state.artworkUploadPromise])
        .then(() => {
          if (revision === state.artworkRevision) queueProjectSave({ immediate: true });
        })
        .catch(() => {});
    };
    reader.onerror = () => {
      setStatus('The selected image could not be read.', true);
      trackWhiteMockup(`white_mockup_artwork_${source}_read_error`);
    };
    reader.readAsDataURL(file);
  }

  function eventPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  }

  function pointToLocal(point, geometry) {
    const deltaX = point.x - geometry.centerX;
    const deltaY = point.y - geometry.centerY;
    const cosine = Math.cos(-geometry.rotation);
    const sine = Math.sin(-geometry.rotation);
    return {
      x: deltaX * cosine - deltaY * sine,
      y: deltaX * sine + deltaY * cosine
    };
  }

  function distance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function findPointerMode(point, geometry) {
    const uiScale = canvasUiScale();
    const hitRadius = Math.max(24, 14 * uiScale);
    const rotationOffset = Math.max(34, 22 * uiScale);
    const rotateHandle = rotatePoint(0, -geometry.height / 2 - rotationOffset, geometry);
    if (distance(point, rotateHandle) <= hitRadius) return 'rotate';

    const cornerPoints = [
      rotatePoint(-geometry.width / 2, -geometry.height / 2, geometry),
      rotatePoint(geometry.width / 2, -geometry.height / 2, geometry),
      rotatePoint(geometry.width / 2, geometry.height / 2, geometry),
      rotatePoint(-geometry.width / 2, geometry.height / 2, geometry)
    ];
    if (cornerPoints.some(corner => distance(point, corner) <= hitRadius)) return 'scale';

    const local = pointToLocal(point, geometry);
    if (Math.abs(local.x) <= geometry.width / 2 && Math.abs(local.y) <= geometry.height / 2) return 'move';
    return '';
  }

  function beginInteraction(event) {
    if (!requireEditorSignIn('edit')) return;
    if (!state.ready || !state.artworkImage || event.button > 0) return;
    const point = eventPoint(event);
    const geometry = artworkGeometry();
    const mode = findPointerMode(point, geometry);
    if (!mode) return;
    event.preventDefault();
    const center = { x: geometry.centerX, y: geometry.centerY };
    state.interaction = {
      mode,
      startPoint: point,
      startOffsetX: state.offsetX,
      startOffsetY: state.offsetY,
      startScale: state.scale,
      startRotation: state.rotation,
      startDistance: Math.max(1, distance(point, center)),
      startAngle: Math.atan2(point.y - center.y, point.x - center.x)
    };
    canvas.classList.add('is-interacting');
    try { canvas.setPointerCapture?.(event.pointerId); } catch (error) { /* Synthetic and older pointer events may not support capture. */ }
  }

  function continueInteraction(event) {
    if (!state.interaction) return;
    event.preventDefault();
    const point = eventPoint(event);
    const geometry = artworkGeometry();
    const center = { x: geometry.centerX, y: geometry.centerY };
    const interaction = state.interaction;

    if (interaction.mode === 'move') {
      state.offsetX = Math.max(-canvas.width, Math.min(canvas.width, interaction.startOffsetX + point.x - interaction.startPoint.x));
      state.offsetY = Math.max(-canvas.height, Math.min(canvas.height, interaction.startOffsetY + point.y - interaction.startPoint.y));
    } else if (interaction.mode === 'scale') {
      const ratio = distance(point, center) / interaction.startDistance;
      state.scale = Math.max(16, Math.min(180, interaction.startScale * ratio));
    } else if (interaction.mode === 'rotate') {
      const currentAngle = Math.atan2(point.y - center.y, point.x - center.x);
      state.rotation = interaction.startRotation + (currentAngle - interaction.startAngle) * 180 / Math.PI;
    }
    scheduleRender();
  }

  function endInteraction(event) {
    if (!state.interaction) return;
    const completedInteraction = state.interaction;
    state.interaction = null;
    canvas.classList.remove('is-interacting');
    try { canvas.releasePointerCapture?.(event.pointerId); } catch (error) { /* Pointer capture may already be released. */ }
    setStatus('Artwork placement updated.');
    scheduleRender({ forceQuality: true });
    queueProjectSave();
    trackWhiteMockup(`white_mockup_artwork_${completedInteraction.mode}_complete`, {
      artwork_offset_x: Math.round(state.offsetX),
      artwork_offset_y: Math.round(state.offsetY),
      artwork_scale: Math.round(state.scale * 10) / 10,
      artwork_rotation: Math.round(state.rotation * 10) / 10
    });
  }

  function selectBackground(value, label, selectedButton, analyticsEventName) {
    if (!requireEditorSignIn('background')) return;
    state.background = value;
    backgroundLabel.textContent = label;
    backgroundButtons.forEach((button) => {
      const active = button === selectedButton;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    customBackgroundSwatch.classList.toggle('active', selectedButton === customBackgroundSwatch);
    scheduleRender({ forceQuality: true });
    queueProjectSave();
    if (analyticsEventName) {
      trackWhiteMockup(analyticsEventName, { background_name: label, background_value: value });
    }
  }

  function selectGarmentColor(value, label, selectedControl, analyticsEventName) {
    if (!requireEditorSignIn('garment_color')) return;
    state.garmentColor = value;
    garmentColorLabel.textContent = label;
    garmentColorButtons.forEach((button) => {
      const active = button === selectedControl;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    customGarmentColorSwatch.classList.toggle('active', selectedControl === customGarmentColorSwatch);
    setStatus(`${label} garment color applied.`);
    scheduleRender({ forceQuality: true });
    queueProjectSave();
    if (analyticsEventName) {
      trackWhiteMockup(analyticsEventName, { color_name: label, color_value: value });
    }
  }

  async function downloadMockup() {
    if (!requireEditorSignIn('download')) return;
    if (!state.ready || !state.artworkImage) return;
    trackWhiteMockup('white_mockup_png_download_begin');
    render({ overlay: false, forceQuality: true });
    downloadButton.disabled = true;
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The PNG could not be created.');
      const safeArtworkName = state.artworkName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'design';
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeArtworkName}-${template.assetName}-mockup.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setStatus(`PNG downloaded at ${canvas.width} × ${canvas.height}.`);
      trackWhiteMockup('white_mockup_png_download_success', {
        export_format: 'png',
        export_type: 'white_mockup_detail'
      });
    } catch (error) {
      console.error(error);
      setStatus('The PNG could not be created. Please try again.', true);
      trackWhiteMockup('white_mockup_png_download_error', {
        error_message: String(error.message || 'PNG could not be created.').slice(0, 120)
      });
    } finally {
      downloadButton.disabled = false;
      scheduleRender({ forceQuality: true });
    }
  }

  function queueProjectSave({ immediate = false } = {}) {
    if (window.UserProjects?.isAdminPreview) return;
    if (editor.dataset.authenticated !== 'true' || !state.artworkImage || !window.UserProjects) return;
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = window.setTimeout(saveProject, immediate ? 0 : 700);
  }

  async function saveProject() {
    if (window.UserProjects?.isAdminPreview) return;
    state.autoSaveTimer = null;
    if (!state.artworkImage || !window.UserProjects) return;
    if (!state.ready) {
      state.autoSaveTimer = window.setTimeout(saveProject, 250);
      return;
    }
    if (state.saveInProgress) {
      state.savePending = true;
      return;
    }
    state.saveInProgress = true;
    const revision = state.artworkRevision;
    const saveMode = state.projectId ? 'update' : 'create';
    trackWhiteMockup(`white_mockup_project_${saveMode}_begin`);
    setStatus(saveMode === 'create' ? 'Adding project to your account…' : 'Saving changes…');
    try {
      if (state.artworkUploadPromise) await state.artworkUploadPromise;
      if (revision !== state.artworkRevision) return;
      if (!state.artworkUrl && state.artworkDataUrl) {
        state.artworkUploadPromise = storeArtwork(state.artworkDataUrl, state.artworkName, revision);
        await state.artworkUploadPromise;
      }
      if (!state.artworkUrl) throw new Error('Artwork must finish uploading before this project can be saved.');
      let previewImageUrl = state.projectPreviewUrl;
      if (!previewImageUrl) {
        render({ overlay: false, forceQuality: true });
        const preview = await window.UserProjects.uploadImage(
          canvas.toDataURL('image/jpeg', 0.86),
          `${template.assetName}-preview.jpg`,
          'project-preview'
        );
        if (revision !== state.artworkRevision) return;
        previewImageUrl = preview.url;
        state.projectPreviewUrl = previewImageUrl;
      }
      if (revision !== state.artworkRevision) return;
      const project = await window.UserProjects.saveProject({
        id: state.projectId || undefined,
        projectType: 'white_mockup',
        name: state.projectName || `${state.artworkName.replace(/\.[^.]+$/, '')} — ${template.assetName}`,
        sourceId: template.assetName,
        sourceUrl: window.location.pathname,
        previewImageUrl,
        designData: {
          artworkUrl: state.artworkUrl,
          artworkName: state.artworkName,
          background: state.background,
          garmentColor: state.garmentColor,
          offsetX: state.offsetX,
          offsetY: state.offsetY,
          scale: state.scale,
          rotation: state.rotation,
          warp: state.warp,
          opacity: state.opacity
        }
      });
      state.projectId = project.id;
      state.projectName = project.name;
      state.projectPreviewUrl = project.previewImageUrl || state.projectPreviewUrl;
      const url = new URL(window.location.href);
      url.searchParams.set('project', project.id);
      window.history.replaceState({}, '', url);
      setStatus(saveMode === 'create' ? 'Added automatically to your projects.' : 'Changes saved automatically.');
      trackWhiteMockup(`white_mockup_project_${saveMode}_success`, {
        project_id: project.id
      });
    } catch (error) {
      console.error(error);
      if (error.status === 401) {
        setStatus('Your session expired. Sign in again to keep saving this project.', true);
        trackWhiteMockup('white_mockup_autosave_session_expired');
      } else {
        setStatus(error.message || 'Project could not be saved automatically.', true);
        trackWhiteMockup(`white_mockup_project_${saveMode}_error`, {
          error_message: String(error.message || 'Project could not be saved.').slice(0, 120)
        });
      }
    } finally {
      state.saveInProgress = false;
      scheduleRender({ forceQuality: true });
      if (state.savePending || revision !== state.artworkRevision) {
        state.savePending = false;
        queueProjectSave({ immediate: true });
      }
    }
  }

  async function loadSavedProject() {
    if (!window.UserProjects) return;
    try {
      const project = await window.UserProjects.loadProjectFromUrl('white_mockup');
      if (!project) return;
      if (project.sourceId && project.sourceId !== template.assetName) throw new Error('This project uses another fashion mockup.');
      const saved = project.designData || {};
      if (!saved.artworkUrl) throw new Error('The saved artwork is unavailable.');
      await loadArtworkDataUrl(window.UserProjects.isAdminPreview ? window.UserProjects.textureUrl(saved.artworkUrl) : saved.artworkUrl, saved.artworkName || project.name, 'saved_project');
      state.artworkUrl = saved.artworkUrl;
      state.projectId = project.id;
      state.projectName = project.name;
      state.projectPreviewUrl = project.previewImageUrl || '';
      state.background = saved.background || 'studio';
      state.garmentColor = saved.garmentColor || '#ffffff';
      state.offsetX = Number(saved.offsetX) || 0;
      state.offsetY = Number(saved.offsetY) || 0;
      state.scale = Number(saved.scale) || template.defaultScale;
      state.rotation = Number(saved.rotation) || 0;
      state.warp = Number(saved.warp) || template.defaultWarp;
      state.opacity = Number(saved.opacity) || 0.96;
      backgroundLabel.textContent = state.background === 'studio' ? 'Original studio' : 'Saved color';
      garmentColorLabel.textContent = 'Saved color';
      customBackground.value = /^#[0-9a-f]{6}$/i.test(state.background) ? state.background : '#d6d3cb';
      customGarmentColor.value = state.garmentColor;
      setStatus('Saved project loaded.');
      scheduleRender({ forceQuality: true });
      trackWhiteMockup('white_mockup_saved_project_load_success', {
        project_id: project.id
      });
    } catch (error) {
      console.error(error);
      setStatus(error.status === 401 ? 'Sign in to open this saved project.' : (error.message || 'Project could not be loaded.'), true);
      trackWhiteMockup(error.status === 401
        ? 'white_mockup_saved_load_signin_required'
        : 'white_mockup_saved_project_load_error', {
        error_message: String(error.message || 'Project could not be loaded.').slice(0, 120)
      });
    }
  }

  input.addEventListener('click', (event) => {
    if (!requireEditorSignIn('upload')) {
      event.preventDefault();
      return;
    }
    trackWhiteMockup('white_mockup_artwork_picker_open');
  });
  input.addEventListener('change', () => handleArtworkFile(input.files?.[0], 'picker'));
  emptyUpload.addEventListener('click', () => {
    if (!requireEditorSignIn('upload')) return;
    trackWhiteMockup('white_mockup_empty_stage_upload_click');
    input.click();
  });
  resetButton.addEventListener('click', () => resetTransform(true));
  downloadButton.addEventListener('click', downloadMockup);

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
  uploadZone.addEventListener('drop', (event) => handleArtworkFile(event.dataTransfer?.files?.[0], 'drop'));

  backgroundButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectBackground(
        button.dataset.background,
        button.dataset.label,
        button,
        `white_mockup_bg_${button.dataset.label}_select`
      );
    });
  });
  customBackground.addEventListener('click', (event) => {
    if (!requireEditorSignIn('background')) event.preventDefault();
  });
  customBackground.addEventListener('input', () => {
    selectBackground(customBackground.value, 'Custom color', customBackgroundSwatch);
  });
  customBackground.addEventListener('change', () => {
    if (!requireEditorSignIn('background')) return;
    trackWhiteMockup('white_mockup_bg_custom_select', {
      background_name: 'Custom color',
      background_value: customBackground.value
    });
  });
  garmentColorButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectGarmentColor(
        button.dataset.garmentColor,
        button.dataset.label,
        button,
        `white_mockup_color_${button.dataset.label}_select`
      );
    });
  });
  customGarmentColor.addEventListener('click', (event) => {
    if (!requireEditorSignIn('garment_color')) event.preventDefault();
  });
  customGarmentColor.addEventListener('input', () => {
    selectGarmentColor(customGarmentColor.value, 'Custom color', customGarmentColorSwatch);
  });
  customGarmentColor.addEventListener('change', () => {
    if (!requireEditorSignIn('garment_color')) return;
    trackWhiteMockup('white_mockup_color_custom_select', {
      color_name: 'Custom color',
      color_value: customGarmentColor.value
    });
  });

  canvas.addEventListener('pointerdown', beginInteraction);
  canvas.addEventListener('pointermove', continueInteraction);
  canvas.addEventListener('pointerup', endInteraction);
  canvas.addEventListener('pointercancel', endInteraction);
  canvas.addEventListener('keydown', (event) => {
    if (!requireEditorSignIn('edit')) return;
    if (!state.artworkImage) return;
    const step = event.shiftKey ? 20 : 5;
    let handled = true;
    if (event.key === 'ArrowLeft') state.offsetX -= step;
    else if (event.key === 'ArrowRight') state.offsetX += step;
    else if (event.key === 'ArrowUp') state.offsetY -= step;
    else if (event.key === 'ArrowDown') state.offsetY += step;
    else if (event.key === '+' || event.key === '=') state.scale = Math.min(180, state.scale + 2);
    else if (event.key === '-') state.scale = Math.max(16, state.scale - 2);
    else if (event.key === '[') state.rotation -= 2;
    else if (event.key === ']') state.rotation += 2;
    else handled = false;
    if (!handled) return;
    event.preventDefault();
    scheduleRender({ forceQuality: true });
    queueProjectSave();
    const keyboardAction = event.key.startsWith('Arrow') ? 'move' : (event.key === '[' || event.key === ']') ? 'rotate' : 'scale';
    trackWhiteMockup(`white_mockup_artwork_keyboard_${keyboardAction}`, {
      keyboard_key: event.key
    });
  });

  window.addEventListener('resize', () => scheduleRender({ forceQuality: true }));

  window.WhiteMockupEditor = {
    loadArtworkDataUrl,
    reset: resetTransform,
    setBackground(value) {
      selectBackground(value, value === 'studio' ? 'Original studio' : 'Custom color', null);
    },
    getState() {
      return {
        ready: state.ready,
        hasArtwork: Boolean(state.artworkImage),
        background: state.background,
        garmentColor: state.garmentColor,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        scale: state.scale,
        rotation: state.rotation
      };
    },
    setGarmentColor(value) {
      selectGarmentColor(value, 'Custom color', null);
    }
  };

  prepareEditor().then(loadSavedProject);
}());
