(() => {
  'use strict';
  const config = window.ModelDesignerConfig || {};
  const layouts = [
    ['single', 'Single view', ['front']],
    ['front-back', 'Front + back', ['front', 'back']],
    ['three', 'Three angles', ['front', 'side', 'back']],
    ['four', 'Four-view grid', ['front', 'side', 'back', 'other']],
    ['editorial', 'Editorial split', ['detail', 'back']],
    ['detail', 'Detail focus', ['detail', 'sleeve']]
  ];
  const videos = [
    ['orbit', '360° rotation'], ['front-back', 'Front + back'], ['three', 'Three views'], ['detail', 'Detail tour'],
    ['reveal', 'Design reveal'], ['before-after', 'Before / after'], ['social', 'Social cover'], ['story', 'Product story']
  ];
  const colors = [['transparent', 'Transparent', 'transparent'], ['white', 'White', '#ffffff'], ['ivory', 'Warm ivory', '#f9f5eb'], ['sand', 'Sand', '#d8d1c5'], ['slate', 'Slate', '#858b95'], ['charcoal', 'Charcoal', '#444444'], ['custom', 'Custom color', '#b9a38e']];
  const camera = { front: '0deg 72deg 142%', back: '180deg 72deg 142%', side: '90deg 72deg 142%', other: '-90deg 72deg 142%', detail: '0deg 67deg 88%', sleeve: '90deg 66deg 94%' };
  const state = { tab: 'images', layout: 'front-back', background: 'sand', customColor: '#B9A38E', customCss: '', pickerSpec: null, opacity: 100, format: 'png', size: 2048, video: 'orbit', duration: 10, ratio: '16:9', quality: 1080, shareUrl: '', busy: false, running: false };
  let dialog, viewer, status, animationFrame = 0, returnFocus, exportDropdown, videoBounds;
  let videoRenderGeneration = 0;
  let stopVideoThumbnails = () => {};
  const thumbnailsPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let baseSceneBlob = null, baseDimensions = null, baseCenter = null;
  const layoutSceneUrls = new Map();
  let videoSceneUrl = null;
  let registeredVideoSceneUrl = null;
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const waitFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function download(data, filename) {
    const url = data instanceof Blob ? URL.createObjectURL(data) : data;
    const a = document.createElement('a'); a.href = url; a.download = filename;
    // Keep the download link inside the active modal; the rest of the document is inert.
    a.hidden = true;
    (dialog?.open ? dialog : document.body).append(a);
    a.click();
    // Give browsers time to consume the file before removing the link and URL.
    setTimeout(() => { a.remove(); if (data instanceof Blob) URL.revokeObjectURL(url); }, 60000);
  }
  function colorValue() {
    if (state.background === 'transparent') return null;
    if (state.background === 'custom') return state.customCss || state.customColor;
    return colors.find(item => item[0] === state.background)?.[2] || '#ffffff';
  }
  const transparentPreview = 'repeating-conic-gradient(#e1e4e9 0% 25%, #fff 0% 50%) 50% / 22px 22px';
  function backgroundSwatches() {
    return `<div class="export-swatches">${colors.map(([key,label,value]) => `<button type="button" class="export-swatch ${state.background === key ? 'selected' : ''}" data-background="${key}" aria-label="${label}" aria-pressed="${state.background === key}"><i style="--swatch:${key === 'custom' ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : value}"></i></button>`).join('')}</div>`;
  }
  function previewBackground() {
    dialog.querySelector('.export-visual').style.background = colorValue() || transparentPreview;
  }
  function setStatus(message, error = false) {
    if (status) { status.textContent = message; status.dataset.error = String(error); }
    const shareMessage=dialog?.querySelector('.export-share-message');
    if (shareMessage) { shareMessage.textContent = message; shareMessage.dataset.error = String(error); }
  }
  function cardImage(kind) {
    return `<span class="export-mini"><img src="/images/export-layouts/${kind}.webp" alt="" width="480" height="320" decoding="async"></span>`;
  }
  function create() {
    dialog = document.createElement('dialog'); dialog.id = 'modelExportDialog'; dialog.className = 'model-export-dialog'; dialog.setAttribute('aria-label', 'Export design');
    dialog.innerHTML = `<div class="export-shell">
      <div class="export-header"><div class="export-tabs" role="tablist" aria-label="Export options">${[['images','Images'],['video','Video'],['model','3D File'],['share','Share']].map(([key,label]) => `<button type="button" role="tab" data-tab="${key}" aria-selected="false">${label}</button>`).join('')}</div><button class="export-close" type="button" aria-label="Close export dialog">×</button></div>
      <div class="export-main"><div class="export-preview"><div class="export-visual"><model-viewer id="exportLiveViewer" src="${esc(config.previewModelFileUrl)}" poster="${esc(config.previewImageUrl)}" alt="3D export preview" loading="eager" reveal="auto" camera-controls disable-tap interaction-prompt="none" camera-orbit="${camera.front}" field-of-view="28deg" shadow-intensity="0.32" shadow-softness="0.9" exposure="0.7" environment-image="/environments/commercial-apparel-studio-v5-front-white-20260917.hdr" tone-mapping="commerce"></model-viewer><span class="export-live-label" hidden><i></i>Live 3D preview · 360° rotation running</span><button type="button" class="export-expand" aria-label="Expand preview">⛶</button></div><div class="export-preview-caption" hidden></div></div><div class="export-options"></div></div>
      <div class="export-footer"><span class="export-status" role="status" aria-live="polite"></span><div class="export-actions"></div></div>
    </div>`;
    document.body.append(dialog);
    viewer = dialog.querySelector('#exportLiveViewer'); status = dialog.querySelector('.export-status');
    dialog.querySelector('.export-close').addEventListener('click', close);
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    dialog.addEventListener('click', e => { if (!e.target.closest('.cloz-dropdown')) exportDropdown.close(); });
    dialog.querySelector('.export-tabs').addEventListener('click', e => { const tab = e.target.closest('[data-tab]'); if (tab) switchTab(tab.dataset.tab); });
    dialog.querySelector('.export-expand').addEventListener('click', () => dialog.querySelector('.export-visual').requestFullscreen?.());
    dialog.querySelector('.export-options').addEventListener('click', handleOptionsClick);
    exportDropdown = window.ClozDropdown.bind(dialog.querySelector('.export-options'), handleDropdownChange, { isDisabled: () => state.busy });
    dialog.querySelector('.export-footer').addEventListener('click', handleAction);
  }
  function render({ refreshPreview = true } = {}) {
    hidePicker();
    stopVideoThumbnails();
    const videoGeneration = refreshPreview ? ++videoRenderGeneration : videoRenderGeneration;
    dialog.querySelectorAll('[data-tab]').forEach(el => { const selected = el.dataset.tab === state.tab; el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1; });
    const options = dialog.querySelector('.export-options');
    const footer = dialog.querySelector('.export-actions');
    const visual = dialog.querySelector('.export-visual');
    visual.classList.toggle('export-video-visual', state.tab === 'video');
    dialog.querySelector('.export-live-label').hidden = state.tab !== 'video';
    const imagePreview = state.tab === 'images';
    const caption = dialog.querySelector('.export-preview-caption');
    caption.hidden = state.tab !== 'model' && !imagePreview; caption.textContent = 'Drag to inspect the 3D model';
    if (state.tab === 'images') {
      options.innerHTML = `<div class="export-group"><h3>View layout</h3><div class="export-layout-grid">${layouts.map(([key,label]) => `<button type="button" class="export-layout ${state.layout === key ? 'selected' : ''}" data-layout="${key}" aria-label="${esc(label)}" aria-pressed="${state.layout === key}">${cardImage(key)}</button>`).join('')}</div></div>
        <div class="export-group"><h3>Background</h3>${backgroundSwatches()}</div>
        <div class="export-form-row"><div class="export-group"><h3>Format</h3><div class="export-segment"><button type="button" data-format="png" class="${state.format === 'png' ? 'selected' : ''}">PNG</button><button type="button" data-format="jpg" class="${state.format === 'jpg' ? 'selected' : ''}">JPG</button></div></div><div class="export-group"><h3>Size</h3>${window.ClozDropdown.render({ name:'size', label:'Image size', value:state.size, options:[{value:1024,label:'1024 px'},{value:2048,label:'2048 px'},{value:4096,label:'4096 px'}] })}</div></div>`;
      footer.innerHTML = '<button type="button" class="primary" data-action="image">Export image</button>';
      if (refreshPreview) updateImagePreview();
    } else if (state.tab === 'video') {
      if (refreshPreview) { state.running=false; cancelAnimationFrame(animationFrame); }
      options.innerHTML = `<div class="export-group"><h3>Animation template</h3><div class="export-video-grid">${videos.map(([key,label]) => `<button type="button" class="export-video-card ${state.video === key ? 'selected' : ''}" data-video="${key}" aria-label="${esc(label)}" aria-pressed="${state.video === key}"><span class="export-video-thumb"><video src="/videos/export-templates/${key}.mp4" poster="/videos/export-templates/${key}.jpg" muted loop playsinline preload="none" disablepictureinpicture aria-hidden="true"></video><b aria-hidden="true">▶</b></span></button>`).join('')}</div></div>
        <div class="export-form-row"><div class="export-group"><h3>Duration</h3><div class="export-segment">${[5,10,15].map(n => `<button type="button" data-duration="${n}" class="${state.duration === n ? 'selected':''}">${n}s</button>`).join('')}</div></div><div class="export-group"><h3>Quality</h3>${window.ClozDropdown.render({ name:'quality', label:'Video quality', value:state.quality, options:[{value:720,label:'720p'},{value:1080,label:'1080p'}] })}</div></div>
        <div class="export-group"><h3>Background</h3>${backgroundSwatches()}</div>
        <div class="export-group"><h3>Ratio</h3><div class="export-segment">${['1:1','9:16','16:9'].map(n => `<button type="button" data-ratio="${n}" class="${state.ratio === n ? 'selected':''}">${n}</button>`).join('')}</div></div>`;
      startVideoThumbnails(options);
      footer.innerHTML = '<button type="button" class="primary" data-action="video">Export video →</button>';
      const current = () => videoGeneration === videoRenderGeneration && dialog.open && state.tab === 'video';
      if (refreshPreview) previewRun.then(() => showVideoScene(current)).then(async () => {
        if (!current()) return;
        if (state.video === 'before-after') {
          await window.ModelDesignerExport.prepareBeforeAfterReveal(viewer);
          if (!current()) return;
        }
        if (current()) startAnimation();
      }).catch(error => { if (videoGeneration === videoRenderGeneration) setStatus(error.message, true); });
    } else if (state.tab === 'model') {
      options.innerHTML = `<div class="export-group"><h2>3D model file</h2><h3>Format</h3><div class="export-format-card selected"><strong>◉ &nbsp; GLB</strong><span>Model + textures in one file</span></div></div><div class="export-group"><h3>Include</h3><div class="export-checks"><span>✓ &nbsp; Current material</span><span>✓ &nbsp; Applied artwork</span><span>✓ &nbsp; Texture maps</span></div></div><div class="export-group export-file-info"><p>A visual 3D model for presentation and preview.</p></div>`;
      footer.innerHTML = '<button type="button" class="primary" data-action="glb">Download GLB</button>';
    } else {
      const shareUrl=state.shareUrl;
      const qrUrl=shareUrl ? `/api/share/qr?url=${encodeURIComponent(shareUrl)}` : '';
      options.innerHTML = `<div class="export-group"><h2>Share your design</h2></div><div class="export-group"><h3>Share link</h3><div class="export-link-row"><input readonly aria-label="Share link" value="${esc(shareUrl)}" placeholder="Create a link to share"><button type="button" ${shareUrl ? 'data-share-copy' : 'data-share-create'}>${shareUrl ? 'Copy link' : 'Create link'}</button></div><p class="export-share-message" role="status" aria-live="polite"></p></div>${shareUrl ? `<div class="export-qr-card"><img src="${esc(qrUrl)}" alt="QR code for share link"><div><strong>Scan to view</strong><p>Open this link on your phone.</p></div><a href="${esc(qrUrl)}" download="design-qr.svg">Download QR</a></div>` : ''}${shareUrl ? '<button type="button" class="export-revoke" data-share-revoke>Revoke link</button>' : ''}`;
      footer.innerHTML = '<button type="button" class="primary" data-action="done">Done</button>';
    }
    if (state.tab === 'images' || state.tab === 'video') previewBackground();
    else visual.style.background = '#f2f3f6';
  }
  function startVideoThumbnails(options) {
    const clips = [...options.querySelectorAll('.export-video-thumb video')];
    const visible = new Set();
    let stopped = false;
    const sync = () => {
      clips.forEach(clip => {
        if (!stopped && !thumbnailsPaused && !document.hidden && dialog.open && visible.has(clip)) {
          clip.muted = true;
          clip.play().catch(() => {}); // Keep the template-specific poster if autoplay is blocked.
        } else clip.pause();
      });
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      sync();
    }, { root: options, threshold: .1 });
    clips.forEach(clip => observer.observe(clip));
    document.addEventListener('visibilitychange', sync);
    stopVideoThumbnails = () => {
      stopped = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      clips.forEach(clip => { clip.pause(); clip.removeAttribute('src'); clip.load(); });
    };
  }
  async function syncExportLighting() {
    await window.ModelDetailRenderStandardPromise?.catch(() => null);
    const detailViewer = document.querySelector('#model3dViewer model-viewer');
    if (!detailViewer) return;
    for (const name of ['environment-image', 'shadow-intensity', 'shadow-softness', 'exposure', 'tone-mapping', 'field-of-view']) {
      const value = detailViewer.getAttribute(name);
      if (value !== null) viewer.setAttribute(name, value);
    }
    const environmentImage = detailViewer.dataset.cameraRelativeStudioLight || detailViewer.getAttribute('environment-image');
    if (environmentImage) {
      viewer.dataset.cameraRelativeStudioLight = environmentImage;
      viewer.dataset.studioLightReferenceAzimuth = detailViewer.dataset.studioLightReferenceAzimuth || '-16';
      viewer.dataset.studioLightAzimuthOffset = detailViewer.dataset.studioLightAzimuthOffset || '45';
      window.CameraRelativeStudioLight?.install(viewer, {
        environmentImage,
        referenceAzimuthDeg: Number(viewer.dataset.studioLightReferenceAzimuth),
        azimuthOffsetDeg: Number(viewer.dataset.studioLightAzimuthOffset)
      });
    }
  }
  async function useViewerSource(source) {
    if (viewer.getAttribute('src') === source && viewer.loaded) return;
    if (source !== videoSceneUrl) registeredVideoSceneUrl = null;
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(reject, new Error('3D scene loading timed out.')), 45000);
      const onLoad = () => finish(resolve);
      const onError = () => finish(reject, new Error('3D scene failed to load.'));
      function finish(callback, value) {
        clearTimeout(timer);
        viewer.removeEventListener('load', onLoad);
        viewer.removeEventListener('error', onError);
        callback(value);
      }
      viewer.addEventListener('load', onLoad);
      viewer.addEventListener('error', onError);
    });
    viewer.setAttribute('src', source);
    await loaded;
    await viewer.updateComplete;
  }
  async function readyViewer() {
    if (!window.ModelDesignerExport) await window.loadModelDesignerRuntime?.();
    if (!window.ModelDesignerExport) throw new Error('3D export is unavailable.');
    await syncExportLighting();
    await useViewerSource(config.previewModelFileUrl);
    await window.ModelDesignerExport.prepareViewer(viewer);
    await viewer.updateComplete; await waitFrame();
  }
  async function ensureBaseScene(generation) {
    if (baseSceneBlob) return true;
    if (!window.ModelDesignerExport) await window.loadModelDesignerRuntime?.();
    if (!window.ModelDesignerExport) throw new Error('3D export is unavailable.');
    const detailViewer = document.querySelector('#model3dViewer model-viewer');
    let sceneViewer = detailViewer?.loaded && detailViewer.model ? detailViewer : null;
    if (sceneViewer) {
      await syncExportLighting();
      await sceneViewer.updateComplete;
      await waitFrame();
    } else {
      await readyViewer();
      sceneViewer = viewer;
    }
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return false;
    const dimensions = sceneViewer.getDimensions();
    const center = sceneViewer.getBoundingBoxCenter();
    const scene = await sceneViewer.exportScene();
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return false;
    if (!(scene instanceof Blob) || !scene.size) throw new Error('Could not prepare the 3D scene.');
    baseDimensions = dimensions;
    baseCenter = center;
    baseSceneBlob = scene;
    return true;
  }
  async function showLiveLayout(layoutKey, generation = null) {
    if (!await ensureBaseScene(generation)) return;
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return;
    let sceneUrl = layoutSceneUrls.get(layoutKey);
    if (!sceneUrl) {
      const scene = await window.ModelExportScene.buildLayoutGlb(baseSceneBlob, layoutKey, baseDimensions, baseCenter);
      sceneUrl = URL.createObjectURL(scene);
      layoutSceneUrls.set(layoutKey, sceneUrl);
    }
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return;
    const sceneChanged = viewer.getAttribute('src') !== sceneUrl;
    await useViewerSource(sceneUrl);
    if (sceneChanged || generation !== null) {
      viewer.cameraTarget = 'auto auto auto';
      viewer.cameraOrbit = layoutKey === 'single' ? camera.front : '0deg 72deg 100%';
      viewer.jumpCameraToGoal?.();
    }
    await viewer.updateComplete;
    await waitFrame();
  }
  async function showVideoScene(isCurrent = () => true) {
    if (!await ensureBaseScene(null) || !isCurrent()) return;
    if (!videoSceneUrl) videoSceneUrl = URL.createObjectURL(baseSceneBlob);
    if (viewer.getAttribute('src') !== videoSceneUrl) {
      await useViewerSource(videoSceneUrl);
      if (!isCurrent()) return;
    }
    if (registeredVideoSceneUrl !== videoSceneUrl) {
      await window.ModelDesignerExport.registerPreparedVideoViewer(viewer);
      registeredVideoSceneUrl = videoSceneUrl;
    }
    await viewer.updateComplete;
    await waitFrame();
  }
  function clearLiveLayout() {
    viewer.removeAttribute('src');
    layoutSceneUrls.forEach(url => URL.revokeObjectURL(url));
    layoutSceneUrls.clear();
    if (videoSceneUrl) URL.revokeObjectURL(videoSceneUrl);
    videoSceneUrl = null;
    registeredVideoSceneUrl = null;
    baseSceneBlob = null;
    baseDimensions = null;
    baseCenter = null;
  }
  async function capturePreview(size) {
    const bounds = viewer.getBoundingClientRect();
    const scale = size / Math.max(bounds.width, bounds.height);
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    // model-viewer multiplies CSS dimensions by devicePixelRatio; size is already in output pixels.
    const renderPixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const orbit = viewer.getCameraOrbit();
    const target = viewer.getCameraTarget();
    const fieldOfView = viewer.fieldOfView; // Preserve the configured FOV; getFieldOfView() already includes aspect correction.
    const previous = { width: viewer.style.width, height: viewer.style.height, pointerEvents: viewer.style.pointerEvents };
    const cameraSettings = { orbit: `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`, target: `${target.x}m ${target.y}m ${target.z}m`, fieldOfView };
    try {
      viewer.style.pointerEvents = 'none';
      viewer.style.width = `${width / renderPixelRatio}px`;
      viewer.style.height = `${height / renderPixelRatio}px`;
      await waitFrame(); // Let ResizeObserver update the render surface before restoring the camera.
      viewer.cameraTarget = `${target.x}m ${target.y}m ${target.z}m`;
      viewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`;
      viewer.fieldOfView = fieldOfView;
      await viewer.updateComplete;
      viewer.jumpCameraToGoal?.();
      window.CameraRelativeStudioLight?.sync(viewer);
      await waitFrame();
      return { image: await loadImage(await window.ModelDesignerExport.capture(viewer)), width, height };
    } finally {
      Object.assign(viewer.style, previous);
      await waitFrame();
      viewer.cameraTarget = cameraSettings.target;
      viewer.cameraOrbit = cameraSettings.orbit;
      viewer.fieldOfView = cameraSettings.fieldOfView;
      await viewer.updateComplete;
      viewer.jumpCameraToGoal?.();
      window.CameraRelativeStudioLight?.sync(viewer);
      await waitFrame();
    }
  }
  function loadImage(url) { return new Promise((resolve,reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; }); }
  function paintBackground(ctx, width, height, whiteBacking = false) {
    ctx.clearRect(0, 0, width, height);
    if (whiteBacking) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    const bg = colorValue();
    if (!bg) return;
    if (state.background === 'custom' && state.pickerSpec?.mode === 'gradient') {
      const spec = state.pickerSpec;
      const angle = spec.angle * Math.PI / 180;
      const dx = Math.sin(angle), dy = -Math.cos(angle);
      const length = Math.abs(width * dx) + Math.abs(height * dy);
      const gradient = ctx.createLinearGradient(width / 2 - dx * length / 2, height / 2 - dy * length / 2, width / 2 + dx * length / 2, height / 2 + dy * length / 2);
      spec.stops.forEach(stop => gradient.addColorStop(Math.max(0, Math.min(1, stop.position / 100)), stop.color));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = state.background === 'custom' ? (state.pickerSpec?.color || state.customColor) : bg;
    ctx.globalAlpha = state.background === 'custom' ? state.opacity / 100 : 1;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  async function compose(layoutKey, size) {
    await showLiveLayout(layoutKey);
    const { image, width, height } = await capturePreview(size);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    // JPEG has no alpha channel; keep its white backing for transparent colors.
    paintBackground(ctx, width, height, state.format === 'jpg');
    ctx.drawImage(image, 0, 0, width, height);
    const mimeType = state.format === 'jpg' ? 'image/jpeg' : 'image/png';
    // Avoid oversized data URLs, which can fail as download links in embedded browsers.
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob?.size) resolve(blob);
        else reject(new Error('The image could not be encoded. Please try a smaller size.'));
      }, mimeType, .94);
    });
  }
  let previewGeneration = 0;
  let previewRun = Promise.resolve();
  function updateImagePreview() {
    const generation = ++previewGeneration;
    setStatus('Preparing 3D preview…');
    previewRun = previewRun.catch(() => {}).then(async () => {
      if (generation !== previewGeneration || !dialog.open || state.tab !== 'images') return;
      try {
        await showLiveLayout(state.layout, generation);
        if (generation !== previewGeneration || !dialog.open || state.tab !== 'images') return;
        setStatus('');
      } catch (error) {
        if (generation === previewGeneration) setStatus(error.message || 'Preview unavailable.', true);
      }
    });
  }
  function startAnimation() {
    cancelAnimationFrame(animationFrame); state.running = true;
    const label = dialog.querySelector('.export-live-label'); if (label) label.innerHTML = `<i></i>Live 3D preview · ${videos.find(v=>v[0]===state.video)?.[1]} running`;
    videoBounds = { dimensions: viewer.getDimensions(), center: viewer.getBoundingBoxCenter() };
    applyVideoPose(0);
    const started = performance.now();
    function tick(now) { if (!dialog.open || state.tab !== 'video' || !state.running) return; const p = ((now-started)/1000 % state.duration)/state.duration; applyVideoPose(p); animationFrame=requestAnimationFrame(tick); }
    animationFrame=requestAnimationFrame(tick);
  }
  let showingBefore = null;
  function applyVideoPose(p) {
    const pose = window.ModelExportVideo.sample(state.video, p);
    if (state.video === 'before-after') {
      window.ModelDesignerExport?.setBeforeAfterReveal(viewer, pose.reveal);
      dialog.querySelector('.export-live-label').innerHTML = `<i></i>Live 3D preview · ${pose.reveal < 1 ? 'Before → After' : 'After'}`;
    } else if (showingBefore !== false) {
      showingBefore = false;
      window.ModelDesignerExport?.setBeforeAfter(viewer, false);
    }
    const { center, dimensions } = videoBounds || { center: viewer.getBoundingBoxCenter(), dimensions: viewer.getDimensions() };
    viewer.cameraTarget = `${center.x + pose.target[0] * dimensions.x}m ${center.y + pose.target[1] * dimensions.y}m ${center.z + pose.target[2] * dimensions.z}m`;
    viewer.cameraOrbit = `${pose.azimuth}deg ${pose.polar}deg ${pose.distance}%`;
    viewer.jumpCameraToGoal?.();
    return pose;
  }
  function switchTab(tab) {
    if (state.busy) return;
    if (tab !== 'images') previewGeneration++;
    state.tab = tab;
    state.running = false;
    cancelAnimationFrame(animationFrame);
    showingBefore = null;
    window.ModelDesignerExport?.setBeforeAfter(viewer, false);
    if (tab !== 'video') viewer.cameraTarget = 'auto auto auto';
    render();
    if (tab !== 'images' && tab !== 'video') {
      previewRun = previewRun.catch(() => {}).then(() => readyViewer());
      previewRun.catch(error => setStatus(error.message, true));
    }
    window.trackEvent?.('export_tab_view', { tab, item_id: config.modelSlug || '' });
    if (tab === 'share' && !state.shareUrl && (/^[a-f0-9-]{36}$/i.test(new URLSearchParams(location.search).get('project') || '') || window.ModelDesignerExport?.getProjectId())) createShare();
  }
  function handleOptionsClick(e) {
    const shareInput=e.target.closest('.export-link-row input');
    if (shareInput) {
      if (state.shareUrl) copyShareLink();
      else if (state.busy) setStatus('Preparing your share link…');
      else createShare();
      return;
    }
    if (state.busy) return;
    const button=e.target.closest('button'); if (!button) return;
    if (button.dataset.layout) { state.layout=button.dataset.layout; render(); }
    else if (button.dataset.background) { state.background=button.dataset.background; render({refreshPreview:false}); if (state.background === 'custom') showPicker(dialog.querySelector('[data-background="custom"]')); else hidePicker(); }
    else if (button.dataset.format) { state.format=button.dataset.format; render({refreshPreview:false}); }
    else if (button.dataset.video) { state.video=button.dataset.video; showingBefore=null; window.ModelDesignerExport?.setBeforeAfter(viewer,false); render(); }
    else if (button.dataset.duration) { state.duration=Number(button.dataset.duration); render(); }
    else if (button.dataset.ratio) { state.ratio=button.dataset.ratio; render(); }
    else if (button.matches('[data-share-create]')) createShare();
    else if (button.matches('[data-share-revoke]')) revokeShare();
    else if (button.matches('[data-share-copy]')) copyShareLink();
  }
  function copyShareLink() {
    if (!state.shareUrl) { setStatus('Create a design link first.', true); return; }
    const input=dialog.querySelector('.export-link-row input');
    input?.focus();
    input?.select();
    if (!navigator.clipboard?.writeText) { setStatus('Link selected. Copy it with your keyboard.'); return; }
    navigator.clipboard.writeText(state.shareUrl)
      .then(() => setStatus('Link copied.'))
      .catch(() => setStatus('Link selected. Copy it with your keyboard.'));
  }
  async function createShare() {
    if (state.busy) return;
    state.busy=true;
    const createButton=dialog.querySelector('[data-share-create]');
    if (createButton) { createButton.disabled=true; createButton.textContent='Creating…'; }
    const shareInput=dialog.querySelector('.export-link-row input');
    if (shareInput) shareInput.placeholder='Preparing share link…';
    setStatus('Preparing your design…');
    try {
      await previewRun;
      if (!window.ModelDesignerExport) await window.loadModelDesignerRuntime?.();
      if (!window.ModelDesignerExport?.ensureSavedProjectForShare) throw new Error('3D sharing is unavailable. Please reload and try again.');
      const projectId=await window.ModelDesignerExport.ensureSavedProjectForShare();
      setStatus('Creating share link…');
      const base=`/api/projects/${encodeURIComponent(projectId)}/share`;
      const response=await fetch(base,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json'}});
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.error||'Link could not be created.');
      setStatus('Preparing the interactive 3D preview…');
      await readyViewer();
      const model=await window.ModelDesignerExport.exportGlb(viewer);
      const upload=await fetch(`${base}/model`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'model/gltf-binary',Accept:'application/json'},body:model});
      const uploaded=await upload.json();
      if(!upload.ok||!uploaded.success)throw new Error(uploaded.error||'3D preview could not be uploaded.');
      state.shareUrl=new URL(result.url,location.origin).href;
      render(); setStatus('Interactive 3D link created.');
    }
    catch(error){setStatus(error.message,true);}
    finally { state.busy=false; const button=dialog.querySelector('[data-share-create]'); if(button) { button.disabled=false; button.textContent='Create link'; } const input=dialog.querySelector('.export-link-row input'); if(input && !state.shareUrl) input.placeholder='Create a link to share'; }
  }
  async function revokeShare() {
    const projectId=window.ModelDesignerExport?.getProjectId(); if(!projectId)return;
    try { const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/share`,{method:'DELETE',credentials:'same-origin',headers:{Accept:'application/json'}}); if(!response.ok)throw new Error('Link could not be revoked.'); state.shareUrl=''; render(); setStatus('Link revoked.'); }
    catch(error){setStatus(error.message,true);}
  }
  function handleDropdownChange(name, value) {
    if (state.busy) return;
    if (name === 'size') state.size = Number(value);
    else if (name === 'quality') state.quality = Number(value);
  }
  async function handleAction(e) {
    const button=e.target.closest('[data-action]'); if (!button || state.busy) return;
    const action=button.dataset.action;
    if (action === 'done') { close(); return; }
    state.busy=true; dialog.querySelectorAll('.export-actions button').forEach(b=>b.disabled=true);
    try {
      await previewRun;
      if (action === 'image') {
        setStatus('Rendering image…');
        const data = await compose(state.layout, state.size);
        download(data, `${config.modelSlug || 'design'}-${state.layout}.${state.format}`);
        setStatus('Image download started.');
      } else if (action === 'glb') { setStatus('Preparing 3D model…'); await readyViewer(); const blob=await window.ModelDesignerExport.exportGlb(viewer); download(blob,`${config.modelSlug || 'design'}.glb`); setStatus('GLB downloaded.'); }
      else if (action === 'video') await recordVideo();
      window.trackEvent?.('model_export_download', { export_type: action, item_id: config.modelSlug || '' });
    } catch (error) { console.error(error); setStatus(error.message || 'Export failed. Please try again.', true); }
    finally { state.busy=false; dialog.querySelectorAll('.export-actions button').forEach(b=>b.disabled=false); }
  }
  async function recordVideo() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video recording is unavailable in this browser.');
    state.running=false; cancelAnimationFrame(animationFrame); await showVideoScene();
    if (state.video === 'before-after') await window.ModelDesignerExport.prepareBeforeAfterReveal(viewer);
    videoBounds = { dimensions: viewer.getDimensions(), center: viewer.getBoundingBoxCenter() };
    const ratio = state.ratio === '9:16' ? [9,16] : state.ratio === '1:1' ? [1,1] : [16,9];
    const canvas=document.createElement('canvas'); const edge=state.quality === 1080 ? 1080 : 720; canvas.width=Math.round(edge*ratio[0]/Math.min(...ratio)); canvas.height=Math.round(edge*ratio[1]/Math.min(...ratio));
    const ctx=canvas.getContext('2d');
    const paintFrame=(frame)=>{
      paintBackground(ctx, canvas.width, canvas.height);
      const scale=Math.min(canvas.width/frame.width,canvas.height/frame.height);
      const w=frame.width*scale,h=frame.height*scale;
      ctx.drawImage(frame,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    };
    showingBefore=null; applyVideoPose(0);
    await viewer.updateComplete;
    paintFrame(await loadImage(await window.ModelDesignerExport.capture(viewer)));
    const stream=canvas.captureStream(24);
    const needsAlpha = state.background === 'transparent' || (state.background === 'custom' && state.opacity < 100);
    const formats = needsAlpha ? ['video/webm;codecs=vp9'] : ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
    const mime=formats.find(type=>MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error(needsAlpha ? 'Transparent video requires WebM support in this browser.' : 'This browser does not support video export.');
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000}); const chunks=[]; recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
    const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(new Error('Video recording failed.'));});
    recorder.start(); const began=performance.now(); const duration=state.duration*1000;
    try { while (performance.now()-began < duration) { const p=(performance.now()-began)/duration; applyVideoPose(p); await viewer.updateComplete; await waitFrame(); paintFrame(await loadImage(await window.ModelDesignerExport.capture(viewer))); setStatus(`Recording 3D animation… ${Math.min(100,Math.round(p*100))}%`); await sleep(20); } }
    finally { recorder.stop(); await done; stream.getTracks().forEach(t=>t.stop()); }
    const extension=mime.startsWith('video/mp4')?'mp4':'webm'; download(new Blob(chunks,{type:mime}),`${config.modelSlug||'design'}-${state.video}.${extension}`); setStatus(`Video downloaded as ${extension.toUpperCase()}.`); showingBefore=null; window.ModelDesignerExport.setBeforeAfter(viewer,false); startAnimation();
  }
  function showPicker(anchor) {
    window.ModelDesignerExport?.openColorPicker(anchor, {
      container: dialog.querySelector('.export-shell'),
      value: state.customCss || state.customColor,
      onChange(value, spec) {
        state.customCss = value;
        state.pickerSpec = spec;
        state.customColor = spec.color;
        state.opacity = Number(spec.alpha);
        previewBackground();
      }
    });
  }
  function hidePicker() { window.ModelDesignerExport?.closeColorPicker?.(); }
  function open(){ if (!dialog) create(); returnFocus=document.activeElement; dialog.showModal(); document.body.classList.add('model-export-open'); state.tab='images'; state.shareUrl=''; setStatus(''); render(); window.trackEvent?.('model_export_modal_open',{item_id:config.modelSlug||''}); }
  function close(){if(!dialog?.open)return;stopVideoThumbnails();previewGeneration++;videoRenderGeneration++;previewRun=Promise.resolve();state.running=false;cancelAnimationFrame(animationFrame);exportDropdown?.close();hidePicker();dialog.close();clearLiveLayout();document.body.classList.remove('model-export-open');returnFocus?.focus?.({preventScroll:true});}
  window.ModelExportModal={open,close};
})();
