(function initializeWhiteMockupEditor() {
  'use strict';

  const editor = document.getElementById('whiteMockupEditor');
  if (!editor) return;

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
    interaction: null
  };

  const baseCanvas = document.createElement('canvas');
  const foregroundCanvas = document.createElement('canvas');
  const artworkCanvas = document.createElement('canvas');
  const compositeCanvas = document.createElement('canvas');
  const mapCanvas = document.createElement('canvas');
  const garmentMaskCanvas = document.createElement('canvas');
  const garmentTintCanvas = document.createElement('canvas');
  [baseCanvas, foregroundCanvas, artworkCanvas, compositeCanvas, mapCanvas, garmentMaskCanvas, garmentTintCanvas].forEach((item) => {
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

  function readPixels(image) {
    mapContext.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapContext.drawImage(image, 0, 0, mapCanvas.width, mapCanvas.height);
    return mapContext.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
  }

  function maskOpacityAt(index) {
    const alpha = state.maskPixels[index] / 255;
    if (alpha <= 0.06) return 0;
    // Reject faint segmentation residue outside the garment, then strengthen
    // the trusted photographic edge enough to avoid a pale source-color halo.
    return Math.min(1, (alpha - 0.06) / 0.34);
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
      if (options.overlay !== false) drawSelection();
      updateAccessibleTransform();
    }
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
        loadImage(assets.mask),
        loadImage(assets.depth)
      ]);
      state.baseImage = baseImage;
      state.maskImage = maskImage;
      state.depthImage = depthImage;
      state.maskPixels = readPixels(maskImage);
      state.depthPixels = readPixels(depthImage);
      buildGarmentMask();
      baseContext.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      baseContext.drawImage(baseImage, 0, 0, baseCanvas.width, baseCanvas.height);
      buildForegroundCutout();
      state.ready = true;
      render({ forceQuality: true });
      stage.classList.add('is-ready');
      loading.hidden = true;
      setStatus('Ready for your design.');
    } catch (error) {
      console.error(error);
      stage.classList.add('is-error');
      loading.hidden = true;
      setStatus('The preview is available, but editing controls could not be prepared. Refresh the page and try again.', true);
    }
  }

  function resetTransform() {
    state.offsetX = 0;
    state.offsetY = 0;
    state.scale = template.defaultScale;
    state.rotation = 0;
    state.interaction = null;
    canvas.classList.remove('is-interacting');
    setStatus('Artwork placement reset.');
    scheduleRender({ forceQuality: true });
  }

  function setArtworkImage(image, name) {
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
    window.trackEvent?.('begin_design', {
      design_entry: 'white_mockup_detail',
      item_id: template.assetName
    });
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
      setStatus('Choose a PNG, JPG, or WebP image.', true);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('Choose an image smaller than 10 MB.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      loadArtworkDataUrl(reader.result, file.name).catch((error) => {
        console.error(error);
        setStatus('The selected image could not be opened.', true);
      });
    };
    reader.onerror = () => setStatus('The selected image could not be read.', true);
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
    state.interaction = null;
    canvas.classList.remove('is-interacting');
    try { canvas.releasePointerCapture?.(event.pointerId); } catch (error) { /* Pointer capture may already be released. */ }
    setStatus('Artwork placement updated.');
    scheduleRender({ forceQuality: true });
  }

  function selectBackground(value, label, selectedButton) {
    state.background = value;
    backgroundLabel.textContent = label;
    backgroundButtons.forEach((button) => {
      const active = button === selectedButton;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    customBackgroundSwatch.classList.toggle('active', selectedButton === customBackgroundSwatch);
    scheduleRender({ forceQuality: true });
  }

  function selectGarmentColor(value, label, selectedControl) {
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
  }

  function downloadMockup() {
    if (!state.ready || !state.artworkImage) return;
    render({ overlay: false, forceQuality: true });
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('The PNG could not be created. Please try again.', true);
        scheduleRender({ forceQuality: true });
        return;
      }
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
      window.trackEvent?.('design_export', {
        export_format: 'png',
        export_type: 'white_mockup_detail',
        item_id: template.assetName
      });
      scheduleRender({ forceQuality: true });
    }, 'image/png');
  }

  input.addEventListener('change', () => handleArtworkFile(input.files?.[0]));
  emptyUpload.addEventListener('click', () => input.click());
  resetButton.addEventListener('click', resetTransform);
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
  uploadZone.addEventListener('drop', (event) => handleArtworkFile(event.dataTransfer?.files?.[0]));

  backgroundButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectBackground(button.dataset.background, button.dataset.label, button);
    });
  });
  customBackground.addEventListener('input', () => {
    selectBackground(customBackground.value, 'Custom color', customBackgroundSwatch);
  });
  garmentColorButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectGarmentColor(button.dataset.garmentColor, button.dataset.label, button);
    });
  });
  customGarmentColor.addEventListener('input', () => {
    selectGarmentColor(customGarmentColor.value, 'Custom color', customGarmentColorSwatch);
  });

  canvas.addEventListener('pointerdown', beginInteraction);
  canvas.addEventListener('pointermove', continueInteraction);
  canvas.addEventListener('pointerup', endInteraction);
  canvas.addEventListener('pointercancel', endInteraction);
  canvas.addEventListener('keydown', (event) => {
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

  prepareEditor();
}());
