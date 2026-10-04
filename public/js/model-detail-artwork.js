// Place artwork directly on the detail model using a continuous surface projection.
(() => {
  'use strict';

  const viewer = document.querySelector('#model3dViewer model-viewer');
  const uploadButton = document.getElementById('uploadModelArtworkBtn');
  const fileInput = document.getElementById('quickModelArtworkInput');
  const status = document.getElementById('modelArtworkStatus');
  const controls = document.getElementById('modelArtworkControls');
  const anchor = document.getElementById('modelArtworkAnchor');
  const moveHandle = document.getElementById('modelArtworkHandle');
  const resizeHandle = document.getElementById('modelArtworkResize');
  const scaleInput = document.getElementById('modelArtworkScale');
  const scaleValue = document.getElementById('modelArtworkScaleValue');
  const removeButton = document.getElementById('removeModelArtworkBtn');
  if (!viewer || !uploadButton || !fileInput || !status || !controls || !anchor) return;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const math = {
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
    length: a => Math.hypot(a.x, a.y, a.z),
    unit(a) { const size = this.length(a) || 1; return { x: a.x / size, y: a.y / size, z: a.z / size }; }
  };
  let artwork = null;
  let center = null;
  let projection = null;
  let width = 1;
  let initialWidth = 1;
  let pendingFrame = 0;
  let drag = null;
  let busy = false;

  function setStatus(message, error = false) {
    status.hidden = !message;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function imageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image could not be loaded.'));
      image.src = url;
    });
  }

  function hitAt(clientX, clientY) {
    const rect = viewer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const hit = viewer.positionAndNormalFromPoint?.(clientX, clientY);
    if (!hit?.position || !hit.normal) return null;
    return { position: hit.position, normal: hit.normal, clientX, clientY };
  }

  function projectionFromHit(hit) {
    const normal = math.unit(hit.normal);
    const nearby = hitAt(hit.clientX + 16, hit.clientY);
    // Keep uploaded artwork level in model space as it moves across folds.
    // Screen-space sampling rotates it whenever the neighboring hit lands on
    // a pocket, seam or differently angled triangle.
    let tangent = math.cross({ x: 0, y: 1, z: 0 }, normal);
    if (math.length(tangent) < 0.0001) tangent = math.cross({ x: 0, y: 0, z: 1 }, normal);
    const right = math.unit(tangent);
    const down = math.unit(math.cross(right, normal));
    const pixelsToWorld = nearby ? math.length(math.sub(nearby.position, hit.position)) / 16 : 1 / Math.max(200, viewer.clientWidth);
    return { center: hit.position, normal, right, down, pixelsToWorld };
  }

  function findInitialHit() {
    const rect = viewer.getBoundingClientRect();
    for (const yRatio of [0.58, 0.65, 0.5, 0.72, 0.42, 0.34]) {
      for (const xRatio of [0.43, 0.57, 0.5, 0.36, 0.64]) {
        const hit = hitAt(rect.left + rect.width * xRatio, rect.top + rect.height * yRatio);
        if (hit) return hit;
      }
    }
    return null;
  }

  function positionAnchor(hit) {
    const { position, normal } = hit;
    viewer.updateHotspot?.({
      name: 'hotspot-artwork',
      position: `${position.x}m ${position.y}m ${position.z}m`,
      normal: `${normal.x} ${normal.y} ${normal.z}`
    });
    anchor.hidden = false;
  }

  async function prepareViewer() {
    const readyViewer = await window.loadClothingModelViewer?.(viewer);
    if (!readyViewer?.model?.materials?.length) throw new Error('The 3D model is unavailable. Please try again.');
    await readyViewer.updateComplete;
    if (!window.ModelDetailSurface) throw new Error('The image editor is unavailable. Please reload the page.');
  }

  function renderTexture() {
    pendingFrame = 0;
    if (!artwork || !projection) return;
    try {
      const placement = { ...projection, width, height: width * artwork.naturalHeight / artwork.naturalWidth };
      const painted = window.ModelDetailSurface.attach(viewer, artwork, placement);
      setStatus(painted ? 'Image applied. Drag it on the garment or use Scale.' : 'Move the image onto a visible garment surface.', !painted);
    } catch (error) {
      console.error('Could not render image on 3D model:', error);
      restoreOriginal();
      setStatus('Image could not be applied. Please try again.', true);
    }
  }

  function scheduleTexture() {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(renderTexture);
  }

  function updateScale(nextWidth) {
    width = clamp(nextWidth, initialWidth * 0.3, initialWidth * 2.5);
    const percent = Math.round(width / initialWidth * 100);
    scaleInput.value = String(clamp(percent, Number(scaleInput.min), Number(scaleInput.max)));
    scaleValue.textContent = `${percent}%`;
    scheduleTexture();
  }

  function restoreOriginal() {
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    window.ModelDetailSurface?.detach(viewer);
    artwork = null;
    center = null;
    projection = null;
    anchor.hidden = true;
    controls.hidden = true;
    setStatus('');
  }

  // Export viewers use the same geometry and placement as the detail viewer.
  window.ModelDetailArtwork = {
    hasArtwork() { return Boolean(artwork && projection); },
    applyToViewer(targetViewer) {
      if (!artwork || !projection) return 0;
      return window.ModelDetailSurface.attach(targetViewer, artwork, {
        ...projection,
        width,
        height: width * artwork.naturalHeight / artwork.naturalWidth
      });
    }
  };

  async function placeFile(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error('Use a PNG, JPG or WebP image.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
    setStatus('Applying image to the 3D garment…');
    await prepareViewer();
    const url = URL.createObjectURL(file);
    let image;
    try { image = await imageFromUrl(url); }
    finally { URL.revokeObjectURL(url); }
    const hit = findInitialHit();
    if (!hit) throw new Error('The garment is still loading. Please try again.');
    artwork = image;
    center = { clientX: hit.clientX, clientY: hit.clientY };
    projection = projectionFromHit(hit);
    const dimensions = viewer.getDimensions?.();
    const garmentSpan = Math.min(Number(dimensions?.x) || 0, Number(dimensions?.y) || 0);
    const measuredWidth = projection.pixelsToWorld * 100;
    initialWidth = garmentSpan > 0
      ? clamp(measuredWidth, garmentSpan * 0.12, garmentSpan * 0.38)
      : Math.max(0.001, measuredWidth);
    width = initialWidth;
    scaleInput.value = '100';
    scaleValue.textContent = '100%';
    controls.hidden = false;
    positionAnchor(hit);
    scheduleTexture();
    window.trackEvent?.('model_detail_artwork_upload_select', {
      item_id: String(window.ModelDesignerConfig?.modelId || window.ModelDesignerConfig?.modelSlug || ''),
      image_count: 1
    });
  }

  uploadButton.addEventListener('click', () => { if (!busy) fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || busy) return;
    busy = true;
    uploadButton.disabled = true;
    uploadButton.setAttribute('aria-busy', 'true');
    try { await placeFile(file); }
    catch (error) {
      console.error('Could not place image on 3D model:', error);
      setStatus(error.message || 'Image could not be applied. Please try again.', true);
    } finally {
      busy = false;
      uploadButton.disabled = false;
      uploadButton.removeAttribute('aria-busy');
    }
  });

  function beginDrag(event, mode) {
    if (!artwork || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, startWidth: width };
    viewer.cameraControls = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  moveHandle.addEventListener('pointerdown', (event) => beginDrag(event, 'move'));
  resizeHandle.addEventListener('pointerdown', (event) => beginDrag(event, 'resize'));
  viewer.addEventListener('pointerdown', (event) => {
    if (!artwork || drag) return;
    if (event.composedPath().includes(moveHandle) || event.composedPath().includes(resizeHandle)) return;
    const hit = hitAt(event.clientX, event.clientY);
    if (!hit) return;
    if (Math.hypot(event.clientX - center.clientX, event.clientY - center.clientY) < 70 * width / initialWidth) {
      beginDrag(event, 'move');
    }
  }, true);

  window.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    if (drag.mode === 'resize') {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      const sign = (event.clientX - drag.startX) + (event.clientY - drag.startY) >= 0 ? 1 : -1;
      updateScale(drag.startWidth * (1 + sign * distance / 140));
      return;
    }
    const hit = hitAt(event.clientX, event.clientY);
    if (!hit) return;
    center = { clientX: hit.clientX, clientY: hit.clientY };
    projection = projectionFromHit(hit);
    positionAnchor(hit);
    scheduleTexture();
  }, { passive: false });

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    viewer.cameraControls = true;
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  moveHandle.addEventListener('keydown', (event) => {
    if (!artwork || !center) return;
    const step = event.shiftKey ? 24 : 8;
    const directions = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (directions[event.key]) {
      event.preventDefault();
      const hit = hitAt(center.clientX + directions[event.key][0], center.clientY + directions[event.key][1]);
      if (hit) {
        center = { clientX: hit.clientX, clientY: hit.clientY };
        projection = projectionFromHit(hit);
        positionAnchor(hit);
        scheduleTexture();
      }
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault(); updateScale(width * 1.08);
    } else if (event.key === '-') {
      event.preventDefault(); updateScale(width / 1.08);
    }
  });

  scaleInput.addEventListener('input', () => updateScale(initialWidth * Number(scaleInput.value) / 100));
  removeButton.addEventListener('click', restoreOriginal);
})();
