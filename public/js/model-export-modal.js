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
  const camera = { front: '-16deg 72deg 142%', back: '164deg 72deg 142%', side: '74deg 72deg 142%', other: '-106deg 72deg 142%', detail: '-20deg 67deg 88%', sleeve: '65deg 66deg 94%' };
  const state = { tab: 'images', layout: 'front-back', background: 'sand', videoBackground: 'slate', customColor: '#B9A38E', customCss: '', pickerSpec: null, opacity: 100, format: 'png', size: 2048, video: 'orbit', duration: 10, ratio: '16:9', quality: 1080, motion: 'clockwise', share: 'model', shareUrl: '', busy: false, running: false };
  let dialog, viewer, status, animationFrame = 0, returnFocus;
  let baseSceneBlob = null, baseDimensions = null;
  const layoutSceneUrls = new Map();
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const waitFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function download(data, filename) {
    const url = data instanceof Blob ? URL.createObjectURL(data) : data;
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    if (data instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function colorValue() {
    if (state.background === 'transparent') return null;
    if (state.background === 'custom') return state.customCss || state.customColor;
    return colors.find(item => item[0] === state.background)?.[2] || '#ffffff';
  }
  function setStatus(message, error = false) { if (status) { status.textContent = message; status.dataset.error = String(error); } }
  function cardImage(kind) {
    const image = esc(config.previewImageUrl);
    return `<span class="export-mini export-mini-${kind}">${(layouts.find(item => item[0] === kind)?.[2] || ['front']).map((_, i) => `<img src="${image}" alt="" style="--i:${i}">`).join('')}</span>`;
  }
  function create() {
    dialog = document.createElement('dialog'); dialog.id = 'modelExportDialog'; dialog.className = 'model-export-dialog'; dialog.setAttribute('aria-label', 'Export design');
    dialog.innerHTML = `<div class="export-shell">
      <div class="export-header"><div class="export-tabs" role="tablist" aria-label="Export options">${[['images','Images'],['video','Video'],['model','3D File'],['tryon','AI Try-on'],['share','Share']].map(([key,label]) => `<button type="button" role="tab" data-tab="${key}" aria-selected="false">${label}</button>`).join('')}</div><button class="export-close" type="button" aria-label="Close export dialog">×</button></div>
      <div class="export-main"><div class="export-preview"><div class="export-visual"><model-viewer id="exportLiveViewer" src="${esc(config.previewModelFileUrl)}" poster="${esc(config.previewImageUrl)}" alt="3D export preview" loading="eager" reveal="auto" camera-controls interaction-prompt="none" camera-orbit="${camera.front}" field-of-view="28deg" shadow-intensity="0.32" shadow-softness="0.9" exposure="0.82" environment-image="/environments/commercial-apparel-studio-v5-front-white-20260917.hdr" tone-mapping="commerce"></model-viewer><span class="export-live-label" hidden><i></i>Live 3D preview · 360° rotation running</span><button type="button" class="export-expand" aria-label="Expand preview">⛶</button></div><div class="export-preview-caption" hidden></div></div><div class="export-options"></div></div>
      <div class="export-footer"><span class="export-status" role="status" aria-live="polite"></span><div class="export-actions"></div></div>
    </div>`;
    document.body.append(dialog);
    viewer = dialog.querySelector('#exportLiveViewer'); status = dialog.querySelector('.export-status');
    dialog.querySelector('.export-close').addEventListener('click', close);
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    dialog.querySelector('.export-tabs').addEventListener('click', e => { const tab = e.target.closest('[data-tab]'); if (tab) switchTab(tab.dataset.tab); });
    dialog.querySelector('.export-expand').addEventListener('click', () => dialog.querySelector('.export-visual').requestFullscreen?.());
    dialog.querySelector('.export-options').addEventListener('click', handleOptionsClick);
    dialog.querySelector('.export-options').addEventListener('change', handleOptionsChange);
    dialog.querySelector('.export-footer').addEventListener('click', handleAction);
  }
  function render({ refreshPreview = true } = {}) {
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
      options.innerHTML = `<div class="export-group"><h3>View layout</h3><p>Choose how many views to export.</p><div class="export-layout-grid">${layouts.map(([key,label]) => `<button type="button" class="export-layout ${state.layout === key ? 'selected' : ''}" data-layout="${key}" aria-pressed="${state.layout === key}">${cardImage(key)}<span>${label}</span></button>`).join('')}</div></div>
        <div class="export-group"><h3>Background</h3><div class="export-swatches">${colors.map(([key,label,value]) => `<button type="button" class="export-swatch ${state.background === key ? 'selected' : ''}" data-background="${key}" aria-label="${label}" aria-pressed="${state.background === key}"><i style="--swatch:${key === 'custom' ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : value}"></i><span>${label}</span></button>`).join('')}</div></div>
        <div class="export-form-row"><div class="export-group"><h3>Format</h3><div class="export-segment"><button type="button" data-format="png" class="${state.format === 'png' ? 'selected' : ''}">PNG</button><button type="button" data-format="jpg" class="${state.format === 'jpg' ? 'selected' : ''}">JPG</button></div></div><div class="export-group"><h3>Size</h3><select data-size aria-label="Image size">${[1024,2048,4096].map(n => `<option value="${n}" ${state.size === n ? 'selected' : ''}>${n} px</option>`).join('')}</select></div></div>`;
      footer.innerHTML = '<button type="button" data-action="all">Export all views</button><button type="button" class="primary" data-action="image">Export image</button>';
      if (refreshPreview) updateImagePreview();
    } else if (state.tab === 'video') {
      state.running=false; cancelAnimationFrame(animationFrame);
      options.innerHTML = `<div class="export-group"><h3>Animation template</h3><div class="export-video-grid">${videos.map(([key,label],i) => `<button type="button" class="export-video-card ${state.video === key ? 'selected' : ''}" data-video="${key}" aria-pressed="${state.video === key}"><span class="export-video-thumb"><img src="${esc(config.previewImageUrl)}" alt=""><b>${['↻','⇄','⋯','⌕','↑','↕','□','◈'][i]}</b></span><span>${label}</span></button>`).join('')}</div></div><div class="export-form-row"><div class="export-group"><h3>Camera motion</h3><select data-motion><option value="clockwise" ${state.motion === 'clockwise'?'selected':''}>Orbit clockwise</option><option value="counterclockwise" ${state.motion === 'counterclockwise'?'selected':''}>Orbit counterclockwise</option></select></div><div class="export-group"><h3>Duration</h3><div class="export-segment">${[5,10,15].map(n => `<button type="button" data-duration="${n}" class="${state.duration === n ? 'selected':''}">${n}s</button>`).join('')}</div></div></div><div class="export-form-row"><div class="export-group"><h3>Ratio</h3><div class="export-segment">${['1:1','9:16','16:9'].map(n => `<button type="button" data-ratio="${n}" class="${state.ratio === n ? 'selected':''}">${n}</button>`).join('')}</div></div><div class="export-group"><h3>Background</h3><select data-video-background><option value="slate" ${state.videoBackground === 'slate'?'selected':''}>Studio gray</option><option value="white" ${state.videoBackground === 'white'?'selected':''}>White</option><option value="sand" ${state.videoBackground === 'sand'?'selected':''}>Sand</option><option value="charcoal" ${state.videoBackground === 'charcoal'?'selected':''}>Charcoal</option></select></div></div><div class="export-group"><h3>Quality</h3><select data-quality><option value="720" ${state.quality === 720?'selected':''}>720p</option><option value="1080" ${state.quality === 1080?'selected':''}>1080p</option></select></div>`;
      footer.innerHTML = '<button type="button" class="primary" data-action="video">Export video →</button>';
      previewRun.then(() => readyViewer()).then(() => { if (dialog.open && state.tab === 'video') startAnimation(); }).catch(error => setStatus(error.message,true));
    } else if (state.tab === 'model') {
      options.innerHTML = `<div class="export-group"><h2>3D model file</h2><h3>Format</h3><div class="export-format-card selected"><strong>◉ &nbsp; GLB</strong><span>Model + textures in one file</span></div></div><div class="export-group"><h3>Include</h3><div class="export-checks"><span>✓ &nbsp; Current material</span><span>✓ &nbsp; Applied artwork</span><span>✓ &nbsp; Texture maps</span></div></div><div class="export-group export-file-info"><p>A visual 3D model for presentation and preview.</p></div>`;
      footer.innerHTML = '<button type="button" class="primary" data-action="glb">Download GLB</button>';
    } else if (state.tab === 'tryon') {
      options.innerHTML = `<div class="export-group"><h2>Create an AI Try-on</h2><p>Generate a realistic try-on image with AI using your 3D design.</p></div><div class="export-tryon-illustration"><div class="export-tryon-garment"><img src="${esc(config.previewImageUrl)}" alt="Current garment"></div><span>→</span><div class="export-tryon-result"><span>◇</span>Preview appears after generation</div></div><p class="export-note">${config.aiTryOnAvailable ? 'Your 3D design will be used for the try-on.' : 'AI Try-on is currently unavailable.'}</p>`;
      footer.innerHTML = `<button type="button" class="primary" data-action="tryon" ${config.aiTryOnAvailable ? '' : 'disabled'}>Open AI Try-on →</button>`;
    } else {
      const shareUrl=getShareUrl();
      const qrUrl=shareUrl ? `/api/share/qr?url=${encodeURIComponent(shareUrl)}` : '';
      options.innerHTML = `<div class="export-group"><h2>Share your design</h2><div class="export-segment"><button type="button" data-share="model" class="${state.share === 'model'?'selected':''}">Model page</button><button type="button" data-share="design" class="${state.share === 'design'?'selected':''}">My current design</button></div><p>${state.share === 'model' ? 'Share this model page.' : 'Share an interactive, read-only view of your saved design.'}</p></div><div class="export-group"><h3>Share link</h3><div class="export-link-row"><input readonly aria-label="Share link" value="${esc(shareUrl)}" placeholder="Create a link to share"><button type="button" ${state.share === 'design' && !state.shareUrl ? 'data-share-create' : 'data-share-copy'}>${state.share === 'design' && !state.shareUrl ? 'Create link' : 'Copy link'}</button></div></div>${shareUrl ? `<div class="export-qr-card"><img src="${esc(qrUrl)}" alt="QR code for share link"><div><strong>Scan to view</strong><p>Open this link on your phone.</p></div><a href="${esc(qrUrl)}" download="design-qr.svg">Download QR</a></div>` : ''}${state.share === 'design' && !window.ModelDesignerExport?.getProjectId() ? '<p class="export-note">Save your design before creating a link. <button type="button" data-share-save>Save design</button></p>' : ''}${state.share === 'design' && state.shareUrl ? '<button type="button" class="export-revoke" data-share-revoke>Revoke link</button>' : ''}`;
      footer.innerHTML = '<button type="button" class="primary" data-action="done">Done</button>';
    }
    if (state.tab !== 'images') hidePicker();
    visual.style.background = state.tab === 'images' ? (colorValue() || 'repeating-conic-gradient(#e1e4e9 0% 25%, #fff 0% 50%) 50% / 22px 22px') : state.tab === 'video' ? (colors.find(c=>c[0]===state.videoBackground)?.[2] || '#858b95') : '#f2f3f6';
  }
  function getShareUrl() { return state.share === 'model' ? location.origin + location.pathname : state.shareUrl; }
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
  function setOrbit(name) { viewer.cameraOrbit = camera[name] || camera.front; viewer.jumpCameraToGoal?.(); }
  async function ensureBaseScene(generation) {
    if (baseSceneBlob) return true;
    await readyViewer();
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return false;
    const dimensions = viewer.getDimensions();
    const scene = await viewer.exportScene();
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return false;
    if (!(scene instanceof Blob) || !scene.size) throw new Error('Could not prepare the 3D scene.');
    baseDimensions = dimensions;
    baseSceneBlob = scene;
    return true;
  }
  async function showLiveLayout(layoutKey, generation = null) {
    if (!await ensureBaseScene(generation)) return;
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return;
    let sceneUrl = layoutSceneUrls.get(layoutKey);
    if (!sceneUrl) {
      const scene = await window.ModelExportScene.buildLayoutGlb(baseSceneBlob, layoutKey, baseDimensions);
      sceneUrl = URL.createObjectURL(scene);
      layoutSceneUrls.set(layoutKey, sceneUrl);
    }
    if (generation !== null && (generation !== previewGeneration || !dialog.open || state.tab !== 'images')) return;
    const sceneChanged = viewer.getAttribute('src') !== sceneUrl;
    await useViewerSource(sceneUrl);
    if (sceneChanged || generation !== null) {
      viewer.cameraTarget = 'auto auto auto';
      viewer.cameraOrbit = layoutKey === 'single' ? camera.front : '-16deg 72deg 100%';
      viewer.jumpCameraToGoal?.();
    }
    await viewer.updateComplete;
    await waitFrame();
  }
  function clearLiveLayout() {
    viewer.removeAttribute('src');
    layoutSceneUrls.forEach(url => URL.revokeObjectURL(url));
    layoutSceneUrls.clear();
    baseSceneBlob = null;
    baseDimensions = null;
  }
  async function captureAngle(name, dimension = 0) {
    const previousWidth = viewer.style.width;
    const previousHeight = viewer.style.height;
    if (dimension) { viewer.style.width = `${dimension}px`; viewer.style.height = `${dimension}px`; }
    try { if (name) setOrbit(name); await viewer.updateComplete; await waitFrame(); return await window.ModelDesignerExport.capture(viewer); }
    finally { viewer.style.width = previousWidth; viewer.style.height = previousHeight; }
  }
  function loadImage(url) { return new Promise((resolve,reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; }); }
  async function compose(layoutKey, size) {
    await showLiveLayout(layoutKey);
    const image = await loadImage(await captureAngle(null, size));
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const bg = colorValue(); if (bg) { if (state.background === 'custom' && state.pickerSpec?.mode === 'gradient') { const spec=state.pickerSpec; const angle=spec.angle*Math.PI/180; const dx=Math.cos(angle)*size/2,dy=Math.sin(angle)*size/2; const g=ctx.createLinearGradient(size/2-dx,size/2-dy,size/2+dx,size/2+dy); spec.stops.forEach(stop=>g.addColorStop(Math.max(0,Math.min(1,stop.position/100)),stop.color)); ctx.fillStyle=g; } else ctx.fillStyle=state.background === 'custom' ? (state.pickerSpec?.color || state.customColor) : bg; ctx.globalAlpha = state.background === 'custom' ? state.opacity / 100 : 1; ctx.fillRect(0,0,size,size); ctx.globalAlpha=1; }
    ctx.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL(state.format === 'jpg' ? 'image/jpeg' : 'image/png', .94);
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
    const started = performance.now();
    function tick(now) { if (!dialog.open || state.tab !== 'video' || !state.running) return; const p = ((now-started)/1000 % state.duration)/state.duration; applyVideoPhase(p); const deg = orbitDegrees(p); viewer.cameraOrbit = `${deg}deg ${state.video === 'detail' ? 66 : 72}deg ${state.video === 'detail' ? 95 : 142}%`; viewer.jumpCameraToGoal?.(); animationFrame=requestAnimationFrame(tick); }
    animationFrame=requestAnimationFrame(tick);
  }
  let showingBefore = null;
  function applyVideoPhase(p) {
    const before = state.video === 'before-after' && p < .5;
    if (before === showingBefore) return;
    showingBefore = before;
    window.ModelDesignerExport?.setBeforeAfter(viewer, before);
    if (state.video === 'before-after') dialog.querySelector('.export-live-label').innerHTML = `<i></i>Live 3D preview · ${before ? 'Before' : 'After'}`;
  }
  function orbitDegrees(p) {
    const reverse = state.motion === 'counterclockwise' ? -1 : 1;
    if (state.video === 'front-back') return p < .5 ? -16 : 164;
    if (state.video === 'before-after') return -16 + Math.sin(p * Math.PI * 2) * 8;
    if (state.video === 'three' || state.video === 'story') return [-16,74,164][Math.min(2,Math.floor(p*3))];
    if (state.video === 'detail') return -20 + Math.sin(p*Math.PI*2)*50;
    if (state.video === 'social') return -16 + Math.sin(p*Math.PI*2)*15;
    if (state.video === 'reveal') return 164 + 180*p*reverse;
    return -16 + 360*p*reverse;
  }
  function switchTab(tab) {
    if (state.busy) return;
    if (tab !== 'images') previewGeneration++;
    state.tab = tab;
    state.running = false;
    cancelAnimationFrame(animationFrame);
    showingBefore = null;
    window.ModelDesignerExport?.setBeforeAfter(viewer, false);
    render();
    if (tab !== 'images' && tab !== 'video') {
      previewRun = previewRun.catch(() => {}).then(() => readyViewer());
      previewRun.catch(error => setStatus(error.message, true));
    }
    window.trackEvent?.('export_tab_view', { tab, item_id: config.modelSlug || '' });
  }
  function handleOptionsClick(e) {
    if (state.busy) return;
    const button=e.target.closest('button'); if (!button) return;
    if (button.dataset.layout) { state.layout=button.dataset.layout; render(); }
    else if (button.dataset.background) { state.background=button.dataset.background; render({refreshPreview:false}); if (state.background === 'custom') showPicker(dialog.querySelector('[data-background="custom"]')); else hidePicker(); }
    else if (button.dataset.format) { state.format=button.dataset.format; render({refreshPreview:false}); }
    else if (button.dataset.video) { state.video=button.dataset.video; showingBefore=null; window.ModelDesignerExport?.setBeforeAfter(viewer,false); render(); }
    else if (button.dataset.duration) { state.duration=Number(button.dataset.duration); render(); }
    else if (button.dataset.ratio) { state.ratio=button.dataset.ratio; render(); }
    else if (button.dataset.share) { state.share=button.dataset.share; render(); }
    else if (button.matches('[data-share-create]')) createShare();
    else if (button.matches('[data-share-revoke]')) revokeShare();
    else if (button.matches('[data-share-save]')) { close(); document.getElementById('saveDesignModal')?.click(); }
    else if (button.matches('[data-share-copy]')) { const url=getShareUrl(); if (!url) { setStatus('Create a design link first.', true); return; } navigator.clipboard.writeText(url).then(()=>setStatus('Link copied.')).catch(()=>setStatus('Could not copy link.',true)); }
  }
  async function createShare() {
    if (state.busy) return;
    const projectId=window.ModelDesignerExport?.getProjectId();
    if (!projectId) { setStatus('Save your design before sharing.',true); return; }
    state.busy=true;
    dialog.querySelector('[data-share-create]').disabled=true;
    setStatus('Creating share link…');
    try {
      await previewRun;
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
    finally { state.busy=false; const button=dialog.querySelector('[data-share-create]'); if(button) button.disabled=false; }
  }
  async function revokeShare() {
    const projectId=window.ModelDesignerExport?.getProjectId(); if(!projectId)return;
    try { const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/share`,{method:'DELETE',credentials:'same-origin',headers:{Accept:'application/json'}}); if(!response.ok)throw new Error('Link could not be revoked.'); state.shareUrl=''; render(); setStatus('Link revoked.'); }
    catch(error){setStatus(error.message,true);}
  }
  function handleOptionsChange(e) { if (state.busy) return; const t=e.target; if (t.matches('[data-size]')) state.size=Number(t.value); else if (t.matches('[data-motion]')) state.motion=t.value; else if (t.matches('[data-video-background]')) { state.videoBackground=t.value; dialog.querySelector('.export-visual').style.background=colors.find(c=>c[0]===t.value)?.[2] || '#858b95'; } else if (t.matches('[data-quality]')) state.quality=Number(t.value); }
  async function handleAction(e) {
    const button=e.target.closest('[data-action]'); if (!button || state.busy) return;
    const action=button.dataset.action;
    if (action === 'done') { close(); return; }
    if (action === 'tryon') { if (!config.aiTryOnAvailable) return; close(); const link=document.getElementById('detailAiTryOnBtn'); if(link) link.click(); else location.href=config.aiTryOnPath; return; }
    state.busy=true; dialog.querySelectorAll('.export-actions button').forEach(b=>b.disabled=true);
    try {
      await previewRun;
      if (action === 'image' || action === 'all') {
        setStatus('Rendering images…'); const keys=action==='all' ? layouts.map(x=>x[0]) : [state.layout];
        try { for (const [index, key] of keys.entries()) { setStatus(`Rendering images… ${index + 1}/${keys.length}`); const data=await compose(key,state.size); download(data,`${config.modelSlug || 'design'}-${key}.${state.format}`); await sleep(180); } }
        finally { if (action === 'all') await showLiveLayout(state.layout); }
        setStatus(keys.length === 1 ? 'Image downloaded.' : `${keys.length} layouts downloaded.`);
      } else if (action === 'glb') { setStatus('Preparing 3D model…'); await readyViewer(); const blob=await window.ModelDesignerExport.exportGlb(viewer); download(blob,`${config.modelSlug || 'design'}.glb`); setStatus('GLB downloaded.'); }
      else if (action === 'video') await recordVideo();
      window.trackEvent?.('model_export_download', { export_type: action, item_id: config.modelSlug || '' });
    } catch (error) { console.error(error); setStatus(error.message || 'Export failed. Please try again.', true); }
    finally { state.busy=false; dialog.querySelectorAll('.export-actions button').forEach(b=>b.disabled=false); }
  }
  async function recordVideo() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video recording is unavailable in this browser.');
    await readyViewer(); state.running=false; cancelAnimationFrame(animationFrame);
    const ratio = state.ratio === '9:16' ? [9,16] : state.ratio === '1:1' ? [1,1] : [16,9];
    const canvas=document.createElement('canvas'); const edge=state.quality === 1080 ? 1080 : 720; canvas.width=Math.round(edge*ratio[0]/Math.min(...ratio)); canvas.height=Math.round(edge*ratio[1]/Math.min(...ratio));
    const ctx=canvas.getContext('2d');
    const paintFrame=(frame)=>{
      ctx.fillStyle=colors.find(c=>c[0]===state.videoBackground)?.[2] || '#858b95';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.min(canvas.width/frame.width,canvas.height/frame.height);
      const w=frame.width*scale,h=frame.height*scale;
      ctx.drawImage(frame,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    };
    showingBefore=null; applyVideoPhase(0);
    await viewer.updateComplete;
    paintFrame(await loadImage(await window.ModelDesignerExport.capture(viewer)));
    const stream=canvas.captureStream(24);
    const mime=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('This browser does not support video export.');
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000}); const chunks=[]; recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
    const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(new Error('Video recording failed.'));});
    recorder.start(); const began=performance.now(); const duration=state.duration*1000;
    try { while (performance.now()-began < duration) { const p=(performance.now()-began)/duration; applyVideoPhase(p); viewer.cameraOrbit=`${orbitDegrees(p)}deg ${state.video==='detail'?66:72}deg ${state.video==='detail'?95:142}%`; viewer.jumpCameraToGoal?.(); await viewer.updateComplete; await waitFrame(); const frame=await loadImage(await window.ModelDesignerExport.capture(viewer)); paintFrame(frame); setStatus(`Recording 3D animation… ${Math.min(100,Math.round(p*100))}%`); await sleep(20); } }
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
        dialog.querySelector('.export-visual').style.background = colorValue();
      }
    });
  }
  function hidePicker() { window.ModelDesignerExport?.closeColorPicker?.(); }
  function open(){ if (!dialog) create(); returnFocus=document.activeElement; dialog.showModal(); document.body.classList.add('model-export-open'); state.tab='images'; render(); window.trackEvent?.('model_export_modal_open',{item_id:config.modelSlug||''}); }
  function close(){if(!dialog?.open)return;previewGeneration++;previewRun=Promise.resolve();state.running=false;cancelAnimationFrame(animationFrame);hidePicker();dialog.close();clearLiveLayout();document.body.classList.remove('model-export-open');returnFocus?.focus?.({preventScroll:true});}
  window.ModelExportModal={open,close};
})();
