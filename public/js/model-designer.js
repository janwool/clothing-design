// Design Modal runtime — downloaded only after a design or export action.
(() => {
  'use strict';
  const modelDesignerConfig = window.ModelDesignerConfig || {};
window.initializeModelDesigner = () => {
  const designNowBtn = document.getElementById('designNowBtn');
  const designModal = document.getElementById('designModal');
  const designModalOverlay = document.getElementById('designModalOverlay');
  const designModalClose = document.getElementById('designModalClose');
  const saveDesignModal = document.getElementById('saveDesignModal');
  const aiTryOnLinks = [...document.querySelectorAll('[data-ai-try-on-link]')];
  const designSaveStatus = document.getElementById('designSaveStatus');
  const designSaveStatusText = document.getElementById('designSaveStatusText');
  const renderCurrentModelBtn = document.getElementById('renderCurrentModelBtn');
  const downloadRenderStatus = document.getElementById('downloadRenderStatus');
  const designCtaBtn = document.getElementById('designCtaBtn');
  const customizationInquiryBtn = document.getElementById('customizationInquiryBtn');
  const customizationInquiryModal = document.getElementById('customizationInquiryModal');
  const customizationInquiryOverlay = document.getElementById('customizationInquiryOverlay');
  const customizationInquiryClose = document.getElementById('customizationInquiryClose');
  const customizationInquiryCancel = document.getElementById('customizationInquiryCancel');
  const customizationInquiryDone = document.getElementById('customizationInquiryDone');
  const customizationInquiryForm = document.getElementById('customizationInquiryForm');
  const customizationInquirySubmit = document.getElementById('customizationInquirySubmit');
  const customizationInquiryStatus = document.getElementById('customizationInquiryStatus');
  const customizationInquirySuccess = document.getElementById('customizationInquirySuccess');
  const customizationInquiryReference = document.getElementById('customizationInquiryReference');
  const customizationRefreshSnapshots = document.getElementById('customizationRefreshSnapshots');
  const customizationPreview3d = document.getElementById('customizationPreview3d');
  const customizationPreview2d = document.getElementById('customizationPreview2d');
  const customizationPreview3dLoading = document.getElementById('customizationPreview3dLoading');
  const customizationPreview2dLoading = document.getElementById('customizationPreview2dLoading');
  const designerViewer = document.getElementById('designerViewer');
  const designPreviewLoading = document.getElementById('designPreviewLoading');
  const detailViewer = document.querySelector('#model3dViewer model-viewer');
  const textureCanvasArea = document.querySelector('.texture-canvas-area');
  const textureCanvasFrame = document.getElementById('textureCanvasFrame');
  const textureSvg = document.getElementById('textureSvg');
  const textureElements = document.getElementById('textureElements');
  const texturePattern = document.getElementById('texturePattern');
  const selectionLayer = document.getElementById('selectionLayer');
  const materialSwatchGrid = document.getElementById('materialSwatchGrid');
  const materialCount = document.getElementById('materialCount');
  const canvasZoomOut = document.getElementById('canvasZoomOut');
  const canvasZoomIn = document.getElementById('canvasZoomIn');
  const canvasZoomFit = document.getElementById('canvasZoomFit');
  const canvasZoomLabel = document.getElementById('canvasZoomLabel');
  const canvasRotate = document.getElementById('canvasRotate');
  const textureDesigner = document.querySelector('.design-modal .texture-designer');
  const designViewSwitcher = document.getElementById('designViewSwitcher');
  const imageAssetTray = document.getElementById('imageAssetTray');
  const imageAssetViewport = document.getElementById('imageAssetViewport');
  const imageAssetTrack = document.getElementById('imageAssetTrack');
  const imageAssetUpload = document.getElementById('imageAssetUpload');
  const imageAssetUploadInput = document.getElementById('imageAssetUploadInput');
  const imageAssetClose = document.getElementById('imageAssetClose');
  const imageAssetFilter = document.getElementById('imageAssetFilter');
  const assetScrollPrev = document.getElementById('assetScrollPrev');
  const assetScrollNext = document.getElementById('assetScrollNext');
  const imageAssetProgress = document.getElementById('imageAssetProgress');
  const imageUploadToast = document.getElementById('imageUploadToast');
  const imageUploadToastText = document.getElementById('imageUploadToastText');
  const designAppearancePanel = document.getElementById('designAppearancePanel');
  const appearancePanelCollapse = document.getElementById('appearancePanelCollapse');
  const toolAppearance = document.getElementById('toolAppearance');
  const appearanceColorStart = document.getElementById('appearanceColorStart');
  const appearanceColorEnd = document.getElementById('appearanceColorEnd');
  const appearanceGradientAngle = document.getElementById('appearanceGradientAngle');
  const appearanceGradientAngleOutput = document.getElementById('appearanceGradientAngleOutput');
  const appearanceGradientPreview = document.getElementById('appearanceGradientPreview');
  const elementToolbar = document.createElement('div');
  elementToolbar.className = 'element-toolbar is-canvas-centered';
  elementToolbar.dataset.editorToolbar = 'true';
  textureCanvasArea.appendChild(elementToolbar);
  const colorPopover = document.createElement('div');
  colorPopover.className = 'color-popover';
  colorPopover.dataset.editorToolbar = 'true';
  textureCanvasArea.appendChild(colorPopover);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const defaultTextContent = modelDesignerConfig.defaultTextContent || 'Text';
  const currentModelCategory = modelDesignerConfig.currentModelCategory || '';
  const materialPreviewUrls = {
    'cotton-jersey': '/images/material-previews/cotton.webp',
    'rib-knit': '/images/material-previews/jersey.webp',
    'french-terry': '/images/material-previews/french-terry.webp',
    fleece: '/images/material-previews/fleece.webp',
    poplin: '/images/material-previews/poplin.webp',
    linen: '/images/material-previews/linen.webp',
    denim: '/images/material-previews/denim.webp',
    twill: '/images/material-previews/twill.webp',
    'wool-blend': '/images/material-previews/wool-blend.webp',
    'nylon-ripstop': '/images/material-previews/nylon-ripstop.webp',
    'satin-silk': '/images/material-previews/satin.webp',
    velvet: '/images/material-previews/velvet.webp'
  };
  const minSize = 12;
  const editorTransforms = window.ModelDesignerTransforms;
  if (!editorTransforms) throw new Error('Editor transform helpers are unavailable');
  const {
    clampRectToBounds,
    placeRectAtFixedAnchor,
    resizeCursor,
    resizeFromPointer
  } = editorTransforms;
  const defaultRenderStandard = {
    camera: {
      webOrbit: '-16deg 72deg 142%',
      webEditorOrbit: '-12deg 72deg 158%',
      webFieldOfView: '28deg',
      webTarget: 'auto auto auto'
    },
    web: {
      environmentImage: '/environments/commercial-apparel-studio-v5-front-white-20260917.hdr',
      lightingMode: 'camera-relative-45deg-white-softbox',
      sourceEnvironment: '/environments/commercial-apparel-studio-v2-20260829.hdr',
      balanceMethod: 'camera-relative-azimuth',
      cameraRelativeLighting: true,
      lightReferenceAzimuthDeg: -16,
      lightAzimuthOffsetDeg: 45,
      lightColor: '#ffffff',
      environmentNeutralization: 'luminance-preserving-monochrome',
      shadowIntensity: 0.32,
      shadowSoftness: 0.9,
      exportShadowIntensity: 0.46,
      exportShadowSoftness: 0.88,
      exportExposure: 0.82,
      exportToneMapping: 'commerce',
      exposure: 0.82,
      toneMapping: 'commerce',
      exportMaterial: {
        roughness: 0.72,
        specularIorLevel: 0.4,
        sheenWeight: 0.22,
        sheenRoughness: 0.82,
        normalScale: 0.24
      },
      exportComposition: {
        width: 1200,
        height: 1500,
        backgroundTop: '#faf9f6',
        backgroundBottom: '#e8e5de',
        spotlight: 'rgba(255, 255, 255, 0.96)',
        floorShadow: 'rgba(29, 27, 24, 0.3)',
        contrast: 1.08,
        saturation: 1.02
      }
    }
  };
  const renderStandardPromise = window.ModelDetailRenderStandardPromise || fetch('/config/design3d-render-standard.json?v=20260917-white-45deg-v9')
    .then((response) => response.ok ? response.json() : defaultRenderStandard)
    .catch(() => defaultRenderStandard);
  const state = {
    tool: 'select',
    selected: null,
    selectedTemplatePath: null,
    active: null,
    textClickCandidate: null,
    elementCounter: 0,
    history: [],
    historyIndex: -1,
    svgWidth: 1024,
    svgHeight: 1024,
    artworkTextureTransform: null,
    zoom: 1,
    zoomMode: 'fit',
    canvasRotation: 0,
    textureLoadPromise: null,
    textureUpdateTimer: null,
    textureUpdateId: 0,
    hoverTextureTimer: null,
    hoverTextureUpdateId: 0,
    hoveredTemplatePath: null,
    hoverMaterialSnapshot: null,
    textEditor: null,
    colorPicker: null,
    selectedMaterial: null,
    appliedTextureUrl: null,
    pendingTextureUrl: null,
    materialTextureCache: new WeakMap(),
    finalTextureUrl: null,
    detailSceneUrl: null,
    isExportingRender: false,
    isCapturingInquiry: false,
    isSubmittingInquiry: false,
    inquirySnapshots: null,
    coverCaptureHidden: [],
    fillScope: 'whole',
    fillMode: 'gradient',
    designView: '2d',
    projectId: '',
    projectName: '',
    uploadedAssetUrls: new Map(),
    pendingArtworkUploads: new Set()
  };
  const tryOnDesignTransferKey = 'clozdesign_tryon_design_v1';

  function persistTryOnDesign(textureUrl = state.finalTextureUrl || state.appliedTextureUrl) {
    if (!textureUrl) return false;
    try {
      sessionStorage.setItem(tryOnDesignTransferKey, JSON.stringify({
        modelId: String(modelDesignerConfig.modelId || ''),
        modelSlug: String(modelDesignerConfig.modelSlug || ''),
        projectId: state.projectId || '',
        textureUrl,
        textureTransform: state.artworkTextureTransform,
        createdAt: Date.now()
      }));
      return true;
    } catch (error) {
      console.warn('The current design is too large for a browser handoff:', error);
      return false;
    }
  }

  function prepareTryOnNavigation() {
    persistTryOnDesign();
    window.syncModelTryOnLinks?.(state.projectId);
  }

  aiTryOnLinks.forEach((link) => link.addEventListener('click', prepareTryOnNavigation));
  const renderedUploadedAssetKeys = new Set();
  let imageUploadToastTimer = null;
  let modalReturnFocus = null;
  let customizationReturnFocus = null;
  let cloudProjectLoadPromise = Promise.resolve();

  function getLoadedDesignViewers() {
    return [designerViewer, detailViewer].filter((viewerElement) => viewerElement?.model);
  }

  const toolButtons = {
    select: document.getElementById('toolSelect'),
    pan: document.getElementById('toolPan'),
    draw: document.getElementById('toolDraw'),
    text: document.getElementById('toolText'),
    image: document.getElementById('toolImage'),
    shape: document.getElementById('toolShape'),
    arrow: null
  };

  function setDesignSaveStatus(text, isDirty = false) {
    if (designSaveStatusText) designSaveStatusText.textContent = text;
    designSaveStatus?.classList.toggle('is-dirty', isDirty);
  }

  function showImageUploadToast(message, status = 'loading', hideAfter = 0) {
    if (!imageUploadToast || !imageUploadToastText) return;
    if (imageUploadToastTimer) window.clearTimeout(imageUploadToastTimer);
    imageUploadToastText.textContent = message;
    imageUploadToast.dataset.status = status;
    imageUploadToast.hidden = false;
    if (hideAfter > 0) {
      imageUploadToastTimer = window.setTimeout(() => {
        imageUploadToast.hidden = true;
        imageUploadToastTimer = null;
      }, hideAfter);
    }
  }

  function applyCanvasZoom(nextZoom, mode = 'manual') {
    const zoom = Math.min(2.5, Math.max(0.2, Number(nextZoom) || 1));
    state.zoom = zoom;
    state.zoomMode = mode;
    textureSvg.style.width = `${state.svgWidth * zoom}px`;
    textureSvg.style.height = `${state.svgHeight * zoom}px`;
    textureSvg.style.maxWidth = 'none';
    textureSvg.style.maxHeight = 'none';
    textureSvg.style.setProperty('--canvas-rotation', `${state.canvasRotation}deg`);
    if (textureCanvasFrame) {
      const isQuarterTurn = state.canvasRotation % 180 !== 0;
      textureCanvasFrame.style.width = `${(isQuarterTurn ? state.svgHeight : state.svgWidth) * zoom}px`;
      textureCanvasFrame.style.height = `${(isQuarterTurn ? state.svgWidth : state.svgHeight) * zoom}px`;
    }
    if (canvasZoomLabel) canvasZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    requestAnimationFrame(() => renderSelection());
  }

  function fitCanvasZoom() {
    if (!textureCanvasArea || !state.svgWidth || !state.svgHeight) return;
    const isCompact = window.matchMedia('(max-width: 900px)').matches;
    const availableWidth = Math.max(160, textureCanvasArea.clientWidth - (isCompact ? 28 : 48));
    const availableHeight = Math.max(120, textureCanvasArea.clientHeight - (isCompact ? 118 : 154));
    const isQuarterTurn = state.canvasRotation % 180 !== 0;
    const canvasWidth = isQuarterTurn ? state.svgHeight : state.svgWidth;
    const canvasHeight = isQuarterTurn ? state.svgWidth : state.svgHeight;
    const fitScale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight, 1.4);
    applyCanvasZoom(fitScale, 'fit');
  }

  function rotateCanvas() {
    state.canvasRotation = (state.canvasRotation + 90) % 360;
    if (canvasRotate) {
      canvasRotate.classList.toggle('active', state.canvasRotation !== 0);
      canvasRotate.setAttribute(
        'aria-label',
        `Rotate canvas clockwise. Current rotation: ${state.canvasRotation} degrees`
      );
    }
    closeColorPopover();
    if (state.zoomMode === 'fit') fitCanvasZoom();
    else applyCanvasZoom(state.zoom);
    window.setTimeout(() => {
      renderSelection();
      positionElementToolbar();
    }, 190);
  }

  async function openModal() {
    modalReturnFocus = document.activeElement;
    await Promise.all([loadTextureDimensions(), cloudProjectLoadPromise]);
    if (state.zoomMode === 'fit') fitCanvasZoom();
    else applyCanvasZoom(state.zoom);
    renderSelection();
    designModal.classList.add('active');
    designModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderStandardPromise.then((renderStandard) => applyFabricLighting(designerViewer, renderStandard));
    if (designPreviewLoading && !designerViewer?.loaded) designPreviewLoading.hidden = false;
    window.loadClothingModelViewer?.(designerViewer)
      .then(() => {
        if (designPreviewLoading) designPreviewLoading.hidden = true;
        if (state.pendingTextureUrl) {
          applyTextureToModel(state.pendingTextureUrl, state.textureUpdateId);
        } else if (hasEditableArtwork()) {
          scheduleTexturePreviewUpdate();
        }
      })
      .catch((error) => {
        if (designPreviewLoading) designPreviewLoading.hidden = true;
        console.warn('Failed to load the design preview:', error);
      });
    requestAnimationFrame(() => {
      designModalClose?.focus({ preventScroll: true });
    });
  }

  function hexToRgbUnit(hex) {
    const normalized = String(hex || '#ffffff').replace('#', '').trim();
    const safe = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : 'ffffff';
    const value = parseInt(safe, 16);
    return [
      ((value >> 16) & 255) / 255,
      ((value >> 8) & 255) / 255,
      (value & 255) / 255
    ];
  }

  function getDesignedTextureFactor() {
    // The rasterized design already contains the chosen solid/gradient colors.
    // Keep its factor neutral so a previously selected fabric cannot tint it.
    return [1, 1, 1, 1];
  }

  function getViewerTextureCache(viewerElement) {
    let cache = state.materialTextureCache.get(viewerElement);
    if (!cache) {
      cache = new Map();
      state.materialTextureCache.set(viewerElement, cache);
    }
    return cache;
  }

  async function getMaterialMapTexture(viewerElement, material, mapName) {
    const url = material?.maps?.[mapName];
    if (!viewerElement || !url || typeof viewerElement.createTexture !== 'function') return null;
    const cache = getViewerTextureCache(viewerElement);
    const key = `${material.id}:${mapName}`;
    if (cache.has(key)) return cache.get(key);
    const texturePromise = viewerElement.createTexture(url).catch((error) => {
      cache.delete(key);
      console.warn(`Failed to load ${mapName} map for ${material.id}:`, error);
      return null;
    });
    cache.set(key, texturePromise);
    return texturePromise;
  }

  function setMaterialTextureSlot(slot, texture) {
    if (!slot || !texture) return false;
    if (typeof slot.setTexture === 'function') {
      slot.setTexture(texture);
      return true;
    }
    return false;
  }

  function setFabricTextureRepeat(textureInfo, repeat = 1) {
    const sampler = textureInfo?.texture?.sampler;
    if (!sampler || !Number.isFinite(repeat) || repeat <= 0) return;
    sampler.setScale?.({ u: repeat, v: repeat });
  }

  function applyFabricSurfaceResponse(modelMaterial, material) {
    const sheenStrength = Math.max(0, Math.min(1, material.sheen ?? 0.2));
    const sheenColor = [sheenStrength, sheenStrength, sheenStrength];
    // Scene Graph exposes these setters even when a GLB omits the corresponding
    // optional extension. In that case a setter can throw; fabric enhancement
    // must never prevent the base-color texture from being applied.
    try {
      modelMaterial.setSheenColorFactor?.(sheenColor);
      modelMaterial.setSheenRoughnessFactor?.(material.sheenRoughness ?? 0.8);
    } catch (error) {
      // The current material does not support KHR_materials_sheen.
    }
    try {
      modelMaterial.setSpecularFactor?.(material.specular ?? 0.42);
      modelMaterial.setSpecularColorFactor?.([1, 1, 1]);
    } catch (error) {
      // The current material does not support KHR_materials_specular.
    }
  }

  function applyCommercialExportMaterialResponse(viewerElement, renderStandard = defaultRenderStandard) {
    if (!viewerElement?.model || state.selectedMaterial || renderStandard.web?.preserveNativeMaterials) return;
    const materialStandard = {
      ...defaultRenderStandard.web.exportMaterial,
      ...(renderStandard.web?.exportMaterial || {})
    };
    (viewerElement.model.materials || []).forEach((material) => {
      const pbr = material.pbrMetallicRoughness;
      pbr?.setMetallicFactor?.(0);
      if (!pbr?.metallicRoughnessTexture?.texture) {
        pbr?.setRoughnessFactor?.(materialStandard.roughness ?? 0.72);
      }
      applyFabricSurfaceResponse(material, {
        sheen: materialStandard.sheenWeight ?? 0.22,
        sheenRoughness: materialStandard.sheenRoughness ?? 0.82,
        specular: materialStandard.specularIorLevel ?? 0.4
      });
      if (material.normalTexture?.texture) {
        material.normalTexture.setScale?.(materialStandard.normalScale ?? 0.24);
      }
    });
    viewerElement.requestUpdate?.();
  }

  function applyFabricLighting(viewerElement, renderStandard = defaultRenderStandard) {
    if (!viewerElement) return;
    const webStandard = renderStandard.web || defaultRenderStandard.web;
    const cameraStandard = renderStandard.camera || defaultRenderStandard.camera;
    viewerElement.setAttribute('environment-image', webStandard.environmentImage || defaultRenderStandard.web.environmentImage);
    if (webStandard.cameraRelativeLighting !== false) {
      viewerElement.dataset.cameraRelativeStudioLight = webStandard.environmentImage || defaultRenderStandard.web.environmentImage;
      viewerElement.dataset.studioLightReferenceAzimuth = String(webStandard.lightReferenceAzimuthDeg ?? -16);
      viewerElement.dataset.studioLightAzimuthOffset = String(webStandard.lightAzimuthOffsetDeg ?? 0);
      window.CameraRelativeStudioLight?.install(viewerElement, {
        environmentImage: viewerElement.dataset.cameraRelativeStudioLight,
        referenceAzimuthDeg: Number(viewerElement.dataset.studioLightReferenceAzimuth),
        azimuthOffsetDeg: Number(viewerElement.dataset.studioLightAzimuthOffset)
      });
    }
    viewerElement.setAttribute('shadow-intensity', String(webStandard.shadowIntensity ?? 0.32));
    viewerElement.setAttribute('shadow-softness', String(webStandard.shadowSoftness ?? 0.9));
    viewerElement.setAttribute('exposure', String(webStandard.exposure ?? 0.82));
    viewerElement.setAttribute('tone-mapping', webStandard.toneMapping || 'commerce');
    viewerElement.setAttribute('camera-target', cameraStandard.webTarget || 'auto auto auto');
    viewerElement.setAttribute('field-of-view', cameraStandard.webFieldOfView || '28deg');
    const cameraOrbit = viewerElement.id === 'designerViewer'
      ? cameraStandard.webEditorOrbit || '-12deg 72deg 158%'
      : cameraStandard.webOrbit || '-16deg 72deg 142%';
    viewerElement.setAttribute('camera-orbit', cameraOrbit);
    viewerElement.autoRotate = false;
    viewerElement.removeAttribute('auto-rotate');
    viewerElement.jumpCameraToGoal?.();
  }

  function applyArtworkTextureTransform(textureInfo) {
    const sampler = textureInfo?.texture?.sampler;
    if (!sampler) return;
    // Fabric maps in the source GLB may intentionally tile. Designed artwork uses
    // either the ordinary 0..1 UV canvas or the approved library's normalized
    // preview of raw (u, -v) SVG coordinates.
    sampler.setRotation?.(null);
    sampler.setScale?.(state.artworkTextureTransform?.scale || null);
    sampler.setOffset?.(state.artworkTextureTransform?.offset || null);
  }

  function hasEditableArtwork() {
    return Boolean(
      textureElements?.children.length > 0 ||
      textureSvg?.querySelector('.texture-template-fill[data-persistent="true"]')
    );
  }

  async function loadMaterialMaps(viewerElement, material, options = {}) {
    const maps = {};
    const mapNames = options.includeBaseColorMap !== false
      ? ['baseColor', 'normal', 'roughness']
      : ['normal', 'roughness'];
    await Promise.all(mapNames.map(async (mapName) => {
      maps[mapName] = await getMaterialMapTexture(viewerElement, material, mapName);
    }));
    return maps;
  }

  async function applyMaterialToViewer(viewerElement, material, options = {}) {
    if (!viewerElement || !material) return;
    try {
      await waitForModelViewerReady(viewerElement);
      const materials = viewerElement.model?.materials || [];
      const maps = await loadMaterialMaps(viewerElement, material, {
        includeBaseColorMap: options.includeBaseColorMap !== false
      });
      const colorFactor = maps.baseColor ? [1, 1, 1, 1] : [...hexToRgbUnit(material.color), 1];
      materials.forEach((modelMaterial) => {
        const pbr = modelMaterial.pbrMetallicRoughness;
        pbr?.setBaseColorFactor?.(colorFactor);
        pbr?.setMetallicFactor?.(material.metalness ?? 0);
        pbr?.setRoughnessFactor?.(material.roughness ?? 0.8);
        applyFabricSurfaceResponse(modelMaterial, material);
        if (maps.baseColor) {
          if (!setMaterialTextureSlot(pbr?.baseColorTexture, maps.baseColor)) {
            pbr?.setBaseColorTexture?.(maps.baseColor);
          }
          setFabricTextureRepeat(pbr?.baseColorTexture, material.textureRepeat);
        }
        setMaterialTextureSlot(modelMaterial.normalTexture, maps.normal);
        modelMaterial.normalTexture?.setScale?.(material.normalScale ?? 0.1);
        setFabricTextureRepeat(modelMaterial.normalTexture, material.textureRepeat);
        if (maps.roughness) {
          setMaterialTextureSlot(pbr?.metallicRoughnessTexture, maps.roughness);
          setFabricTextureRepeat(pbr?.metallicRoughnessTexture, material.textureRepeat);
        }
      });
      await window.ExportEntitlements?.applyModelViewerWatermark?.(viewerElement, { force: true });
    } catch (error) {
      console.warn('Failed to apply material preset:', error);
    }
  }

  async function applyMaterialPreset(material) {
    state.selectedMaterial = material;
    setDesignSaveStatus('Unapplied changes', true);
    materialSwatchGrid?.querySelectorAll('.material-swatch').forEach((button) => {
      const isActive = button.dataset.materialId === material.id;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    const loadedViewers = getLoadedDesignViewers();
    await Promise.all(loadedViewers.map((viewerElement) => applyMaterialToViewer(viewerElement, material)));
    if (state.appliedTextureUrl) {
      await Promise.all(loadedViewers.map((viewerElement) => applyTextureToViewer(viewerElement, state.appliedTextureUrl)));
    }
  }

  function renderMaterialSwatches() {
    if (!materialSwatchGrid || !window.Design3DMaterials) return;
    const categoryInputs = [
      currentModelCategory,
      modelDesignerConfig.categorySlug || '',
      modelDesignerConfig.categoryLabel || ''
    ];
    const categoryMaterials = categoryInputs
      .map(value => window.Design3DMaterials.getMaterialsForCategory(value))
      .find(items => items.length > 0) || [];
    const generatedMaterials = window.Design3DMaterials.getGeneratedMaterials?.()
      || window.Design3DMaterials.materials.filter(material => material.generated);
    const materials = [...categoryMaterials.filter(material => material.generated), ...generatedMaterials]
      .filter((material, index, items) => items.findIndex(item => item.id === material.id) === index);
    materialSwatchGrid.innerHTML = '';
    if (materialCount) materialCount.textContent = String(materials.length);
    materials.forEach((material) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'material-swatch';
      button.dataset.materialId = material.id;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', material.name);
      button.innerHTML = `
        <span class="material-swatch-preview" aria-hidden="true"></span>
        <span class="material-swatch-name">${material.name}</span>
      `;
      const preview = button.querySelector('.material-swatch-preview');
      preview.style.backgroundColor = material.color;
      preview.style.backgroundImage = `url("${materialPreviewUrls[material.id] || material.maps.baseColor}")`;
      button.addEventListener('click', () => applyMaterialPreset(material));
      materialSwatchGrid.appendChild(button);
    });
  }

  function parseSvgLength(value) {
    if (!value) return NaN;
    const match = value.trim().match(/^([\d.]+)\s*(px|mm|cm|in|pt|pc|em|ex|%)?$/i);
    if (!match) return NaN;
    const num = parseFloat(match[1]);
    if (isNaN(num)) return NaN;
    const unit = (match[2] || 'px').toLowerCase();
    switch (unit) {
      case 'mm': return num * 3.779527559;
      case 'cm': return num * 37.79527559;
      case 'in': return num * 96;
      case 'pt': return num * 1.333333333;
      case 'pc': return num * 16;
      case '%': return NaN;
      default: return num;
    }
  }

  function resolveTextureCanvasDimensions(svgText) {
    const svgTag = svgText.match(/<svg\b[^>]*>/i)?.[0] || '';
    const widthMatch = svgTag.match(/\swidth=["']([^"']+)["']/i);
    const heightMatch = svgTag.match(/\sheight=["']([^"']+)["']/i);
    const viewBoxMatch = svgTag.match(/\sviewBox=["']([^"']+)["']/i);
    let width = parseSvgLength(widthMatch ? widthMatch[1] : null);
    let height = parseSvgLength(heightMatch ? heightMatch[1] : null);
    const hasExplicitWidth = Number.isFinite(width) && width > 0;
    const hasExplicitHeight = Number.isFinite(height) && height > 0;
    let viewBoxWidth = NaN;
    let viewBoxHeight = NaN;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(parseFloat);
      if (parts.length >= 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
        viewBoxWidth = parts[2];
        viewBoxHeight = parts[3];
      }
    }

    if (!hasExplicitWidth || !hasExplicitHeight) {
      const hasValidViewBox = Number.isFinite(viewBoxWidth) && Number.isFinite(viewBoxHeight);
      if (hasValidViewBox) {
        const aspectRatio = viewBoxWidth / viewBoxHeight;
        const longEdge = 1024;
        if (!hasExplicitWidth && !hasExplicitHeight) {
          width = aspectRatio >= 1 ? longEdge : longEdge * aspectRatio;
          height = aspectRatio >= 1 ? longEdge / aspectRatio : longEdge;
        } else if (!hasExplicitWidth) {
          width = height * aspectRatio;
        } else {
          height = width / aspectRatio;
        }
      }
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return { width: 1024, height: 1024 };
    }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  // Load SVG texture dimensions dynamically
  function loadTextureDimensions() {
    if (state.textureLoadPromise) return state.textureLoadPromise;
    const textureUrl = modelDesignerConfig.textureUrl || '';
    if (!textureUrl) {
      setSvgDimensions(800, 600);
      state.textureLoadPromise = Promise.resolve();
      return state.textureLoadPromise;
    }
    const proxyTextureUrl = textureUrl.startsWith('/uploads/texture/')
      ? textureUrl.split(/[?#]/, 1)[0]
      : textureUrl;
    const svgFetchUrl = `/api/texture-svg?url=${encodeURIComponent(proxyTextureUrl)}`;

    // Method 1: Try to get dimensions from SVG text content directly
    state.textureLoadPromise = fetch(svgFetchUrl)
      .then(response => {
        if (!response.ok) throw new Error('Failed to load texture SVG');
        return response.text();
      })
      .then(svgText => {
        const { width, height } = resolveTextureCanvasDimensions(svgText);
        setSvgDimensions(width, height);
        inlineTextureTemplate(svgText);
      })
      .catch(() => new Promise(resolve => {
        // Method 2: Fallback to Image object if fetch fails (CORS)
        const img = new Image();
        img.onload = function() {
          setSvgDimensions(this.naturalWidth || 800, this.naturalHeight || 600);
          resolve();
        };
        img.onerror = function() {
          setSvgDimensions(800, 600);
          resolve();
        };
        img.src = textureUrl;
      }));
    return state.textureLoadPromise;
  }

  function setSvgDimensions(width, height) {
    state.svgWidth = width;
    state.svgHeight = height;
    textureSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    textureSvg.style.width = width + 'px';
    textureSvg.style.height = height + 'px';

    const textureBg = document.getElementById('textureBg');
    const textureWhiteBase = document.getElementById('textureWhiteBase');
    const textureBgText = document.getElementById('textureBgText');

    if (textureWhiteBase) {
      textureWhiteBase.setAttribute('width', width);
      textureWhiteBase.setAttribute('height', height);
    }

    if (textureBg) {
      if (textureBg.tagName === 'image') {
        textureBg.setAttribute('width', width);
        textureBg.setAttribute('height', height);
      } else if (textureBg.tagName === 'rect') {
        textureBg.setAttribute('width', width);
        textureBg.setAttribute('height', height);
      }
    }

    if (texturePattern) {
      texturePattern.setAttribute('width', width);
      texturePattern.setAttribute('height', height);
    }

    const textureTemplateLayer = document.getElementById('textureTemplateLayer');
    if (textureTemplateLayer && textureTemplateLayer.dataset.viewBox) {
      applyTemplateLayerTransform(textureTemplateLayer);
    }
    if (textureBgText) {
      textureBgText.setAttribute('x', width / 2);
      textureBgText.setAttribute('y', height / 2);
    }
    renderSelection();
    scheduleTexturePreviewUpdate({ requireArtwork: true });
    requestAnimationFrame(() => {
      if (state.zoomMode === 'fit') fitCanvasZoom();
      else applyCanvasZoom(state.zoom);
    });
  }

  function parseSvgViewBox(sourceSvg) {
    const viewBox = sourceSvg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(parseFloat);
      if (parts.length >= 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
        return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
      }
    }
    const width = parseSvgLength(sourceSvg.getAttribute('width'));
    const height = parseSvgLength(sourceSvg.getAttribute('height'));
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { x: 0, y: 0, width, height };
    }
    return { x: 0, y: 0, width: state.svgWidth || 800, height: state.svgHeight || 600 };
  }

  function resolveArtworkTextureTransform(sourceSvg, sourceViewBox) {
    const usesRawPackedUvCoordinates =
      sourceSvg.getAttribute('data-layout') === 'packed' &&
      sourceSvg.hasAttribute('data-source');
    if (!usesRawPackedUvCoordinates) return null;
    const { x, y, width, height } = sourceViewBox;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return {
      scale: { u: 1 / width, v: -1 / height },
      offset: { u: -x / width, v: -y / height }
    };
  }

  function applyTemplateLayerTransform(layer) {
    const parts = layer.dataset.viewBox.split(' ').map(parseFloat);
    if (parts.length < 4 || parts.some(value => !Number.isFinite(value))) return;
    const [x, y, width, height] = parts;
    if (width <= 0 || height <= 0) return;
    const scaleX = state.svgWidth / width;
    const scaleY = state.svgHeight / height;
    layer.setAttribute('transform', `matrix(${scaleX} 0 0 ${scaleY} ${-x * scaleX} ${-y * scaleY})`);
  }

  function restoreTemplatePathPreview(path) {
    if (!path || path.dataset.color) return;
    getTemplateFillPath(path, false, false)?.remove();
    path.classList.remove('hover-template-path', 'selected-template-path');
  }

  function getTemplateFillPath(path, create = false, persistent = false) {
    if (!path?.dataset?.templatePathId) return null;
    const selector = `.texture-template-fill[data-template-path-id="${path.dataset.templatePathId}"]${persistent ? '[data-persistent="true"]' : ':not([data-persistent="true"])'}`;
    let fillPath = path.parentNode?.querySelector(selector);
    if (!fillPath && create) {
      fillPath = document.importNode(path, true);
      fillPath.removeAttribute('id');
      // A source UV path can carry a class such as `.uv-boundary` whose stylesheet
      // paints the tailoring guide in black. The color layer must not inherit that
      // editor-only outline or it becomes a visible line on the rendered garment.
      fillPath.setAttribute('class', 'texture-template-fill');
      fillPath.dataset.templatePathId = path.dataset.templatePathId;
      fillPath.style.pointerEvents = 'none';
      fillPath.setAttribute('stroke', 'transparent');
      fillPath.setAttribute('stroke-width', '0');
      fillPath.style.setProperty('stroke', 'transparent', 'important');
      fillPath.style.setProperty('stroke-width', '0', 'important');
      fillPath.removeAttribute('filter');
      if (persistent) fillPath.dataset.persistent = 'true';
      path.parentNode.insertBefore(fillPath, path);
    }
    return fillPath;
  }

  function setTemplateFillPaint(fillPath, paint) {
    if (!fillPath) return;
    fillPath.setAttribute('fill', paint);
    fillPath.style.setProperty('fill', paint, 'important');
    fillPath.setAttribute('fill-opacity', '1');
    if (fillPath.dataset.persistent === 'true') {
      // Extend the exact same paint a few raster pixels beyond every UV island.
      // This supplies safe texture padding for bilinear/mipmap sampling instead
      // of letting the white atlas background become a bright garment seam.
      fillPath.setAttribute('stroke', paint);
      fillPath.setAttribute('stroke-width', '8');
      fillPath.setAttribute('stroke-linejoin', 'round');
      fillPath.setAttribute('paint-order', 'stroke fill');
      fillPath.setAttribute('vector-effect', 'non-scaling-stroke');
      fillPath.style.setProperty('stroke', paint, 'important');
      fillPath.style.setProperty('stroke-width', '8px', 'important');
    }
  }

  function setTemplatePathPreview(path, mode) {
    if (!path || path.dataset.color) return;
    const fillPath = getTemplateFillPath(path, true, false);
    setTemplateFillPaint(fillPath, mode === 'selected' ? 'rgba(0,102,255,0.42)' : 'rgba(0,102,255,0.24)');
    path.classList.toggle('hover-template-path', mode === 'hover');
    path.classList.toggle('selected-template-path', mode === 'selected');
  }

  function inlineTextureTemplate(svgText) {
    const layer = document.getElementById('textureTemplateLayer');
    if (!layer || !svgText) return;
    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const sourceSvg = parsed.documentElement;
    if (!sourceSvg || sourceSvg.nodeName === 'parsererror' || parsed.querySelector('parsererror')) return;
    const sourceViewBox = parseSvgViewBox(sourceSvg);
    state.artworkTextureTransform = resolveArtworkTextureTransform(sourceSvg, sourceViewBox);
    layer.innerHTML = '';
    layer.dataset.viewBox = `${sourceViewBox.x} ${sourceViewBox.y} ${sourceViewBox.width} ${sourceViewBox.height}`;
    applyTemplateLayerTransform(layer);
    ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'style', 'class'].forEach((attr) => {
      const value = sourceSvg.getAttribute(attr);
      if (value) layer.setAttribute(attr, value);
    });
    [...sourceSvg.childNodes].forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() !== 'script') {
        layer.appendChild(document.importNode(node, true));
      }
    });
    layer.querySelectorAll('path, polygon, rect, circle, ellipse').forEach((node, index) => {
      if (node.closest('defs, clipPath, mask, pattern')) return;
      node.classList.add('texture-template-path');
      node.dataset.templatePathId = `template-path-${index + 1}`;
      if (!node.id) node.id = node.dataset.templatePathId;
      node.style.cursor = 'pointer';
      const initialFill = node.getAttribute('fill') || '';
      const initialStroke = node.getAttribute('stroke') || '';
      node.dataset.originalFill = initialFill;
      node.dataset.originalStroke = initialStroke;
      if (!initialFill || initialFill === 'none') {
        node.dataset.areaEmpty = 'true';
      }
      if (!initialStroke && layer.getAttribute('stroke')) {
        node.setAttribute('stroke', layer.getAttribute('stroke'));
      }
      if (!node.getAttribute('stroke-width') && layer.getAttribute('stroke-width')) {
        node.setAttribute('stroke-width', layer.getAttribute('stroke-width'));
      }
    });
    scheduleTexturePreviewUpdate({ requireArtwork: true });
  }

  function closeModal() {
    clearHoveredTemplatePreview();
    setAssetTrayOpen(false);
    designAppearancePanel?.classList.remove('is-mobile-open');
    designModal.classList.remove('active');
    designModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    modalReturnFocus?.focus?.({ preventScroll: true });
  }

  designNowBtn?.addEventListener('click', openModal);
  designCtaBtn?.addEventListener('click', openModal);
  designModalOverlay?.addEventListener('click', closeModal);
  designModalClose?.addEventListener('click', closeModal);
  canvasZoomOut?.addEventListener('click', () => applyCanvasZoom(state.zoom * 0.85));
  canvasZoomIn?.addEventListener('click', () => applyCanvasZoom(state.zoom / 0.85));
  canvasZoomFit?.addEventListener('click', fitCanvasZoom);
  canvasRotate?.addEventListener('click', rotateCanvas);

  function updateAssetTrayScrollState() {
    if (!imageAssetViewport) return;
    const maximum = Math.max(0, imageAssetViewport.scrollWidth - imageAssetViewport.clientWidth);
    const progress = maximum > 0 ? imageAssetViewport.scrollLeft / maximum : 0;
    if (imageAssetProgress) {
      const visibleRatio = Math.min(1, imageAssetViewport.clientWidth / Math.max(1, imageAssetViewport.scrollWidth));
      imageAssetProgress.style.width = `${Math.max(18, visibleRatio * 100)}%`;
      imageAssetProgress.style.transform = `translateX(${progress * ((1 / Math.max(visibleRatio, 0.18)) - 1) * 100}%)`;
    }
    if (assetScrollPrev) assetScrollPrev.disabled = imageAssetViewport.scrollLeft <= 2;
    if (assetScrollNext) assetScrollNext.disabled = maximum <= 2 || imageAssetViewport.scrollLeft >= maximum - 2;
  }

  function setAssetTrayOpen(open) {
    if (!imageAssetTray || !textureDesigner) return;
    imageAssetTray.hidden = !open;
    if (designAppearancePanel) designAppearancePanel.hidden = open;
    if (!open) designAppearancePanel?.classList.remove('is-mobile-open');
    textureDesigner.classList.toggle('asset-tray-open', open);
    toolButtons.image?.setAttribute('aria-pressed', String(open));
    if (open) {
      toolAppearance?.classList.remove('active');
      toolAppearance?.setAttribute('aria-pressed', 'false');
    }
    if (open) {
      requestAnimationFrame(() => {
        updateAssetTrayScrollState();
        imageAssetViewport?.focus({ preventScroll: true });
      });
    }
    if (state.zoomMode === 'fit') requestAnimationFrame(fitCanvasZoom);
  }

  function setDesignView(view) {
    if (!textureDesigner || !['2d', '3d', 'split'].includes(view)) return;
    state.designView = view;
    textureDesigner.dataset.designView = view;
    designViewSwitcher?.querySelectorAll('[data-design-view]').forEach((button) => {
      const isActive = button.dataset.designView === view;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    if (view === '3d') {
      setAssetTrayOpen(false);
      window.loadClothingModelViewer?.(designerViewer)
        .then(() => {
          if (state.pendingTextureUrl) {
            return applyTextureToModel(state.pendingTextureUrl, state.textureUpdateId);
          }
          if (hasEditableArtwork()) scheduleTexturePreviewUpdate();
          return null;
        })
        .catch(() => {});
    }
    requestAnimationFrame(fitCanvasZoom);
  }

  function openAppearancePanel() {
    if (!designAppearancePanel || !textureDesigner) return;
    setAssetTrayOpen(false);
    designAppearancePanel.hidden = false;
    designAppearancePanel.classList.remove('is-collapsed');
    textureDesigner.classList.remove('appearance-collapsed');
    if (window.matchMedia('(max-width: 900px)').matches) {
      designAppearancePanel.classList.add('is-mobile-open');
    }
    toolAppearance?.classList.add('active');
    toolAppearance?.setAttribute('aria-pressed', 'true');
    designAppearancePanel.querySelector('.design-appearance-card')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function setTool(tool) {
    state.tool = tool;
    state.textClickCandidate = null;
    Object.values(toolButtons).forEach(btn => btn?.classList.remove('active'));
    toolAppearance?.classList.remove('active');
    toolAppearance?.setAttribute('aria-pressed', 'false');
    if (toolButtons[tool]) toolButtons[tool].classList.add('active');
    if (tool !== 'image') setAssetTrayOpen(false);
    textureSvg.classList.toggle('is-drawing', tool === 'draw');
    textureSvg.style.cursor = tool === 'pan' ? 'grab' : tool === 'draw' ? 'crosshair' : 'default';
  }

  Object.entries(toolButtons).forEach(([tool, btn]) => {
    btn?.addEventListener('click', () => setTool(tool));
  });

  toolAppearance?.addEventListener('click', () => {
    setTool('select');
    openAppearancePanel();
  });

  designViewSwitcher?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-design-view]');
    if (button) setDesignView(button.dataset.designView);
  });

  appearancePanelCollapse?.addEventListener('click', () => {
    const shouldCollapse = !designAppearancePanel?.classList.contains('is-collapsed');
    designAppearancePanel?.classList.toggle('is-collapsed', shouldCollapse);
    designAppearancePanel?.classList.remove('is-mobile-open');
    textureDesigner?.classList.toggle('appearance-collapsed', shouldCollapse);
    requestAnimationFrame(fitCanvasZoom);
  });

  designAppearancePanel?.addEventListener('click', (event) => {
    if (designAppearancePanel.classList.contains('is-collapsed') && event.target === designAppearancePanel) {
      openAppearancePanel();
    }
  });

  setDesignView('2d');

  function getCanvasCenter() {
    const viewBox = textureSvg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(parseFloat);
      if (parts.length >= 4) {
        return { cx: parts[0] + parts[2] / 2, cy: parts[1] + parts[3] / 2 };
      }
    }
    return { cx: 400, cy: 300 };
  }

  function svgPoint(event) {
    const pt = textureSvg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(textureSvg.getScreenCTM().inverse());
  }

  function createSvg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function getTextureSvgDataUrl(options = {}) {
    const includeSelectionHighlight = options.includeSelectionHighlight !== false;
    const includeTemplateGuides = options.includeTemplateGuides === true;
    const includeTemplateHighlight = options.includeTemplateHighlight === true;
    const exportSvg = textureSvg.cloneNode(true);
    exportSvg.style.removeProperty('--canvas-rotation');
    exportSvg.querySelector('#selectionLayer')?.remove();
    exportSvg.querySelectorAll('.texture-element.selected').forEach((element) => {
      element.classList.remove('selected');
    });
    if (!includeSelectionHighlight) {
      exportSvg.querySelectorAll('.texture-template-path.selected-template-path').forEach((element) => {
        element.classList.remove('selected-template-path');
      });
      exportSvg.querySelectorAll('.texture-template-path.hover-template-path').forEach((element) => {
        element.classList.remove('hover-template-path');
      });
      if (!includeTemplateHighlight) {
        exportSvg.querySelectorAll('.texture-template-fill:not([data-persistent="true"])').forEach((element) => {
          element.remove();
        });
      }
      if (includeTemplateGuides) {
        exportSvg.querySelectorAll('.texture-template-path[data-area-empty="true"]').forEach((element) => {
          if (element.dataset.color) return;
          if (element.dataset.originalFill) {
            element.setAttribute('fill', element.dataset.originalFill);
          } else {
            element.removeAttribute('fill');
          }
          element.removeAttribute('fill-opacity');
        });
      }
    }
    if (!includeTemplateGuides) {
      const exportTextureBg = exportSvg.querySelector('#textureBg');
      if (exportTextureBg?.tagName?.toLowerCase() === 'image') {
        exportTextureBg.remove();
      }
      exportSvg.querySelectorAll('.texture-template-path').forEach((element) => {
        element.remove();
      });
      if (!includeTemplateHighlight) {
        exportSvg.querySelectorAll('.texture-template-fill:not([data-persistent="true"])').forEach((element) => {
          element.remove();
        });
      }
    }
    exportSvg.querySelectorAll('[contenteditable]').forEach((element) => {
      element.removeAttribute('contenteditable');
      element.classList.remove('is-editing');
    });
    const svgData = new XMLSerializer().serializeToString(exportSvg);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  function getTextureSize() {
    const viewBox = textureSvg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(parseFloat);
      if (parts.length >= 4) return { width: parts[2], height: parts[3] };
    }
    return { width: state.svgWidth || 800, height: state.svgHeight || 600 };
  }

  function rasterizeTexture(options = {}) {
    return new Promise((resolve, reject) => {
      const { width, height } = getTextureSize();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (options.backgroundColor) {
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = getTextureSvgDataUrl(options);
    });
  }

  function getModelTextureBackingPaint() {
    const paths = [...textureSvg.querySelectorAll('.texture-template-path')];
    // A single-panel edit must not spill into untouched panels. Once every
    // editable island has a fill, however, any unlisted UVs belong to hidden
    // construction surfaces (for example a collar facing or garment reverse)
    // and should inherit the dominant garment paint instead of staying white.
    if (!paths.length || paths.some((path) => !path.dataset.color)) return '#ffffff';

    const paintWeights = new Map();
    paths.forEach((path) => {
      let weight = 1;
      try {
        const bounds = path.getBBox();
        weight = Math.max(1, bounds.width * bounds.height);
      } catch (error) {
        // Detached SVG geometry can briefly lack a measurable bounding box.
      }
      const paint = path.dataset.color;
      paintWeights.set(paint, (paintWeights.get(paint) || 0) + weight);
    });
    const dominantPaint = [...paintWeights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    // Canvas fillStyle cannot consume the editor's CSS linear-gradient string.
    // Its leading color is a stable backing for small hidden/reverse regions.
    return dominantPaint ? parseColorState(dominantPaint).start : '#ffffff';
  }

  function rasterizeModelTexture(options = {}) {
    // The editable/exported UV artwork is transparent by default. model-viewer's
    // OPAQUE glTF materials do not blend PNG alpha with the previous base map.
    // Use the garment's dominant fill after a whole-garment color pass so hidden
    // reverse/facing UVs do not render white; partial panel edits remain neutral.
    return rasterizeTexture({
      ...options,
      backgroundColor: options.backgroundColor || getModelTextureBackingPaint()
    });
  }

  function getViewerTextureUrl(textureUrl) {
    if (!state.projectId || !/^https:\/\//i.test(textureUrl)) return textureUrl;
    return window.UserProjects.textureUrl(textureUrl);
  }

  function loadViewerTextureImage(textureUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The designed texture could not be decoded.'));
      image.src = textureUrl;
    });
  }

  async function createViewerTexture(viewerElement, textureUrl) {
    const originalSourceUrl = getViewerTextureUrl(textureUrl);
    const sourceUrl = window.ExportEntitlements?.prepareTexture
      ? await window.ExportEntitlements.prepareTexture(originalSourceUrl)
      : originalSourceUrl;
    const createCanvasTexture = async () => {
      if (typeof viewerElement.createCanvasTexture !== 'function') return null;
      const image = await loadViewerTextureImage(sourceUrl);
      const texture = viewerElement.createCanvasTexture();
      const canvas = texture?.source?.element;
      const context = canvas?.getContext?.('2d');
      if (!canvas || !context) return null;
      canvas.width = Math.max(1, image.naturalWidth || image.width || state.svgWidth);
      canvas.height = Math.max(1, image.naturalHeight || image.height || state.svgHeight);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // THREE.CanvasTexture uploads with flipY=true while model-viewer's image
      // loader uses flipY=false for glTF. Pre-flip the pixels so both paths keep
      // the exact same UV orientation.
      context.save();
      context.translate(0, canvas.height);
      context.scale(1, -1);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.restore();
      texture.source.update?.();
      return texture;
    };

    if (/^data:image\//i.test(sourceUrl)) {
      const canvasTexture = await createCanvasTexture();
      if (canvasTexture) return canvasTexture;
    }
    try {
      return await viewerElement.createTexture(sourceUrl);
    } catch (error) {
      const canvasTexture = await createCanvasTexture();
      if (canvasTexture) return canvasTexture;
      throw error;
    }
  }

  async function applyTextureToViewer(viewerElement, textureUrl, options = {}) {
    if (!viewerElement || !textureUrl) return false;
    try {
      await viewerElement.updateComplete;
      if (typeof viewerElement.createTexture !== 'function') return false;
      const model = viewerElement.model;
      const materials = model?.materials || [];
      if (!materials.length) return false;
      const texture = options.texture || await createViewerTexture(viewerElement, textureUrl);
      const materialMaps = state.selectedMaterial
        ? await loadMaterialMaps(viewerElement, state.selectedMaterial)
        : {};
      if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
      let appliedMaterialCount = 0;
      materials.forEach((material) => {
        try {
          const pbr = material.pbrMetallicRoughness;
          if (!options.preserveMaterial && pbr?.setBaseColorFactor) {
            pbr.setBaseColorFactor(getDesignedTextureFactor());
          }
          if (!options.preserveMaterial && state.selectedMaterial) {
            pbr?.setMetallicFactor?.(state.selectedMaterial.metalness ?? 0);
            pbr?.setRoughnessFactor?.(state.selectedMaterial.roughness ?? 0.8);
          }
          const baseColorTexture = pbr?.baseColorTexture;
          if (baseColorTexture?.setTexture) {
            baseColorTexture.setTexture(texture);
            appliedMaterialCount += 1;
          } else if (pbr?.setBaseColorTexture) {
            pbr.setBaseColorTexture(texture);
            appliedMaterialCount += 1;
          }
          applyArtworkTextureTransform(baseColorTexture);
          if (!options.preserveMaterial) {
            if (state.selectedMaterial) {
              applyFabricSurfaceResponse(material, state.selectedMaterial);
            }
            setMaterialTextureSlot(material.normalTexture, materialMaps.normal);
            material.normalTexture?.setScale?.(state.selectedMaterial?.normalScale ?? 0.1);
            setFabricTextureRepeat(material.normalTexture, state.selectedMaterial?.textureRepeat);
            if (materialMaps.roughness) {
              setMaterialTextureSlot(pbr?.metallicRoughnessTexture, materialMaps.roughness);
              setFabricTextureRepeat(pbr?.metallicRoughnessTexture, state.selectedMaterial?.textureRepeat);
            }
          }
        } catch (error) {
          console.warn('Skipped an incompatible 3D material while applying the design:', error);
        }
      });
      if (appliedMaterialCount === 0) return false;
      if (options.trackApplied !== false) state.appliedTextureUrl = textureUrl;
      viewerElement.requestUpdate?.();
      await viewerElement.updateComplete;
      return true;
    } catch (error) {
      console.warn('Failed to update 3D texture preview:', error);
      return false;
    }
  }

  async function applyTextureToModel(textureUrl, updateId = state.textureUpdateId) {
    if (!designerViewer || !textureUrl) return false;
    state.pendingTextureUrl = textureUrl;
    const materials = await waitForViewerMaterials(designerViewer);
    if (!materials.length || updateId !== state.textureUpdateId || state.pendingTextureUrl !== textureUrl) {
      return false;
    }
    const applied = await applyTextureToViewer(designerViewer, textureUrl, {
      isCurrent: () => updateId === state.textureUpdateId && state.pendingTextureUrl === textureUrl
    });
    if (applied && updateId === state.textureUpdateId && state.pendingTextureUrl === textureUrl) {
      state.pendingTextureUrl = null;
    }
    return applied;
  }

  async function waitForViewerMaterials(viewerElement, timeoutMs = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await viewerElement.updateComplete;
      const materials = viewerElement.model?.materials || [];
      if (materials.length > 0) return materials;
      viewerElement.requestUpdate?.();
      await new Promise(resolve => window.setTimeout(resolve, 80));
    }
    return [];
  }

  async function loadDesignedSceneIntoDetailViewer() {
    if (!designerViewer?.model || typeof designerViewer.exportScene !== 'function' || !detailViewer) {
      return false;
    }

    const sceneBlob = await designerViewer.exportScene();
    if (!(sceneBlob instanceof Blob) || sceneBlob.size === 0) {
      throw new Error('The editor could not export the designed 3D scene.');
    }

    const sceneUrl = URL.createObjectURL(sceneBlob);
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          detailViewer.removeEventListener('load', handleLoad);
          detailViewer.removeEventListener('error', handleError);
          callback(value);
        };
        const handleLoad = () => finish(resolve);
        const handleError = () => finish(reject, new Error('The exported 3D scene could not be loaded.'));
        const timeoutId = window.setTimeout(() => {
          finish(reject, new Error('The exported 3D scene timed out while loading.'));
        }, 20000);

        detailViewer.addEventListener('load', handleLoad);
        detailViewer.addEventListener('error', handleError);
        detailViewer.src = sceneUrl;
        detailViewer.setAttribute('loading', 'eager');
        detailViewer.dismissPoster?.();
      });
      await detailViewer.updateComplete;
      const materials = await waitForViewerMaterials(detailViewer);
      if (!materials.length) throw new Error('The exported 3D scene has no editable materials.');
      detailViewer.requestUpdate?.();
      const previousSceneUrl = state.detailSceneUrl;
      state.detailSceneUrl = sceneUrl;
      if (previousSceneUrl) URL.revokeObjectURL(previousSceneUrl);
      return true;
    } catch (error) {
      URL.revokeObjectURL(sceneUrl);
      throw error;
    }
  }

  async function applyFinalTextureToViewers(textureUrl) {
    const viewers = [...new Set([designerViewer, detailViewer].filter(Boolean))];
    const applied = [];
    let editorApplied = false;
    let sharedTexture = null;
    for (const viewerElement of viewers) {
      let didApply = false;
      let directApplyError = null;
      try {
        if (!viewerElement.model) {
          await window.loadClothingModelViewer?.(viewerElement).catch(() => null);
        }
        if (!viewerElement.model) await waitForModelViewerReady(viewerElement);
        const materials = await waitForViewerMaterials(viewerElement);
        if (!materials.length) throw new Error('The 3D model materials are not ready.');
        if (!sharedTexture && viewerElement === designerViewer) {
          sharedTexture = await createViewerTexture(viewerElement, textureUrl);
        }
        didApply = await applyTextureToViewer(viewerElement, textureUrl, {
          texture: sharedTexture
        });
        if (!didApply) {
          viewerElement.requestUpdate?.();
          await new Promise(resolve => window.setTimeout(resolve, 120));
          didApply = await applyTextureToViewer(viewerElement, textureUrl, {
            texture: sharedTexture
          });
        }
        if (didApply) {
          await viewerElement.updateComplete;
          viewerElement.requestUpdate?.();
        }
      } catch (error) {
        directApplyError = error;
      }

      if (!didApply && viewerElement === detailViewer && editorApplied) {
        try {
          didApply = await loadDesignedSceneIntoDetailViewer();
          if (didApply) console.info('Loaded the designed editor scene into the detail preview.');
        } catch (fallbackError) {
          console.warn('Failed to load the designed editor scene into the detail preview:', fallbackError);
          directApplyError = fallbackError;
        }
      }

      if (!didApply) {
        if (viewerElement === detailViewer) {
          const detail = directApplyError?.message || 'No compatible detail material accepted the texture.';
          throw new Error(`The detail preview could not be updated: ${detail}`);
        }
        console.warn('Failed to update an editor 3D preview:', directApplyError);
      }
      if (viewerElement === designerViewer) editorApplied = didApply;
      applied.push(didApply);
    }

    const detailViewerIndex = viewers.indexOf(detailViewer);
    if (detailViewerIndex >= 0 && applied[detailViewerIndex] !== true) {
      throw new Error('The detail preview could not be updated. Please try again.');
    }
    return applied;
  }

  function copySamplerVector(value) {
    if (!value || !Number.isFinite(value.u) || !Number.isFinite(value.v)) return null;
    return { u: value.u, v: value.v };
  }

  function captureViewerBaseColorTextures(viewerElement) {
    return (viewerElement?.model?.materials || []).map((material) => {
      const textureInfo = material.pbrMetallicRoughness?.baseColorTexture;
      const sampler = textureInfo?.texture?.sampler;
      return {
        textureInfo,
        texture: textureInfo?.texture || null,
        rotation: sampler?.rotation ?? null,
        scale: copySamplerVector(sampler?.scale),
        offset: copySamplerVector(sampler?.offset)
      };
    });
  }

  function restoreViewerBaseColorTextures(snapshot) {
    (snapshot || []).forEach((entry) => {
      if (!entry.textureInfo?.setTexture) return;
      entry.textureInfo.setTexture(entry.texture);
      const sampler = entry.textureInfo.texture?.sampler;
      sampler?.setRotation?.(entry.rotation);
      sampler?.setScale?.(entry.scale);
      sampler?.setOffset?.(entry.offset);
    });
  }

  function previewHoveredTemplatePath(path) {
    state.hoveredTemplatePath = path;
    clearTimeout(state.hoverTextureTimer);
    const updateId = ++state.hoverTextureUpdateId;
    state.hoverTextureTimer = setTimeout(async () => {
      if (updateId !== state.hoverTextureUpdateId || state.hoveredTemplatePath !== path) return;
      state.hoverMaterialSnapshot ||= captureViewerBaseColorTextures(designerViewer);
      const textureUrl = await rasterizeModelTexture({ includeTemplateHighlight: true });
      if (updateId !== state.hoverTextureUpdateId || state.hoveredTemplatePath !== path) return;
      await applyTextureToViewer(designerViewer, textureUrl, {
        preserveMaterial: true,
        trackApplied: false
      });
      if (updateId !== state.hoverTextureUpdateId || state.hoveredTemplatePath !== path) {
        restoreViewerBaseColorTextures(state.hoverMaterialSnapshot);
        state.hoverMaterialSnapshot = null;
      }
    }, 60);
  }

  function clearHoveredTemplatePreview(path = state.hoveredTemplatePath) {
    if (path && state.hoveredTemplatePath && path !== state.hoveredTemplatePath) return;
    state.hoveredTemplatePath = null;
    clearTimeout(state.hoverTextureTimer);
    state.hoverTextureUpdateId++;
    if (state.hoverMaterialSnapshot) {
      restoreViewerBaseColorTextures(state.hoverMaterialSnapshot);
      state.hoverMaterialSnapshot = null;
    }
  }

  function scheduleTexturePreviewUpdate(options = {}) {
    // Initial template/model loading must not replace the GLB's original fabric
    // texture with an empty white canvas. Later edits may intentionally clear it.
    if (options.requireArtwork && !hasEditableArtwork()) return;
    clearTimeout(state.textureUpdateTimer);
    const updateId = ++state.textureUpdateId;
    state.textureUpdateTimer = setTimeout(async () => {
      try {
        const textureUrl = await rasterizeModelTexture();
        if (updateId !== state.textureUpdateId) return;
        await applyTextureToModel(textureUrl, updateId);
      } catch (error) {
        if (updateId === state.textureUpdateId) {
          console.warn('Failed to prepare the live 3D texture preview:', error);
        }
      }
    }, 120);
  }

  async function saveDesignAndClose() {
    await saveCloudProject({ closeAfterSave: true });
  }

  async function waitForPendingArtworkUploads() {
    while (state.pendingArtworkUploads.size) {
      const count = state.pendingArtworkUploads.size;
      setDesignSaveStatus(`Finishing ${count} image upload${count === 1 ? '' : 's'}…`);
      await Promise.all([...state.pendingArtworkUploads]);
    }
  }

  function serializeProjectElements() {
    const wrapper = getCleanElementsClone();
    wrapper.querySelectorAll('image').forEach((image) => {
      const source = image.getAttribute('href') || image.getAttribute('xlink:href') || '';
      const storedUrl = state.uploadedAssetUrls.get(source) || (/^(?:https:\/\/|\/)/.test(source) ? source : '');
      if (!storedUrl) throw new Error('Please wait for every uploaded image to finish saving.');
      image.setAttribute('href', storedUrl);
      image.removeAttribute('xlink:href');
    });
    const serialized = wrapper.innerHTML;
    if (/(?:data:image\/|blob:)/i.test(serialized)) {
      throw new Error('Please wait for every uploaded image to finish saving.');
    }
    return serialized;
  }

  async function saveCloudProject(options = {}) {
    if (window.UserProjects?.isAdminPreview) {
      setDesignSaveStatus('Administrator preview: changes are not saved.');
      return false;
    }
    if (!saveDesignModal) return false;
    saveDesignModal.disabled = true;
    saveDesignModal.classList.add('is-loading');
    state.textEditor?.commit();
    clearHoveredTemplatePreview();
    setDesignSaveStatus(modelDesignerConfig.userAuthenticated ? 'Saving project…' : 'Applying…');
    const saveMode = state.projectId ? 'update' : 'create';
    let saveStage = 'render_texture';
    if (modelDesignerConfig.userAuthenticated) {
      window.trackEvent?.(`designer_project_${saveMode}_begin`, {
        item_id: String(modelDesignerConfig.modelId || modelDesignerConfig.modelSlug || ''),
        project_id: state.projectId || undefined
      });
    }
    try {
      const textureDataUrl = await rasterizeModelTexture({ includeSelectionHighlight: false });
      state.finalTextureUrl = textureDataUrl;
      await applyFinalTextureToViewers(textureDataUrl);
      persistTryOnDesign(textureDataUrl);
      if (!modelDesignerConfig.userAuthenticated || !window.UserProjects) {
        setDesignSaveStatus('Applied');
        if (options.closeAfterSave) closeModal();
        return true;
      }
      saveStage = 'wait_artwork_uploads';
      await waitForPendingArtworkUploads();
      saveStage = 'serialize_design';
      const elements = serializeProjectElements();
      const projectName = state.projectName || `${modelDesignerConfig.modelName || 'Garment'} Design`;
      const projectSourceId = String(modelDesignerConfig.modelId || modelDesignerConfig.modelSlug || '');
      const projectSourceUrl = window.location.pathname;
      const baseDesignData = {
        elements,
        materialId: state.selectedMaterial?.id || null,
        fillScope: state.fillScope,
        fillMode: state.fillMode,
        appearance: serializeAppearanceState(),
        textureTransform: state.artworkTextureTransform
      };
      // Reserve the project before uploading its lightweight 3D cover. This
      // prevents an allowance or database failure from leaving orphan project assets.
      if (!state.projectId) {
        saveStage = 'reserve_project';
        setDesignSaveStatus('Creating project…');
        const reservedProject = await window.UserProjects.saveProject({
          projectType: '3d',
          name: projectName,
          sourceId: projectSourceId,
          sourceUrl: projectSourceUrl,
          previewImageUrl: '',
          designData: baseDesignData
        });
        state.projectId = reservedProject.id;
        state.projectName = reservedProject.name;
        const reservedUrl = new URL(window.location.href);
        reservedUrl.searchParams.set('project', reservedProject.id);
        window.history.replaceState({}, '', reservedUrl);
        window.syncModelTryOnLinks?.(reservedProject.id);
      }
      saveStage = 'render_preview';
      setDesignSaveStatus('Rendering 3D project cover…');
      const previewDataUrl = await captureProjectPreview();
      saveStage = 'upload_preview';
      setDesignSaveStatus('Saving project…');
      const preview = await window.UserProjects.uploadImage(
        previewDataUrl,
        `${modelDesignerConfig.modelSlug || '3d-design'}-preview.${previewDataUrl.startsWith('data:image/webp;') ? 'webp' : 'jpg'}`,
        'project-preview'
      );
      saveStage = 'finalize_project';
      const project = await window.UserProjects.saveProject({
        id: state.projectId,
        projectType: '3d',
        name: projectName,
        sourceId: projectSourceId,
        sourceUrl: projectSourceUrl,
        previewImageUrl: preview.url,
        designData: baseDesignData
      });
      state.projectId = project.id;
      state.projectName = project.name;
      state.finalTextureUrl = textureDataUrl;
      const url = new URL(window.location.href);
      url.searchParams.set('project', project.id);
      window.history.replaceState({}, '', url);
      persistTryOnDesign(textureDataUrl);
      window.syncModelTryOnLinks?.(project.id);
      setDesignSaveStatus('Saved to your account');
      window.trackEvent?.(`designer_project_${saveMode}_success`, {
        item_id: projectSourceId,
        project_id: project.id
      });
      if (options.closeAfterSave) closeModal();
      return true;
    } catch (error) {
      console.error(error);
      if (modelDesignerConfig.userAuthenticated) {
        window.trackEvent?.(`designer_project_${saveMode}_error`, {
          item_id: String(modelDesignerConfig.modelId || modelDesignerConfig.modelSlug || ''),
          project_id: state.projectId || undefined,
          ...window.UserProjects?.projectSaveFailureContext?.(error, saveStage)
        });
      }
      if (error.status === 401) window.UserProjects.goToSignIn();
      else setDesignSaveStatus(error.message || 'Project could not be saved', true);
      return false;
    } finally {
      saveDesignModal.disabled = false;
      saveDesignModal.classList.remove('is-loading');
    }
  }

  function setRenderStatus(message) {
    if (downloadRenderStatus) downloadRenderStatus.textContent = message || '';
  }

  function setExportingState(isExporting) {
    state.isExportingRender = isExporting;
    [renderCurrentModelBtn].forEach((button) => {
      if (!button) return;
      button.disabled = isExporting;
      button.classList.toggle('is-loading', isExporting);
    });
  }

  function hasDesignedTexture() {
    return Boolean(
      state.finalTextureUrl ||
      hasEditableArtwork()
    );
  }

  async function waitForModelViewerReady(viewerElement) {
    if (!viewerElement) return;
    await customElements.whenDefined('model-viewer');
    viewerElement.setAttribute('loading', 'eager');
    viewerElement.setAttribute('reveal', 'auto');
    await viewerElement.updateComplete;
    if (typeof viewerElement.dismissPoster === 'function') {
      viewerElement.dismissPoster();
    }

    const startedAt = Date.now();
    while (!viewerElement.model && Date.now() - startedAt < 45000) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 160);
        const handleLoad = () => {
          clearTimeout(timer);
          resolve();
        };
        const handleError = () => {
          clearTimeout(timer);
          reject(new Error('3D model failed to load'));
        };
        viewerElement.addEventListener('load', handleLoad, { once: true });
        viewerElement.addEventListener('error', handleError, { once: true });
      });
      await viewerElement.updateComplete;
    }

    if (!viewerElement.model) {
      throw new Error('3D model render timed out');
    }

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function captureModelViewerImage(viewerElement, options = {}) {
    await waitForModelViewerReady(viewerElement);
    const mimeType = options.mimeType || 'image/png';
    const quality = options.quality ?? 0.95;
    if (typeof viewerElement.toDataURL === 'function') {
      return viewerElement.toDataURL(mimeType, quality);
    }
    const canvas = viewerElement.shadowRoot?.querySelector('canvas');
    if (canvas?.toDataURL) {
      return canvas.toDataURL(mimeType, quality);
    }
    throw new Error('This browser cannot export the 3D render.');
  }

  async function captureProjectPreview() {
    // Reuse the already rendered model; saving must not load a second GLB/viewer.
    const viewerElement = getActiveRenderViewer();
    if (!viewerElement) throw new Error('The 3D preview is not ready. Please try again.');
    // A display:none mobile preview retains its previous canvas. Make the existing
    // editor visible while capturing, then restore the user's editing view.
    const previousView = textureDesigner?.dataset.designView;
    const revealPreview = viewerElement === designerViewer && !viewerElement.getBoundingClientRect().width;
    try {
      if (revealPreview) textureDesigner.dataset.designView = '3d';
      await viewerElement.updateComplete;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await waitForVisibleModelRender(viewerElement);
      const source = await captureModelViewerImage(viewerElement, { mimeType: 'image/webp', quality: 0.72 });
      return await compressProjectPreview(source);
    } finally {
      if (revealPreview) textureDesigner.dataset.designView = previousView;
    }
  }

  async function compressProjectPreview(source) {
    const image = await loadRenderImage(source);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Project preview could not be prepared.');
    const maxBytes = 48 * 1024;
    for (const edge of [512, 384, 256]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#f5f5f7';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.65, 0.5, 0.4]) {
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp;')) dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (Math.ceil(dataUrl.split(',')[1].length * 3 / 4) <= maxBytes) return dataUrl;
      }
    }
    throw new Error('Project preview could not be compressed. Please try again.');
  }

  function loadRenderImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The rendered garment could not be composed.'));
      image.src = dataUrl;
    });
  }

  function findOpaqueGarmentBounds(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const step = 2;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const alpha = pixels[((y * width) + x) * 4 + 3];
        if (alpha < 220) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX <= minX || maxY <= minY) {
      return { minX: width * 0.2, minY: height * 0.12, maxX: width * 0.8, maxY: height * 0.88 };
    }
    return { minX, minY, maxX, maxY };
  }

  async function composeCommercialProductRender(dataUrl, renderStandard = defaultRenderStandard) {
    const composition = {
      ...defaultRenderStandard.web.exportComposition,
      ...(renderStandard.web?.exportComposition || {})
    };
    const width = Number(composition.width) || 1200;
    const height = Number(composition.height) || 1500;
    const image = await loadRenderImage(dataUrl);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0, width, height);
    const bounds = findOpaqueGarmentBounds(sourceContext, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, composition.backgroundTop || '#faf9f6');
    background.addColorStop(1, composition.backgroundBottom || '#e8e5de');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const spotlight = context.createRadialGradient(
      width * 0.5, height * 0.38, width * 0.04,
      width * 0.5, height * 0.4, width * 0.66
    );
    spotlight.addColorStop(0, composition.spotlight || 'rgba(255, 255, 255, 0.96)');
    spotlight.addColorStop(0.58, 'rgba(255, 255, 255, 0.36)');
    spotlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = spotlight;
    context.fillRect(0, 0, width, height);

    const garmentWidth = bounds.maxX - bounds.minX;
    const garmentHeight = bounds.maxY - bounds.minY;
    const shadowCenterX = (bounds.minX + bounds.maxX) / 2;
    const shadowCenterY = Math.min(height * 0.92, bounds.maxY + Math.max(8, garmentHeight * 0.012));
    const shadowRadius = Math.max(width * 0.09, garmentWidth * 0.36);
    context.save();
    context.translate(shadowCenterX, shadowCenterY);
    context.scale(1, 0.13);
    const floorShadow = context.createRadialGradient(0, 0, shadowRadius * 0.08, 0, 0, shadowRadius);
    floorShadow.addColorStop(0, composition.floorShadow || 'rgba(29, 27, 24, 0.3)');
    floorShadow.addColorStop(0.46, 'rgba(29, 27, 24, 0.14)');
    floorShadow.addColorStop(1, 'rgba(29, 27, 24, 0)');
    context.fillStyle = floorShadow;
    context.fillRect(-shadowRadius, -shadowRadius, shadowRadius * 2, shadowRadius * 2);
    context.restore();

    context.save();
    context.filter = `contrast(${Number(composition.contrast) || 1.08}) saturate(${Number(composition.saturation) || 1.02})`;
    context.drawImage(sourceCanvas, 0, 0);
    context.restore();

    const vignette = context.createRadialGradient(
      width * 0.5, height * 0.43, width * 0.38,
      width * 0.5, height * 0.46, width * 0.82
    );
    vignette.addColorStop(0, 'rgba(29, 27, 24, 0)');
    vignette.addColorStop(1, 'rgba(29, 27, 24, 0.065)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png', 1);
  }

  async function createFinalRenderTexture() {
    state.textEditor?.commit();
    if (!hasDesignedTexture()) {
      return null;
    }
    const textureUrl = await rasterizeModelTexture({ includeSelectionHighlight: false });
    state.finalTextureUrl = textureUrl;
    await Promise.all(getLoadedDesignViewers().map((viewerElement) => applyTextureToViewer(viewerElement, textureUrl)));
    return textureUrl;
  }

  function stopModelRotation() {
    [detailViewer, designerViewer].forEach((viewerElement) => {
      if (!viewerElement) return;
      viewerElement.autoRotate = false;
      viewerElement.removeAttribute('auto-rotate');
    });
    rotateBtn?.classList.remove('active');
  }

  async function frameCoverExportViewer(viewerElement, renderStandard = defaultRenderStandard) {
    if (!viewerElement) return;
    const coverCameraOrbit = renderStandard.camera?.webOrbit || defaultRenderStandard.camera.webOrbit;
    viewerElement.cameraTarget = renderStandard.camera?.webTarget || defaultRenderStandard.camera.webTarget;
    viewerElement.fieldOfView = renderStandard.camera?.webFieldOfView || defaultRenderStandard.camera.webFieldOfView;
    viewerElement.cameraOrbit = coverCameraOrbit;
    if (typeof viewerElement.updateFraming === 'function') {
      await viewerElement.updateFraming();
    }
    viewerElement.cameraOrbit = coverCameraOrbit;
    if (typeof viewerElement.jumpCameraToGoal === 'function') {
      viewerElement.jumpCameraToGoal();
    }
  }

  function imageHasVisibleModelPixels(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonTransparent = 0;
        let nonBlack = 0;
        for (let i = 0; i < pixels.length; i += 16) {
          const alpha = pixels[i + 3];
          if (alpha <= 8) continue;
          nonTransparent += 1;
          if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) {
            nonBlack += 1;
          }
        }
        resolve(nonTransparent > 3200 && nonBlack > 250);
      };
      image.onerror = () => resolve(false);
      image.src = dataUrl;
    });
  }

  async function waitForVisibleModelRender(viewerElement) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12000) {
      await viewerElement.updateComplete;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      try {
        const dataUrl = await captureModelViewerImage(viewerElement, { mimeType: 'image/png', quality: 0.95 });
        if (await imageHasVisibleModelPixels(dataUrl)) return;
      } catch (error) {
        // Browser canvas readback can fail while CDP screenshots still work.
      }
      await new Promise(resolve => setTimeout(resolve, 280));
    }
  }

  function getActiveRenderViewer() {
    if (designModal.classList.contains('active') && designerViewer?.model) return designerViewer;
    if (detailViewer?.model) return detailViewer;
    if (designerViewer?.model) return designerViewer;
    return null;
  }

  function captureViewerCamera(viewerElement = getActiveRenderViewer()) {
    if (!viewerElement?.model) return null;
    try {
      const orbit = viewerElement.getCameraOrbit?.();
      const target = viewerElement.getCameraTarget?.();
      const fieldOfView = viewerElement.getFieldOfView?.();
      const hasOrbit = orbit && [orbit.theta, orbit.phi, orbit.radius].every(Number.isFinite);
      const hasTarget = target && [target.x, target.y, target.z].every(Number.isFinite);
      const hasFieldOfView = Number.isFinite(fieldOfView);
      if (!hasOrbit && !hasTarget && !hasFieldOfView) return null;
      return {
        cameraOrbit: hasOrbit ? `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m` : null,
        cameraTarget: hasTarget ? `${target.x}m ${target.y}m ${target.z}m` : null,
        fieldOfView: hasFieldOfView ? `${fieldOfView}deg` : null
      };
    } catch (error) {
      return null;
    }
  }

  async function applyViewerCamera(viewerElement, cameraSnapshot) {
    if (!viewerElement || !cameraSnapshot) return false;
    if (cameraSnapshot.cameraTarget) viewerElement.cameraTarget = cameraSnapshot.cameraTarget;
    if (cameraSnapshot.fieldOfView) viewerElement.fieldOfView = cameraSnapshot.fieldOfView;
    if (cameraSnapshot.cameraOrbit) viewerElement.cameraOrbit = cameraSnapshot.cameraOrbit;
    await viewerElement.updateComplete;
    if (typeof viewerElement.jumpCameraToGoal === 'function') {
      viewerElement.jumpCameraToGoal();
    }
    window.CameraRelativeStudioLight?.sync(viewerElement);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  }

  function createCoverExportViewer(options = {}, renderStandard = defaultRenderStandard) {
    const isVisibleCapture = options.visibleCapture === true;
    const isCommercialCapture = options.commercialFrame === true;
    const webStandard = { ...defaultRenderStandard.web, ...(renderStandard.web || {}) };
    const detailLighting = window.ModelDetailLightingSettings || {};
    const exportViewer = document.createElement('model-viewer');
    exportViewer.src = modelDesignerConfig.previewModelFileUrl || '';
    exportViewer.alt = modelDesignerConfig.modelName || 'Designed 3D model';
    exportViewer.setAttribute('loading', 'eager');
    exportViewer.setAttribute('reveal', 'auto');
    exportViewer.setAttribute('interaction-prompt', 'none');
    exportViewer.setAttribute('environment-image', webStandard.exportEnvironmentImage || webStandard.environmentImage);
    if (webStandard.cameraRelativeLighting !== false) {
      exportViewer.dataset.cameraRelativeStudioLight = webStandard.exportEnvironmentImage || webStandard.environmentImage;
      exportViewer.dataset.studioLightReferenceAzimuth = String(webStandard.lightReferenceAzimuthDeg ?? -16);
      exportViewer.dataset.studioLightAzimuthOffset = String(detailLighting.azimuthOffsetDeg ?? webStandard.lightAzimuthOffsetDeg ?? 0);
    }
    exportViewer.setAttribute('shadow-intensity', String(webStandard.exportShadowIntensity ?? 0.32));
    exportViewer.setAttribute('shadow-softness', String(detailLighting.shadowSoftness ?? webStandard.exportShadowSoftness ?? 0.96));
    exportViewer.setAttribute('exposure', String(detailLighting.exposure ?? (isCommercialCapture ? (webStandard.exportExposure ?? webStandard.exposure) : webStandard.exposure)));
    exportViewer.setAttribute('tone-mapping', isCommercialCapture ? (webStandard.exportToneMapping || webStandard.toneMapping) : webStandard.toneMapping);
    exportViewer.autoRotate = false;
    exportViewer.removeAttribute('auto-rotate');
    exportViewer.setAttribute('aria-hidden', 'true');
    exportViewer.id = 'coverExportViewer';
    exportViewer.style.setProperty('--poster-color', 'transparent');
    exportViewer.style.position = 'absolute';
    exportViewer.style.left = '0';
    exportViewer.style.top = '0';
    exportViewer.style.width = '1200px';
    exportViewer.style.height = '1500px';
    exportViewer.style.background = 'transparent';
    exportViewer.style.pointerEvents = 'none';
    exportViewer.style.cursor = 'none';
    exportViewer.style.outline = 'none';
    exportViewer.style.border = '0';
    // Keep the WebGL surface measurable and renderable for toDataURL(), but do not
    // let the high-resolution export viewer flash over the detail page.
    exportViewer.style.opacity = isVisibleCapture ? '1' : '0';
    exportViewer.style.zIndex = options.zIndex || '2147483647';
    exportViewer.style.transform = 'none';
    exportViewer.style.transformOrigin = 'top left';
    exportViewer.style.display = 'block';
    exportViewer.style.visibility = 'visible';
    return exportViewer;
  }

  async function renderDesignedModelImage(textureUrl, options = {}) {
    const renderStandard = await renderStandardPromise;
    const exportViewer = createCoverExportViewer({
      zIndex: options.viewerZIndex,
      commercialFrame: options.commercialFrame
    }, renderStandard);
    document.body.appendChild(exportViewer);

    try {
      await waitForModelViewerReady(exportViewer);
      if (!await applyViewerCamera(exportViewer, options.cameraSnapshot)) {
        await frameCoverExportViewer(exportViewer, renderStandard);
      }
      exportViewer.autoRotate = false;
      if (textureUrl) {
        await applyTextureToViewer(exportViewer, textureUrl);
      } else if (state.selectedMaterial) {
        await applyMaterialToViewer(exportViewer, state.selectedMaterial);
      }
      if (!textureUrl) {
        await window.ExportEntitlements?.applyModelViewerWatermark?.(exportViewer);
      }
      if (options.commercialFrame) {
        applyCommercialExportMaterialResponse(exportViewer, renderStandard);
      }
      await exportViewer.updateComplete;
      await waitForVisibleModelRender(exportViewer);
      await new Promise(resolve => setTimeout(resolve, 360));
      return await captureModelViewerImage(exportViewer, options);
    } finally {
      exportViewer.remove();
    }
  }

  async function renderDesignedModelImages(textureUrl, formatOptions = [], options = {}) {
    const renderStandard = await renderStandardPromise;
    const exportViewer = createCoverExportViewer({}, renderStandard);
    document.body.appendChild(exportViewer);

    try {
      await waitForModelViewerReady(exportViewer);
      if (!await applyViewerCamera(exportViewer, options.cameraSnapshot)) {
        await frameCoverExportViewer(exportViewer, renderStandard);
      }
      exportViewer.autoRotate = false;
      if (textureUrl) {
        await applyTextureToViewer(exportViewer, textureUrl);
      } else if (state.selectedMaterial) {
        await applyMaterialToViewer(exportViewer, state.selectedMaterial);
      }
      if (!textureUrl) {
        await window.ExportEntitlements?.applyModelViewerWatermark?.(exportViewer);
      }
      await exportViewer.updateComplete;
      await waitForVisibleModelRender(exportViewer);
      await new Promise(resolve => setTimeout(resolve, 360));

      const results = {};
      for (const format of formatOptions) {
        const key = format.key || format.mimeType || `image-${Object.keys(results).length + 1}`;
        results[key] = await captureModelViewerImage(exportViewer, {
          mimeType: format.mimeType || 'image/png',
          quality: format.quality ?? 0.95
        });
      }
      return results;
    } finally {
      exportViewer.remove();
    }
  }

  async function prepareDesignedModelCoverCapture() {
    stopModelRotation();
    const cameraSnapshot = captureViewerCamera();
    const textureUrl = await createFinalRenderTexture();
    cleanupDesignedModelCoverCapture();
    state.coverCaptureHidden = [];
    [...document.body.children].forEach((child) => {
      state.coverCaptureHidden.push([child, child.style.visibility]);
      child.style.visibility = 'hidden';
    });
    const captureStage = document.createElement('div');
    captureStage.id = 'coverExportStage';
    captureStage.style.position = 'fixed';
    captureStage.style.left = '0';
    captureStage.style.top = '0';
    captureStage.style.width = '1200px';
    captureStage.style.height = '1500px';
    captureStage.style.background = 'transparent';
    captureStage.style.zIndex = '2147483647';
    captureStage.style.visibility = 'visible';
    captureStage.style.pointerEvents = 'none';
    const renderStandard = await renderStandardPromise;
    const exportViewer = createCoverExportViewer({ visibleCapture: true }, renderStandard);
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    captureStage.appendChild(exportViewer);
    document.body.appendChild(captureStage);
    await waitForModelViewerReady(exportViewer);
    if (!await applyViewerCamera(exportViewer, cameraSnapshot)) {
      await frameCoverExportViewer(exportViewer, renderStandard);
    }
    if (textureUrl) {
      await applyTextureToViewer(exportViewer, textureUrl);
    } else if (state.selectedMaterial) {
      await applyMaterialToViewer(exportViewer, state.selectedMaterial);
    }
    if (!textureUrl) {
      await window.ExportEntitlements?.applyModelViewerWatermark?.(exportViewer);
    }
    await exportViewer.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 1800));
    return { x: 0, y: 0, width: 1200, height: 1500 };
  }

  function cleanupDesignedModelCoverCapture() {
    document.getElementById('coverExportStage')?.remove();
    document.getElementById('coverExportViewer')?.remove();
    (state.coverCaptureHidden || []).forEach(([element, visibility]) => {
      element.style.visibility = visibility;
    });
    state.coverCaptureHidden = [];
  }

  async function renderDesignedModelImageWithFallback(textureUrl, options = {}) {
    let renderedImage;
    try {
      renderedImage = await renderDesignedModelImage(textureUrl, options);
    } catch (error) {
      console.warn('High-resolution render failed, falling back to active viewer:', error);
      const activeViewer = designModal.classList.contains('active') ? designerViewer : detailViewer;
      if (textureUrl) {
        await applyTextureToViewer(activeViewer, textureUrl);
      } else if (state.selectedMaterial) {
        await applyMaterialToViewer(activeViewer, state.selectedMaterial);
      }
      renderedImage = await captureModelViewerImage(activeViewer, options);
    }
    if (!options.commercialFrame) return renderedImage;
    const renderStandard = await renderStandardPromise;
    return composeCommercialProductRender(renderedImage, renderStandard);
  }

  function downloadRenderedImage(renderUrl, filename) {
    const link = document.createElement('a');
    link.href = renderUrl;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function renderCurrentModelImage() {
    if (state.isExportingRender) return;
    if (!modelDesignerConfig.previewModelFileUrl) return;
    setExportingState(true);
    setRenderStatus('Rendering high-resolution 3D image...');

    try {
      await loadModelViewerModule();
      stopModelRotation();
      const activeViewer = designModal.classList.contains('active') ? designerViewer : detailViewer;
      if (activeViewer) await waitForModelViewerReady(activeViewer);
      const cameraSnapshot = captureViewerCamera(activeViewer);
      const textureUrl = await createFinalRenderTexture();
      const renderUrl = await renderDesignedModelImageWithFallback(textureUrl, {
        mimeType: 'image/png',
        quality: 0.95,
        cameraSnapshot,
        commercialFrame: true
      });
      const filename = `${modelDesignerConfig.modelSlug || 'designed-3d-model'}-render.png`;
      downloadRenderedImage(renderUrl, filename);
      setRenderStatus('Render downloaded.');
      window.trackEvent?.('designer_current_view_render_download', {
        render_format: 'png',
        render_type: 'current_3d_view',
        item_id: modelDesignerConfig.modelSlug || '',
        item_name: modelDesignerConfig.modelName || ''
      });
      window.setTimeout(() => setRenderStatus(''), 2800);
    } catch (error) {
      console.error('Failed to export designed 3D render:', error);
      setRenderStatus('Render export failed. Try again after the 3D model finishes loading.');
    } finally {
      setExportingState(false);
    }
  }

  function setCustomizationStatus(message, type = '') {
    if (!customizationInquiryStatus) return;
    customizationInquiryStatus.textContent = message || '';
    customizationInquiryStatus.classList.toggle('is-success', type === 'success');
    customizationInquiryStatus.classList.toggle('is-progress', type === 'progress');
  }

  function setCustomizationPreview(img, loading, dataUrl) {
    if (!img || !loading) return;
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.add('ready');
      loading.hidden = true;
    } else {
      img.removeAttribute('src');
      img.classList.remove('ready');
      loading.hidden = false;
    }
  }

  function syncCustomizationSubmitState() {
    if (!customizationInquirySubmit) return;
    customizationInquirySubmit.disabled = Boolean(
      state.isCapturingInquiry ||
      state.isSubmittingInquiry ||
      !state.inquirySnapshots?.threeD ||
      !state.inquirySnapshots?.twoD
    );
  }

  async function prepareCustomizationSnapshots() {
    if (state.isCapturingInquiry) return;
    state.isCapturingInquiry = true;
    state.inquirySnapshots = null;
    customizationRefreshSnapshots.disabled = true;
    setCustomizationPreview(customizationPreview3d, customizationPreview3dLoading, null);
    setCustomizationPreview(customizationPreview2d, customizationPreview2dLoading, null);
    setCustomizationStatus('Preparing the current 3D and 2D design attachments…', 'progress');
    syncCustomizationSubmitState();

    try {
      await loadTextureDimensions();
      state.textEditor?.commit();
      const textureForModel = await rasterizeModelTexture({ includeSelectionHighlight: false });
      const [snapshot2d, snapshot3d] = await Promise.all([
        rasterizeTexture({
          includeSelectionHighlight: false,
          includeTemplateGuides: true
        }),
        renderDesignedModelImageWithFallback(textureForModel, {
          mimeType: 'image/webp',
          quality: 0.9,
          viewerZIndex: '10000'
        })
      ]);
      state.inquirySnapshots = {
        threeD: snapshot3d,
        twoD: snapshot2d
      };
      setCustomizationPreview(customizationPreview3d, customizationPreview3dLoading, snapshot3d);
      setCustomizationPreview(customizationPreview2d, customizationPreview2dLoading, snapshot2d);
      setCustomizationStatus('Design attachments are ready.', 'success');
    } catch (error) {
      console.error('Failed to prepare customization snapshots:', error);
      setCustomizationStatus('We could not capture the current design. Please refresh the attachments and try again.');
    } finally {
      state.isCapturingInquiry = false;
      customizationRefreshSnapshots.disabled = false;
      syncCustomizationSubmitState();
    }
  }

  function resetCustomizationView() {
    customizationInquiryForm.hidden = false;
    customizationInquirySuccess.hidden = true;
    customizationInquiryReference.textContent = '—';
    setCustomizationStatus('');
    state.inquirySnapshots = null;
    setCustomizationPreview(customizationPreview3d, customizationPreview3dLoading, null);
    setCustomizationPreview(customizationPreview2d, customizationPreview2dLoading, null);
    syncCustomizationSubmitState();
  }

  function openCustomizationInquiry() {
    customizationReturnFocus = document.activeElement;
    resetCustomizationView();
    customizationInquiryModal.classList.add('active');
    customizationInquiryModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      customizationInquiryClose?.focus({ preventScroll: true });
      ensureDetailViewer()
        .then(() => prepareCustomizationSnapshots())
        .catch(() => setCustomizationStatus('The 3D preview could not load. Please retry in a moment.'));
    });
  }

  function closeCustomizationInquiry() {
    customizationInquiryModal.classList.remove('active');
    customizationInquiryModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = designModal.classList.contains('active') ? 'hidden' : '';
    customizationReturnFocus?.focus?.({ preventScroll: true });
  }

  async function submitCustomizationInquiry(event) {
    event.preventDefault();
    if (state.isSubmittingInquiry || !state.inquirySnapshots) return;
    if (!customizationInquiryForm.reportValidity()) return;

    const formData = new FormData(customizationInquiryForm);
    const originalSubmitLabel = customizationInquirySubmit.querySelector('span')?.textContent || 'Submit request';
    state.isSubmittingInquiry = true;
    syncCustomizationSubmitState();
    const submitLabel = customizationInquirySubmit.querySelector('span');
    if (submitLabel) submitLabel.textContent = 'Submitting…';
    setCustomizationStatus('Uploading the design attachments and submitting your request…', 'progress');

    try {
      const response = await fetch('/api/customization-inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: modelDesignerConfig.modelId || null,
          modelSlug: modelDesignerConfig.modelSlug || '',
          modelName: modelDesignerConfig.modelName || '',
          contact: {
            name: formData.get('name'),
            email: formData.get('email'),
            address: formData.get('address')
          },
          quantity: formData.get('quantity'),
          notes: formData.get('notes'),
          website: formData.get('website'),
          sourceUrl: window.location.href,
          snapshots: state.inquirySnapshots
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'We could not submit your request. Please try again.');
      }

      customizationInquiryReference.textContent = result.referenceCode || 'RECEIVED';
      customizationInquiryForm.hidden = true;
      customizationInquirySuccess.hidden = false;
      customizationInquirySuccess.querySelector('.btn')?.focus({ preventScroll: true });
      window.trackEvent?.('designer_customization_inquiry_submit', {
        lead_type: 'customization_inquiry',
        item_id: modelDesignerConfig.modelSlug || '',
        item_name: modelDesignerConfig.modelName || ''
      });
    } catch (error) {
      setCustomizationStatus(error.message || 'We could not submit your request. Please try again.');
    } finally {
      state.isSubmittingInquiry = false;
      if (submitLabel) submitLabel.textContent = originalSubmitLabel;
      syncCustomizationSubmitState();
    }
  }

  window.exportDesignedModelCover = async function exportDesignedModelCover(options = {}) {
    await loadModelViewerModule();
    stopModelRotation();
    const cameraSnapshot = captureViewerCamera();
    const textureUrl = await createFinalRenderTexture();
    return renderDesignedModelImageWithFallback(textureUrl, {
      mimeType: options.mimeType || 'image/webp',
      quality: options.quality ?? 0.95,
      cameraSnapshot
    });
  };
  window.exportDesignedModelCoverFormats = async function exportDesignedModelCoverFormats(formatOptions = []) {
    await loadModelViewerModule();
    stopModelRotation();
    const cameraSnapshot = captureViewerCamera();
    const textureUrl = await createFinalRenderTexture();
    return renderDesignedModelImages(textureUrl, formatOptions, { cameraSnapshot });
  };
  window.prepareDesignedModelCoverCapture = prepareDesignedModelCoverCapture;
  window.cleanupDesignedModelCoverCapture = cleanupDesignedModelCoverCapture;

  function getCleanElementsClone() {
    const clone = textureElements.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach((element) => {
      element.removeAttribute('contenteditable');
      element.classList.remove('is-editing');
    });
    clone.querySelectorAll('.texture-element.selected').forEach((element) => {
      element.classList.remove('selected');
    });
    return clone;
  }

  function getCleanElementsHtml() {
    return getCleanElementsClone().innerHTML;
  }

  function getData(group) {
    if (group.classList?.contains('texture-template-path')) {
      const bbox = group.getBBox();
      return {
        x: bbox.x,
        y: bbox.y,
        width: Math.max(minSize, bbox.width),
        height: Math.max(minSize, bbox.height),
        baseWidth: Math.max(minSize, bbox.width),
        baseHeight: Math.max(minSize, bbox.height),
        fontSize: 24,
        rotate: 0
      };
    }
    return {
      x: parseFloat(group.dataset.x || 0),
      y: parseFloat(group.dataset.y || 0),
      width: parseFloat(group.dataset.width || 1),
      height: parseFloat(group.dataset.height || 1),
      baseWidth: parseFloat(group.dataset.baseWidth || group.dataset.width || 1),
      baseHeight: parseFloat(group.dataset.baseHeight || group.dataset.height || 1),
      fontSize: parseFloat(group.dataset.fontSize || 24),
      rotate: parseFloat(group.dataset.rotate || 0)
    };
  }

  function setData(group, patch) {
    const data = { ...getData(group), ...patch };
    data.width = Math.max(minSize, data.width);
    data.height = Math.max(minSize, data.height);
    group.dataset.x = data.x;
    group.dataset.y = data.y;
    group.dataset.width = data.width;
    group.dataset.height = data.height;
    group.dataset.baseWidth = data.baseWidth || data.width;
    group.dataset.baseHeight = data.baseHeight || data.height;
    group.dataset.fontSize = data.fontSize || parseFloat(group.dataset.fontSize || 24);
    group.dataset.rotate = data.rotate;
    group.setAttribute('transform', `translate(${data.x} ${data.y}) rotate(${data.rotate} ${data.width / 2} ${data.height / 2})`);
    renderElementContent(group);
  }

  function constrainToCanvas(data) {
    return clampRectToBounds(data, {
      x: 0,
      y: 0,
      width: state.svgWidth,
      height: state.svgHeight
    });
  }

  function renderElementContent(group) {
    const data = getData(group);
    const content = group.querySelector('.texture-content');
    if (!content) return;
    const type = group.dataset.type;

    if (type === 'text') {
      content.setAttribute('width', data.width);
      content.setAttribute('height', data.height);
      const textBox = group.querySelector('.texture-text-box');
      if (textBox) {
        textBox.style.fontSize = `${Math.max(12, data.fontSize)}px`;
        textBox.style.color = textBox.dataset.color || '#111827';
      }
    } else if (type === 'rect' || type === 'image') {
      content.setAttribute('width', data.width);
      content.setAttribute('height', data.height);
      if (type === 'image') content.setAttribute('preserveAspectRatio', 'none');
    } else if (type === 'arrow') {
      const line = group.querySelector('line.texture-content');
      const head = group.querySelector('polygon');
      const mid = data.height / 2;
      const headSize = Math.min(data.height * 0.8, Math.max(10, data.width * 0.22));
      line.setAttribute('x1', 0);
      line.setAttribute('y1', mid);
      line.setAttribute('x2', Math.max(0, data.width - headSize * 0.55));
      line.setAttribute('y2', mid);
      line.setAttribute('stroke-width', group.dataset.strokeWidth || Math.max(2, data.height * 0.16));
      head.setAttribute('points', `${data.width},${mid} ${data.width - headSize},${mid - headSize / 2} ${data.width - headSize},${mid + headSize / 2}`);
    } else if (type === 'path') {
      const scaleX = data.width / Math.max(1, data.baseWidth);
      const scaleY = data.height / Math.max(1, data.baseHeight);
      content.setAttribute('transform', `scale(${scaleX} ${scaleY})`);
    }
  }

  function autoFitTextHeight(group) {
    if (!group || group.dataset.type !== 'text') return false;
    const textBox = group.querySelector('.texture-text-box');
    if (!textBox) return false;
    const data = getData(group);
    const previousHeight = textBox.style.height;
    textBox.style.height = 'auto';
    const nextHeight = Math.max(minSize, Math.ceil(textBox.scrollHeight));
    textBox.style.height = previousHeight || '100%';
    if (Math.abs(nextHeight - data.height) <= 1) return false;
    setData(group, { height: nextHeight });
    return true;
  }

  function setElementColor(group, color) {
    if (!group) return;
    if (group.classList?.contains('texture-template-path')) {
      group.dataset.color = color;
      const fillPath = getTemplateFillPath(group, true, true);
      setTemplateFillPaint(fillPath, getSvgPaint(group, color, 'fill'));
      getTemplateFillPath(group, false, false)?.remove();
      group.dataset.areaEmpty = 'false';
      return;
    }
    const type = group.dataset.type;
    group.dataset.color = color;
    if (type === 'text') {
      const textBox = group.querySelector('.texture-text-box');
      textBox.dataset.color = color;
      if (String(color).includes('linear-gradient')) {
        textBox.style.backgroundImage = color;
        textBox.style.webkitBackgroundClip = 'text';
        textBox.style.backgroundClip = 'text';
        textBox.style.color = 'transparent';
      } else {
        textBox.style.backgroundImage = '';
        textBox.style.webkitBackgroundClip = '';
        textBox.style.backgroundClip = '';
        textBox.style.color = color;
      }
    } else if (type === 'rect') {
      group.querySelector('rect.texture-content')?.setAttribute('fill', getSvgPaint(group, color, 'fill'));
    } else if (type === 'arrow') {
      const paint = getSvgPaint(group, color, 'stroke');
      group.querySelector('line.texture-content')?.setAttribute('stroke', paint);
      group.querySelector('polygon')?.setAttribute('fill', paint);
    } else if (type === 'path') {
      group.querySelector('path.texture-content')?.setAttribute('stroke', getSvgPaint(group, color, 'stroke'));
    }
  }

  function colorToCss(value) {
    return value || '#111827';
  }

  function getSvgPaint(group, value, prop) {
    if (!String(value || '').includes('linear-gradient')) return value;
    const parsed = parseColorState(value);
    const id = `${group.id}-${prop}-gradient`;
    const radians = ((parsed.angle ?? 90) - 90) * (Math.PI / 180);
    const x2 = 50 + Math.cos(radians) * 50;
    const y2 = 50 + Math.sin(radians) * 50;
    const x1 = 100 - x2;
    const y1 = 100 - y2;
    let gradient = document.getElementById(id);
    if (!gradient) {
      gradient = createSvg('linearGradient', { id });
      textureSvg.querySelector('defs')?.appendChild(gradient);
    }
    gradient.setAttribute('x1', `${x1}%`);
    gradient.setAttribute('y1', `${y1}%`);
    gradient.setAttribute('x2', `${x2}%`);
    gradient.setAttribute('y2', `${y2}%`);
    gradient.innerHTML = '';
    parsed.stops.forEach((stop) => {
      gradient.appendChild(createSvg('stop', {
        offset: `${stop.position}%`,
        'stop-color': rgbaFrom(stop.color, parsed.alpha)
      }));
    });
    return `url(#${id})`;
  }

  function getColorValue(group, prop) {
    if (!group) return '#111827';
    if (group.classList?.contains('texture-template-path')) {
      return group.dataset.color || (group.dataset.areaEmpty === 'true' ? '#ffffff' : group.style.fill || group.getAttribute('fill')) || '#ffffff';
    }
    const type = group.dataset.type;
    if (prop === 'strokeColor') {
      if (group.dataset.strokeColor) return group.dataset.strokeColor;
      return group.querySelector('rect.texture-content')?.getAttribute('stroke') || '#1e3a8a';
    }
    if (group.dataset.color) return group.dataset.color;
    if (type === 'text') return group.querySelector('.texture-text-box')?.dataset.color || '#111827';
    if (type === 'rect') return group.querySelector('rect.texture-content')?.getAttribute('fill') || '#3b82f6';
    return group.querySelector('.texture-content')?.getAttribute('stroke') || '#111827';
  }

  function hexToRgb(hex) {
    const clean = (hex || '#111827').replace('#', '');
    const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    return {
      r: parseInt(value.slice(0, 2), 16) || 0,
      g: parseInt(value.slice(2, 4), 16) || 0,
      b: parseInt(value.slice(4, 6), 16) || 0
    };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
      r: (r + m) * 255,
      g: (g + m) * 255,
      b: (b + m) * 255
    };
  }

  function hsvToHex(h, s, v) {
    const rgb = hsvToRgb(h, s, v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function normalizeHex(value) {
    const match = String(value || '').match(/#?[0-9a-fA-F]{6}/);
    return match ? `#${match[0].replace('#', '')}` : '#111827';
  }

  function rgbaFrom(hex, alpha) {
    const rgb = hexToRgb(hex);
    const a = Math.max(0, Math.min(100, parseFloat(alpha) || 100)) / 100;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  }

  function normalizeGradientStops(stops, fallbackStart = '#111827', fallbackEnd = '#ffffff') {
    const normalized = (Array.isArray(stops) ? stops : [])
      .map((stop, index) => ({
        id: String(stop?.id || `stop-${index + 1}`),
        color: normalizeHex(stop?.color || fallbackStart),
        position: Math.max(0, Math.min(100, Number(stop?.position) || 0))
      }))
      .sort((left, right) => left.position - right.position);
    if (!normalized.length) {
      return [
        { id: 'stop-1', color: normalizeHex(fallbackStart), position: 0 },
        { id: 'stop-2', color: normalizeHex(fallbackEnd), position: 100 }
      ];
    }
    if (normalized.length === 1) {
      normalized[0].position = 0;
      normalized.push({ id: 'stop-2', color: normalizeHex(fallbackEnd), position: 100 });
    }
    return normalized;
  }

  function gradientFromStops(stops, alpha = 100, angle = 90) {
    const normalizedAngle = ((Number(angle) || 0) % 360 + 360) % 360;
    const normalizedStops = normalizeGradientStops(stops);
    const stopList = normalizedStops
      .map((stop) => `${rgbaFrom(stop.color, alpha)} ${Math.round(stop.position * 100) / 100}%`)
      .join(', ');
    return `linear-gradient(${normalizedAngle}deg, ${stopList})`;
  }

  function gradientFrom(start, end, alpha, angle = 90) {
    return gradientFromStops([
      { id: 'stop-1', color: start, position: 0 },
      { id: 'stop-2', color: end, position: 100 }
    ], alpha, angle);
  }

  function parseCssColorTokens(value) {
    const source = String(value || '');
    const colorRegex = /#[0-9a-fA-F]{6}|rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/g;
    return [...source.matchAll(colorRegex)].map((match) => {
      const trailing = source.slice((match.index || 0) + match[0].length);
      const positionMatch = trailing.match(/^\s+(-?[0-9.]+)%/);
      if (match[0].startsWith('#')) {
        return {
          hex: normalizeHex(match[0]),
          position: positionMatch ? parseFloat(positionMatch[1]) : undefined
        };
      }
      return {
        hex: rgbToHex(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])),
        alpha: match[4] !== undefined ? Math.round(parseFloat(match[4]) * 100) : undefined,
        position: positionMatch ? parseFloat(positionMatch[1]) : undefined
      };
    });
  }

  function parseColorState(value) {
    const colorTokens = parseCssColorTokens(value);
    const isGradient = String(value || '').includes('linear-gradient');
    const angleMatch = String(value || '').match(/linear-gradient\(\s*(-?[0-9.]+)deg/i);
    const start = colorTokens[0]?.hex || normalizeHex(value);
    const end = colorTokens[colorTokens.length - 1]?.hex || (isGradient ? start : '#ffffff');
    const stops = isGradient
      ? normalizeGradientStops(colorTokens.map((token, index) => ({
          id: `stop-${index + 1}`,
          color: token.hex,
          position: token.position ?? (colorTokens.length > 1 ? (index / (colorTokens.length - 1)) * 100 : 0)
        })), start, end)
      : [{ id: 'stop-1', color: start, position: 0 }];
    const hsv = rgbToHsv(...Object.values(hexToRgb(start)));
    return {
      mode: isGradient ? 'gradient' : 'solid',
      activeStopId: stops[0].id,
      start,
      end,
      stops,
      h: hsv.h,
      s: hsv.s,
      v: hsv.v,
      angle: angleMatch ? parseFloat(angleMatch[1]) : 90,
      alpha: colorTokens.find((token) => token.alpha !== undefined)?.alpha ?? 100
    };
  }

  function getAppearancePaint() {
    const start = appearanceColorStart?.value || '#5f89f4';
    if (state.fillMode === 'solid') return start;
    const end = appearanceColorEnd?.value || '#c39bea';
    const angle = parseFloat(appearanceGradientAngle?.value || 135);
    return gradientFrom(start, end, 100, angle);
  }

  function serializeAppearanceState() {
    return {
      colorStart: appearanceColorStart?.value || '#5f89f4',
      colorEnd: appearanceColorEnd?.value || '#c39bea',
      gradientAngle: Math.max(0, Math.min(360, Number(appearanceGradientAngle?.value) || 135)),
      panelFills: [...textureSvg.querySelectorAll('.texture-template-path[data-color]')].map((path) => ({
        id: path.dataset.templatePathId,
        paint: path.dataset.color
      }))
    };
  }

  function normalizeSavedPaint(value) {
    const parsed = parseColorState(String(value || '').slice(0, 1200));
    return parsed.mode === 'gradient'
      ? gradientFromStops(parsed.stops, parsed.alpha, parsed.angle)
      : parsed.start;
  }

  function restoreAppearanceState(appearance) {
    if (!appearance || typeof appearance !== 'object') return;
    if (appearanceColorStart) appearanceColorStart.value = normalizeHex(appearance.colorStart || appearanceColorStart.value);
    if (appearanceColorEnd) appearanceColorEnd.value = normalizeHex(appearance.colorEnd || appearanceColorEnd.value);
    if (appearanceGradientAngle) {
      appearanceGradientAngle.value = String(Math.max(0, Math.min(360, Number(appearance.gradientAngle) || 135)));
    }
    const pathsById = new Map(
      [...textureSvg.querySelectorAll('.texture-template-path')].map((path) => [path.dataset.templatePathId, path])
    );
    (Array.isArray(appearance.panelFills) ? appearance.panelFills : []).forEach((savedFill) => {
      const path = pathsById.get(String(savedFill?.id || ''));
      if (path && typeof savedFill?.paint === 'string') setElementColor(path, normalizeSavedPaint(savedFill.paint));
    });
  }

  async function restoreLegacyAppearanceFromTexture(textureUrl) {
    if (!textureUrl) return false;
    try {
      const dataUrl = await resolveArtworkDataUrl(textureUrl);
      const image = await loadViewerTextureImage(dataUrl);
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return false;
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      const borderBins = new Map();
      const allBins = new Map();
      const borderSize = Math.ceil(size * 0.08);
      const record = (bins, red, green, blue) => {
        if (red > 244 && green > 244 && blue > 244) return;
        const key = `${Math.round(red / 8) * 8},${Math.round(green / 8) * 8},${Math.round(blue / 8) * 8}`;
        const item = bins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
        item.count += 1;
        item.red += red;
        item.green += green;
        item.blue += blue;
        bins.set(key, item);
      };
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const offset = (y * size + x) * 4;
          if (pixels[offset + 3] < 200) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          record(allBins, red, green, blue);
          if (x < borderSize || y < borderSize || x >= size - borderSize || y >= size - borderSize) {
            record(borderBins, red, green, blue);
          }
        }
      }
      const dominant = (bins) => [...bins.values()].sort((a, b) => b.count - a.count)[0] || null;
      const sample = dominant(borderBins) || dominant(allBins);
      if (!sample || sample.count < 4) return false;
      const color = rgbToHex(sample.red / sample.count, sample.green / sample.count, sample.blue / sample.count);
      if (appearanceColorStart) appearanceColorStart.value = color;
      if (appearanceColorEnd) appearanceColorEnd.value = color;
      [...textureSvg.querySelectorAll('.texture-template-path')].forEach((path) => setElementColor(path, color));
      return true;
    } catch (error) {
      console.warn('Failed to restore legacy project appearance:', error);
      return false;
    }
  }

  function renderAppearanceControls() {
    const paint = getAppearancePaint();
    if (appearanceGradientPreview) appearanceGradientPreview.style.background = paint;
    if (appearanceGradientAngleOutput) {
      appearanceGradientAngleOutput.value = `${Math.round(parseFloat(appearanceGradientAngle?.value || 135))}°`;
      appearanceGradientAngleOutput.textContent = appearanceGradientAngleOutput.value;
    }
    designAppearancePanel?.querySelectorAll('[data-fill-scope]').forEach((button) => {
      const active = button.dataset.fillScope === state.fillScope;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    designAppearancePanel?.querySelectorAll('[data-fill-mode]').forEach((button) => {
      const active = button.dataset.fillMode === state.fillMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    designAppearancePanel?.classList.toggle('is-solid-fill', state.fillMode === 'solid');
  }

  function applyAppearanceFill() {
    const allPaths = [...textureSvg.querySelectorAll('.texture-template-path')];
    const targets = state.fillScope === 'panel'
      ? (state.selectedTemplatePath ? [state.selectedTemplatePath] : [])
      : allPaths;
    renderAppearanceControls();
    if (!targets.length) {
      setDesignSaveStatus(state.fillScope === 'panel' ? 'Select a garment panel first' : 'Loading garment panels…', true);
      return;
    }
    const paint = getAppearancePaint();
    targets.forEach((path) => setElementColor(path, paint));
    setDesignSaveStatus('Unapplied changes', true);
    renderSelection();
    scheduleTexturePreviewUpdate();
  }

  designAppearancePanel?.addEventListener('click', (event) => {
    const scopeButton = event.target.closest('[data-fill-scope]');
    const modeButton = event.target.closest('[data-fill-mode]');
    if (scopeButton) {
      state.fillScope = scopeButton.dataset.fillScope;
      renderAppearanceControls();
      if (state.fillScope === 'panel' && !state.selectedTemplatePath) {
        setDesignSaveStatus('Select a garment panel first', true);
      } else {
        applyAppearanceFill();
      }
    } else if (modeButton) {
      state.fillMode = modeButton.dataset.fillMode;
      applyAppearanceFill();
    }
  });

  [appearanceColorStart, appearanceColorEnd, appearanceGradientAngle].forEach((input) => {
    input?.addEventListener('input', applyAppearanceFill);
  });
  renderAppearanceControls();

  function setElementStrokeColor(group, color) {
    if (!group) return;
    if (group.dataset.type === 'rect') {
      group.dataset.strokeColor = color;
      group.querySelector('rect.texture-content')?.setAttribute('stroke', getSvgPaint(group, color, 'stroke'));
    }
  }

  function setElementOpacity(group, value) {
    if (!group) return;
    group.setAttribute('opacity', String(Math.max(0, Math.min(100, parseFloat(value) || 100)) / 100));
  }

  function setElementLineWidth(group, value) {
    if (!group) return;
    const width = Math.max(1, parseFloat(value) || 1);
    if (group.dataset.type === 'path') {
      group.querySelector('path.texture-content')?.setAttribute('stroke-width', width);
    } else if (group.dataset.type === 'arrow') {
      group.dataset.strokeWidth = width;
      group.querySelector('line.texture-content')?.setAttribute('stroke-width', width);
    } else if (group.dataset.type === 'rect') {
      group.querySelector('rect.texture-content')?.setAttribute('stroke-width', width);
    }
  }

  function updateSelectedElement(patch, options = {}) {
    const group = state.selected;
    if (!group) return;
    if (group.classList?.contains('texture-template-path')) {
      if (patch.color) setElementColor(group, patch.color);
      renderSelection();
      scheduleTexturePreviewUpdate();
      return;
    }
    if (patch.fontSize !== undefined && group.dataset.type === 'text') {
      setData(group, { fontSize: parseFloat(patch.fontSize) || 24 });
      autoFitTextHeight(group);
    }
    if (patch.color) setElementColor(group, patch.color);
    if (patch.strokeColor) setElementStrokeColor(group, patch.strokeColor);
    if (patch.opacity !== undefined) setElementOpacity(group, patch.opacity);
    if (patch.lineWidth !== undefined) setElementLineWidth(group, patch.lineWidth);
    if (options.commit) {
      renderSelection();
      saveHistory();
    } else {
      renderSelection();
      scheduleTexturePreviewUpdate();
    }
  }

  function createElement(type, options = {}) {
    const center = getCanvasCenter();
    const width = options.width || 120;
    const height = options.height || 80;
    const group = createSvg('g');
    group.id = `element-${++state.elementCounter}`;
    group.classList.add('texture-element');
    group.dataset.type = type;
    group.dataset.x = options.x ?? center.cx - width / 2;
    group.dataset.y = options.y ?? center.cy - height / 2;
    group.dataset.width = width;
    group.dataset.height = height;
    group.dataset.baseWidth = options.baseWidth || width;
    group.dataset.baseHeight = options.baseHeight || height;
    group.dataset.fontSize = options.fontSize || 24;
    group.dataset.rotate = options.rotate || 0;

    let content;
    if (type === 'text') {
      content = createSvg('foreignObject', {
        class: 'texture-content',
        x: 0,
        y: 0,
        width,
        height
      });
      const textBox = document.createElement('div');
      textBox.className = 'texture-text-box';
      textBox.dataset.color = options.color || '#111827';
      textBox.textContent = options.text || defaultTextContent;
      content.appendChild(textBox);
    } else if (type === 'rect') {
      content = createSvg('rect', {
        class: 'texture-content',
        x: 0,
        y: 0,
        rx: 8,
        fill: '#3b82f6',
        stroke: '#1e3a8a',
        'stroke-width': 2
      });
    } else if (type === 'image') {
      content = createSvg('image', {
        class: 'texture-content',
        x: 0,
        y: 0,
        href: options.src,
        preserveAspectRatio: 'none'
      });
    } else if (type === 'arrow') {
      const line = createSvg('line', {
        class: 'texture-content',
        stroke: '#111827',
        'stroke-linecap': 'round'
      });
      const head = createSvg('polygon', { fill: '#111827' });
      group.append(line, head);
    } else if (type === 'path') {
      content = createSvg('path', {
        class: 'texture-content',
        d: options.d,
        fill: 'none',
        stroke: '#111827',
        'stroke-width': 6,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
    }

    if (content) group.appendChild(content);
    textureElements.appendChild(group);
    setData(group, {});
    autoFitTextHeight(group);
    selectElement(group);
    saveHistory();
    setTool('select');
    return group;
  }

  function selectElement(element) {
    if (element !== state.selected) {
      closeColorPopover();
      state.textClickCandidate = null;
    }
    if (element?.classList?.contains('texture-template-path')) {
      clearHoveredTemplatePreview();
    }
    state.selected?.classList.remove('selected');
    restoreTemplatePathPreview(state.selectedTemplatePath);
    state.selectedTemplatePath?.classList.remove('selected-template-path');
    state.selectedTemplatePath = null;
    state.selected = element || null;
    if (state.selected?.classList?.contains('texture-template-path')) {
      state.selectedTemplatePath = state.selected;
      setTemplatePathPreview(state.selectedTemplatePath, 'selected');
      state.selectedTemplatePath.classList.add('selected-template-path');
    } else {
      state.selected?.classList.add('selected');
    }
    renderSelection();
  }

  function clearSelection() {
    selectElement(null);
  }

  function editTextElement(group) {
    if (!group || group.dataset.type !== 'text') return;
    const textBox = group.querySelector('.texture-text-box');
    if (!textBox) return;

    if (state.textEditor?.group === group && textBox.getAttribute('contenteditable') === 'true') {
      textBox.focus({ preventScroll: true });
      return;
    }

    if (state.textEditor) {
      state.textEditor.commit();
    }
    selectElement(group);

    textBox.setAttribute('contenteditable', 'true');
    textBox.classList.add('is-editing');
    textBox.style.height = 'auto';
    const originalText = textBox.innerText;
    const originalData = getData(group);
    let isDone = false;
    const syncTextHeight = () => {
      if (isDone) return;
      if (autoFitTextHeight(group)) {
        renderSelection();
        scheduleTexturePreviewUpdate();
      }
    };
    const closeEditor = (commit) => {
      if (isDone) return;
      syncTextHeight();
      isDone = true;
      textBox.removeEventListener('keydown', handleKeydown);
      textBox.removeEventListener('input', handleInput);
      textBox.removeEventListener('pointerdown', handlePointerDown);
      textBox.removeEventListener('blur', handleBlur);
      if (commit) {
        textBox.textContent = textBox.innerText.trim() || defaultTextContent;
        textBox.style.height = '100%';
        autoFitTextHeight(group);
        saveHistory();
      } else {
        textBox.textContent = originalText;
        textBox.style.height = '100%';
        setData(group, originalData);
        renderSelection();
      }
      textBox.removeAttribute('contenteditable');
      textBox.classList.remove('is-editing');
      state.textEditor = null;
      renderSelection();
      scheduleTexturePreviewUpdate();
    };

    const handleKeydown = (event) => {
      event.stopPropagation();
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') closeEditor(true);
      if (event.key === 'Escape') closeEditor(false);
      requestAnimationFrame(syncTextHeight);
    };
    const handleInput = () => syncTextHeight();
    const handlePointerDown = (event) => event.stopPropagation();
    const handleBlur = () => closeEditor(true);
    textBox.addEventListener('keydown', handleKeydown);
    textBox.addEventListener('input', handleInput);
    textBox.addEventListener('pointerdown', handlePointerDown);
    textBox.addEventListener('blur', handleBlur);
    state.textEditor = {
      group,
      commit: () => closeEditor(true),
      cancel: () => closeEditor(false)
    };
    renderSelection();
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      const range = document.createRange();
      textBox.focus({ preventScroll: true });
      range.selectNodeContents(textBox);
      selection.removeAllRanges();
      selection.addRange(range);
      syncTextHeight();
    });
  }

  function buildElementToolbar(group) {
    elementToolbar.classList.toggle('is-surface-toolbar', group.classList?.contains('texture-template-path'));
    if (group.classList?.contains('texture-template-path')) {
      elementToolbar.innerHTML = '';
      const title = document.createElement('span');
      title.className = 'surface-toolbar-title';
      title.innerHTML = '<span class="surface-toolbar-icon" aria-hidden="true"></span> Surface color';
      const control = document.createElement('label');
      control.className = 'element-toolbar-control surface-color-control';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-chip';
      button.dataset.colorProp = 'color';
      const value = getColorValue(group, 'color');
      button.dataset.colorValue = value;
      button.style.background = colorToCss(value);
      button.setAttribute('aria-label', 'Area color');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', String(colorPopover.classList.contains('visible')));
      const valueLabel = document.createElement('span');
      valueLabel.className = 'surface-color-value';
      const parsedValue = parseColorState(value);
      valueLabel.textContent = parsedValue.mode === 'gradient' ? 'Gradient' : parsedValue.start.toUpperCase();
      control.appendChild(button);
      control.appendChild(valueLabel);
      elementToolbar.appendChild(title);
      elementToolbar.appendChild(control);
      positionElementToolbar(group);
      return;
    }
    const type = group.dataset.type;
    const data = getData(group);
    elementToolbar.innerHTML = '';

    const addColor = (label, value, name) => {
      const control = document.createElement('label');
      control.className = 'element-toolbar-control';
      control.textContent = label;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-chip';
      button.dataset.colorProp = name;
      button.dataset.colorValue = value;
      button.style.background = colorToCss(value);
      button.setAttribute('aria-label', label);
      control.appendChild(button);
      elementToolbar.appendChild(control);
    };
    const addNumber = (label, value, name, min, max) => {
      const control = document.createElement('label');
      control.className = 'element-toolbar-control';
      control.textContent = label;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = value;
      input.min = min;
      input.max = max;
      input.dataset.prop = name;
      control.appendChild(input);
      elementToolbar.appendChild(control);
    };

    if (type === 'text') {
      const textBox = group.querySelector('.texture-text-box');
      addNumber('Size', Math.round(data.fontSize), 'fontSize', 8, 160);
      addColor('Color', textBox?.dataset.color || '#111827', 'color');
      addNumber('Opacity', Math.round((parseFloat(group.getAttribute('opacity') || '1')) * 100), 'opacity', 0, 100);
    } else if (type === 'rect') {
      const rect = group.querySelector('rect.texture-content');
      addColor('Fill', rect?.getAttribute('fill') || '#3b82f6', 'color');
      addColor('Stroke', rect?.getAttribute('stroke') || '#1e3a8a', 'strokeColor');
      addNumber('W', rect?.getAttribute('stroke-width') || 2, 'lineWidth', 0, 40);
    } else if (type === 'image') {
      addNumber('Opacity', Math.round((parseFloat(group.getAttribute('opacity') || '1')) * 100), 'opacity', 0, 100);
    } else {
      const content = group.querySelector('.texture-content');
      addColor('Color', content?.getAttribute('stroke') || '#111827', 'color');
      addNumber('W', content?.getAttribute('stroke-width') || group.dataset.strokeWidth || 6, 'lineWidth', 1, 80);
      addNumber('Opacity', Math.round((parseFloat(group.getAttribute('opacity') || '1')) * 100), 'opacity', 0, 100);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'element-toolbar-delete';
    deleteButton.dataset.deleteElement = 'true';
    deleteButton.setAttribute('aria-label', 'Delete selected element');
    deleteButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
    elementToolbar.appendChild(deleteButton);

    positionElementToolbar(group);
  }

  function positionElementToolbar(group = state.selected) {
    if (!group) {
      elementToolbar.classList.remove('visible');
      return;
    }
    elementToolbar.classList.add('visible');
    const compact = window.matchMedia('(max-width: 900px)').matches;
    const edgeInset = compact ? 10 : 18;
    const toolbarWidth = elementToolbar.offsetWidth || 320;
    const availableWidth = Math.max(0, textureCanvasArea.clientWidth - edgeInset * 2);
    const centeredLeft = textureCanvasArea.scrollLeft
      + edgeInset
      + Math.max(0, (availableWidth - toolbarWidth) / 2);
    elementToolbar.style.left = `${centeredLeft}px`;
    elementToolbar.style.top = `${textureCanvasArea.scrollTop + edgeInset}px`;

    const expandedColorButton = elementToolbar.querySelector('[data-color-prop][aria-expanded="true"]');
    if (expandedColorButton && colorPopover.classList.contains('visible')) {
      positionColorPopover(expandedColorButton);
    }
  }

  function closeColorPopover() {
    colorPopover.classList.remove('visible');
    colorPopover.innerHTML = '';
    state.colorPicker = null;
    elementToolbar.querySelectorAll('[data-color-prop]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function openColorPopover(button) {
    const prop = button.dataset.colorProp;
    const group = state.selected;
    if (!group || !prop) return;
    const current = parseColorState(getColorValue(group, prop));
    const stops = normalizeGradientStops(current.stops, current.start, current.end).map((stop, index) => ({
      ...stop,
      id: `gradient-stop-${index + 1}`
    }));
    const activeStopId = stops[0].id;
    const activeHsv = rgbToHsv(...Object.values(hexToRgb(stops[0].color)));
    state.colorPicker = {
      prop,
      mode: current.mode,
      solidColor: current.start,
      stops,
      activeStopId,
      nextStopId: stops.length + 1,
      angle: current.angle,
      h: activeHsv.h,
      s: activeHsv.s,
      v: activeHsv.v,
      alpha: current.alpha
    };

    colorPopover.innerHTML = `
      <div class="color-mode" role="group" aria-label="Color type">
        <button type="button" data-mode="solid" aria-pressed="${current.mode === 'solid'}">Solid</button>
        <button type="button" data-mode="gradient" aria-pressed="${current.mode === 'gradient'}">Gradient</button>
      </div>
      <div class="gradient-editor" data-gradient-editor>
        <div class="gradient-editor-row">
          <div class="gradient-stop-track" data-gradient-track role="group" aria-label="Gradient color stops">
            <div class="gradient-stop-layer" data-gradient-stop-layer></div>
          </div>
          <button class="gradient-icon-button" type="button" data-add-gradient-stop aria-label="Add gradient stop">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="gradient-icon-button" type="button" data-reverse-gradient aria-label="Reverse gradient">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3"/></svg>
          </button>
        </div>
        <div class="gradient-angle-row">
          <label class="gradient-angle-field"><span>Angle</span><input type="number" min="0" max="359" data-color-field="angle" value="${current.angle}"><i>°</i></label>
          <div class="gradient-angle-dial" data-angle-dial role="slider" tabindex="0" aria-label="Gradient angle" aria-valuemin="0" aria-valuemax="359"><span aria-hidden="true"></span></div>
          <button class="gradient-icon-button gradient-delete-stop" type="button" data-delete-gradient-stop aria-label="Delete selected gradient stop">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>
      <div class="color-spectrum">
        <div class="color-area" data-color-area><span class="color-area-cursor"></span></div>
        <div class="hue-field" data-hue-field aria-label="Hue"><span class="hue-field-cursor"></span></div>
      </div>
      <div class="slider-row">
        <span>Opacity</span>
        <input class="alpha-slider" type="range" min="0" max="100" value="${current.alpha}" data-color-field="alpha">
        <output data-alpha-output>${current.alpha}</output>
      </div>
      <div class="color-value-row">
        <label class="color-field"><span>HEX</span><input data-color-field="hex" value="${current.start}" maxlength="7"></label>
        <button class="eyedropper-button" type="button" data-eyedropper aria-label="Pick a color from the screen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19 3 2 2-3.5 3.5-2-2L19 3ZM14.5 7.5l2 2-8.8 8.8-3.8.8.8-3.8 8.8-8.8Z"/></svg>
        </button>
      </div>
      <div class="recent-colors">
        <span>Recent</span>
        <div role="group" aria-label="Recent colors">
          ${['#111827', '#2563eb', '#22b8cf', '#7cb5ff', '#d6d9de', '#5b6069', '#ffffff'].map((color) => `
            <button type="button" data-recent-color="${color}" style="--recent-color:${color}" aria-label="Use ${color}"></button>
          `).join('')}
        </div>
      </div>
    `;
    if (!('EyeDropper' in window)) colorPopover.querySelector('[data-eyedropper]')?.setAttribute('hidden', '');
    colorPopover.classList.add('visible');
    positionColorPopover(button);
    button.setAttribute('aria-expanded', 'true');
    renderColorPopover();
  }

  function positionColorPopover(button) {
    if (!button || !colorPopover.classList.contains('visible')) return;
    const buttonRect = button.getBoundingClientRect();
    const areaRect = textureCanvasArea.getBoundingClientRect();
    const popoverWidth = colorPopover.offsetWidth || 336;
    const popoverHeight = colorPopover.offsetHeight || 560;
    const visibleLeft = textureCanvasArea.scrollLeft + 8;
    const visibleTop = textureCanvasArea.scrollTop + 8;
    const visibleRight = textureCanvasArea.scrollLeft + textureCanvasArea.clientWidth - 8;
    const visibleBottom = textureCanvasArea.scrollTop + textureCanvasArea.clientHeight - 8;
    const left = buttonRect.left - areaRect.left + textureCanvasArea.scrollLeft;
    let top = buttonRect.bottom - areaRect.top + textureCanvasArea.scrollTop + 8;
    if (top + popoverHeight > visibleBottom) {
      top = buttonRect.top - areaRect.top + textureCanvasArea.scrollTop - popoverHeight - 8;
    }
    colorPopover.style.left = `${Math.max(visibleLeft, Math.min(visibleRight - popoverWidth, left))}px`;
    colorPopover.style.top = `${Math.max(visibleTop, Math.min(visibleBottom - popoverHeight, top))}px`;
  }

  function getPickerCss() {
    if (!state.colorPicker) return '#111827';
    return state.colorPicker.mode === 'gradient'
      ? gradientFromStops(state.colorPicker.stops, state.colorPicker.alpha, state.colorPicker.angle)
      : rgbaFrom(state.colorPicker.solidColor, state.colorPicker.alpha);
  }

  function getActivePickerStop() {
    if (!state.colorPicker) return null;
    return state.colorPicker.stops.find((stop) => stop.id === state.colorPicker.activeStopId) || state.colorPicker.stops[0] || null;
  }

  function getActivePickerColor() {
    if (!state.colorPicker) return '#111827';
    return state.colorPicker.mode === 'gradient'
      ? getActivePickerStop()?.color || '#111827'
      : state.colorPicker.solidColor;
  }

  function syncPickerHsvFromActiveColor() {
    if (!state.colorPicker) return;
    const hsv = rgbToHsv(...Object.values(hexToRgb(getActivePickerColor())));
    state.colorPicker.h = hsv.h;
    state.colorPicker.s = hsv.s;
    state.colorPicker.v = hsv.v;
  }

  function mixHexColors(from, to, ratio) {
    const left = hexToRgb(from);
    const right = hexToRgb(to);
    return rgbToHex(
      left.r + (right.r - left.r) * ratio,
      left.g + (right.g - left.g) * ratio,
      left.b + (right.b - left.b) * ratio
    );
  }

  function colorAtGradientPosition(position) {
    const stops = [...state.colorPicker.stops].sort((left, right) => left.position - right.position);
    const nextIndex = stops.findIndex((stop) => stop.position >= position);
    if (nextIndex <= 0) return stops[0]?.color || '#111827';
    if (nextIndex < 0) return stops[stops.length - 1]?.color || '#111827';
    const left = stops[nextIndex - 1];
    const right = stops[nextIndex];
    const span = Math.max(0.001, right.position - left.position);
    return mixHexColors(left.color, right.color, (position - left.position) / span);
  }

  function addGradientStop(position) {
    if (!state.colorPicker || state.colorPicker.stops.length >= 12) return;
    const nextPosition = Math.max(0, Math.min(100, Number(position) || 0));
    const stop = {
      id: `gradient-stop-${state.colorPicker.nextStopId++}`,
      color: colorAtGradientPosition(nextPosition),
      position: nextPosition
    };
    state.colorPicker.stops.push(stop);
    state.colorPicker.stops.sort((left, right) => left.position - right.position);
    state.colorPicker.activeStopId = stop.id;
    syncPickerHsvFromActiveColor();
    renderColorPopover();
    applyColorPicker(false);
  }

  function addGradientStopInLargestGap() {
    const stops = [...state.colorPicker.stops].sort((left, right) => left.position - right.position);
    let position = 50;
    let largestGap = -1;
    for (let index = 1; index < stops.length; index += 1) {
      const gap = stops[index].position - stops[index - 1].position;
      if (gap > largestGap) {
        largestGap = gap;
        position = stops[index - 1].position + gap / 2;
      }
    }
    addGradientStop(position);
  }

  function deleteActiveGradientStop() {
    if (!state.colorPicker || state.colorPicker.stops.length <= 2) return;
    const index = state.colorPicker.stops.findIndex((stop) => stop.id === state.colorPicker.activeStopId);
    if (index < 0) return;
    state.colorPicker.stops.splice(index, 1);
    const next = state.colorPicker.stops[Math.min(index, state.colorPicker.stops.length - 1)];
    state.colorPicker.activeStopId = next.id;
    syncPickerHsvFromActiveColor();
    renderColorPopover();
    applyColorPicker(true);
  }

  function reverseGradientStops() {
    if (!state.colorPicker) return;
    state.colorPicker.stops.forEach((stop) => { stop.position = 100 - stop.position; });
    state.colorPicker.stops.sort((left, right) => left.position - right.position);
    renderColorPopover();
    applyColorPicker(true);
  }

  function updateGradientAngle(value, commit = false) {
    if (!state.colorPicker) return;
    state.colorPicker.angle = ((Math.round(Number(value) || 0) % 360) + 360) % 360;
    renderColorPopover();
    applyColorPicker(commit);
  }

  function renderColorPopover() {
    if (!state.colorPicker) return;
    colorPopover.querySelectorAll('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === state.colorPicker.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const gradientEditor = colorPopover.querySelector('[data-gradient-editor]');
    if (gradientEditor) gradientEditor.hidden = state.colorPicker.mode !== 'gradient';
    const gradientTrack = colorPopover.querySelector('[data-gradient-track]');
    if (gradientTrack) gradientTrack.style.background = gradientFromStops(state.colorPicker.stops, 100, 90);
    const stopLayer = colorPopover.querySelector('[data-gradient-stop-layer]');
    if (stopLayer) {
      stopLayer.innerHTML = state.colorPicker.stops.map((stop) => `
        <button
          type="button"
          class="gradient-stop-handle${stop.id === state.colorPicker.activeStopId ? ' active' : ''}"
          data-gradient-stop="${stop.id}"
          style="--stop-position:${stop.position}%;--stop-color:${stop.color}"
          aria-label="Gradient stop at ${Math.round(stop.position)}%"
          aria-pressed="${stop.id === state.colorPicker.activeStopId}"
        ><span></span></button>
      `).join('');
    }
    const addStopButton = colorPopover.querySelector('[data-add-gradient-stop]');
    if (addStopButton) addStopButton.disabled = state.colorPicker.stops.length >= 12;
    const deleteStopButton = colorPopover.querySelector('[data-delete-gradient-stop]');
    if (deleteStopButton) deleteStopButton.disabled = state.colorPicker.stops.length <= 2;
    const angleInput = colorPopover.querySelector('[data-color-field="angle"]');
    if (angleInput) angleInput.value = String(state.colorPicker.angle);
    const angleDial = colorPopover.querySelector('[data-angle-dial]');
    if (angleDial) {
      angleDial.style.setProperty('--gradient-angle', `${state.colorPicker.angle}deg`);
      angleDial.setAttribute('aria-valuenow', String(state.colorPicker.angle));
    }
    const hue = hsvToHex(state.colorPicker.h, 1, 1);
    const area = colorPopover.querySelector('.color-area');
    if (area) area.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})`;
    const cursor = colorPopover.querySelector('.color-area-cursor');
    if (cursor) {
      cursor.style.left = `${state.colorPicker.s * 100}%`;
      cursor.style.top = `${(1 - state.colorPicker.v) * 100}%`;
    }
    const hexInput = colorPopover.querySelector('[data-color-field="hex"]');
    if (hexInput) hexInput.value = getActivePickerColor().toUpperCase();
    const hueCursor = colorPopover.querySelector('.hue-field-cursor');
    if (hueCursor) hueCursor.style.top = `${(state.colorPicker.h / 360) * 100}%`;
    const alphaInput = colorPopover.querySelector('[data-color-field="alpha"]');
    if (alphaInput) alphaInput.value = state.colorPicker.alpha;
    const alphaOutput = colorPopover.querySelector('[data-alpha-output]');
    if (alphaOutput) alphaOutput.textContent = String(Math.round(Number(state.colorPicker.alpha) || 0));
    colorPopover.querySelectorAll('[data-recent-color]').forEach((button) => {
      button.classList.toggle('active', normalizeHex(button.dataset.recentColor) === normalizeHex(getActivePickerColor()));
    });
  }

  function applyColorPicker(commit = false) {
    if (!state.colorPicker) return;
    const value = getPickerCss();
    updateSelectedElement({ [state.colorPicker.prop]: value }, { commit });
    elementToolbar.querySelectorAll(`[data-color-prop="${state.colorPicker.prop}"]`).forEach((button) => {
      button.dataset.colorValue = value;
      button.style.background = value;
    });
    const surfaceValue = elementToolbar.querySelector('.surface-color-value');
    if (surfaceValue) {
      surfaceValue.textContent = state.colorPicker.mode === 'gradient'
        ? 'Gradient'
        : state.colorPicker.solidColor.toUpperCase();
    }
  }

  function setActiveColorFromHex(hex) {
    if (!state.colorPicker) return;
    const normalized = normalizeHex(hex);
    if (state.colorPicker.mode === 'gradient') {
      const stop = getActivePickerStop();
      if (stop) stop.color = normalized;
    } else {
      state.colorPicker.solidColor = normalized;
    }
    const rgb = hexToRgb(normalized);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    state.colorPicker.h = hsv.h;
    state.colorPicker.s = hsv.s;
    state.colorPicker.v = hsv.v;
  }

  function setActiveStop(stopId) {
    if (!state.colorPicker) return;
    if (!state.colorPicker.stops.some((stop) => stop.id === stopId)) return;
    state.colorPicker.activeStopId = stopId;
    syncPickerHsvFromActiveColor();
  }

  function setPickerHue(event) {
    if (!state.colorPicker) return;
    const field = colorPopover.querySelector('[data-hue-field]');
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    state.colorPicker.h = ratio * 360;
    setActiveColorFromHex(hsvToHex(state.colorPicker.h, state.colorPicker.s, state.colorPicker.v));
    renderColorPopover();
    applyColorPicker(false);
  }

  function updatePickerFromArea(event) {
    if (!state.colorPicker) return;
    const area = colorPopover.querySelector('[data-color-area]');
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    state.colorPicker.s = s;
    state.colorPicker.v = v;
    setActiveColorFromHex(hsvToHex(state.colorPicker.h, s, v));
    renderColorPopover();
    applyColorPicker(false);
  }

  function renderSelection() {
    selectionLayer.innerHTML = '';
    if (!state.selected) {
      positionElementToolbar(null);
      return;
    }
    const data = getData(state.selected);
    const screenMatrix = textureSvg.getScreenCTM();
    const selectionScale = Math.max(0.001, screenMatrix
      ? Math.hypot(screenMatrix.a, screenMatrix.b)
      : state.zoom);
    const screenUnit = 1 / selectionScale;
    const handleSize = 10 * screenUnit;
    const handleRadius = 2 * screenUnit;
    const isEditingText = state.selected.dataset.type === 'text'
      && state.textEditor?.group === state.selected;
    const box = createSvg('g', {
      class: 'selection-box',
      transform: `translate(${data.x} ${data.y}) rotate(${data.rotate} ${data.width / 2} ${data.height / 2})`
    });
    box.appendChild(createSvg('rect', {
      class: 'selection-outline',
      x: 0,
      y: 0,
      width: data.width,
      height: data.height
    }));

    if (state.selected.dataset.type === 'text' && !isEditingText) {
      box.appendChild(createSvg('rect', {
        class: 'selection-text-hit-area',
        'data-action': 'move',
        x: 0,
        y: 0,
        width: data.width,
        height: data.height
      }));
    }

    if (!state.selected.classList?.contains('texture-template-path') && !isEditingText) {
      [
        ['nw', 0, 0], ['n', data.width / 2, 0], ['ne', data.width, 0],
        ['e', data.width, data.height / 2], ['se', data.width, data.height],
        ['s', data.width / 2, data.height], ['sw', 0, data.height], ['w', 0, data.height / 2]
      ].forEach(([handle, x, y]) => {
        box.appendChild(createSvg('rect', {
          class: 'selection-handle',
          'data-action': 'resize',
          'data-handle': handle,
          x: x - handleSize / 2,
          y: y - handleSize / 2,
          width: handleSize,
          height: handleSize,
          rx: handleRadius,
          style: `cursor:${resizeCursor(handle, data.rotate + state.canvasRotation)}`
        }));
      });

      box.appendChild(createSvg('line', {
        class: 'selection-rotate-line',
        x1: data.width / 2,
        y1: -30 * screenUnit,
        x2: data.width / 2,
        y2: 0
      }));
      box.appendChild(createSvg('circle', {
        class: 'selection-rotate-handle',
        'data-action': 'rotate',
        cx: data.width / 2,
        cy: -38 * screenUnit,
        r: 8 * screenUnit
      }));
    }
    selectionLayer.appendChild(box);
    buildElementToolbar(state.selected);
  }

  toolButtons.text?.addEventListener('click', () => {
    createElement('text', { text: defaultTextContent, width: 190, height: 54 });
  });

  toolButtons.shape?.addEventListener('click', () => createElement('rect', { width: 120, height: 120 }));
  toolButtons.arrow?.addEventListener('click', () => createElement('arrow', { width: 150, height: 38 }));

  function importArtworkDataUrl(dataUrl) {
    if (!/^data:image\//i.test(String(dataUrl || ''))) return false;
    const artworkImage = new Image();
    let imported = false;
    const createArtwork = (naturalWidth = 190, naturalHeight = 142) => {
      if (imported) return;
      imported = true;
      const safeWidth = Math.max(1, naturalWidth);
      const safeHeight = Math.max(1, naturalHeight);
      const fitScale = Math.min(190 / safeWidth, 142 / safeHeight);
      const width = Math.max(minSize, safeWidth * fitScale);
      const height = Math.max(minSize, safeHeight * fitScale);
      createElement('image', { src: dataUrl, width, height });
      setTool('image');
      setAssetTrayOpen(true);
    };
    artworkImage.addEventListener('load', () => {
      createArtwork(artworkImage.naturalWidth, artworkImage.naturalHeight);
    }, { once: true });
    artworkImage.addEventListener('error', () => createArtwork(), { once: true });
    artworkImage.src = dataUrl;
    return true;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result), { once: true });
      reader.addEventListener('error', reject, { once: true });
      reader.readAsDataURL(blob);
    });
  }

  async function resolveArtworkDataUrl(source) {
    if (/^data:image\//i.test(String(source || ''))) return source;
    const sourceUrl = /^https:\/\//i.test(String(source || ''))
      ? window.UserProjects.textureUrl(source)
      : source;
    const response = await fetch(sourceUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Unable to load artwork');
    return blobToDataUrl(await response.blob());
  }

  async function addArtworkFromSource(source, button, persistedSource) {
    if (!source) return;
    try {
      const dataUrl = await resolveArtworkDataUrl(source);
      const storedUrl = persistedSource || (/^(?:https:\/\/|\/)/.test(String(source)) ? source : '');
      if (storedUrl) state.uploadedAssetUrls.set(dataUrl, storedUrl);
      imageAssetTrack?.querySelectorAll('.image-asset-card').forEach((card) => card.classList.remove('active'));
      button?.classList.add('active');
      importArtworkDataUrl(dataUrl);
      window.trackEvent?.(button?.classList.contains('is-uploaded')
        ? 'designer_artwork_upload_select'
        : 'designer_artwork_preset_select', {
        interaction_type: button?.classList.contains('is-uploaded') ? 'editor_asset_upload' : 'editor_asset_preset',
        item_id: modelDesignerConfig.modelSlug || ''
      });
    } catch (error) {
      console.warn('Failed to add artwork:', error);
      setDesignSaveStatus('Image could not be loaded', true);
    }
  }

  function createUploadedAssetCard(dataUrl, name = 'Uploaded image', storedUrl = '', imageId = '') {
    if (!imageAssetTrack) return null;
    const assetKey = storedUrl || dataUrl;
    if (!assetKey || renderedUploadedAssetKeys.has(assetKey)) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-asset-card is-uploaded';
    button.setAttribute('aria-label', `Add ${name}`);
    button.title = name;
    button.draggable = true;
    button.dataset.assetUrl = dataUrl;
    if (imageId) button.dataset.userImageId = imageId;
    button._assetDataUrl = dataUrl;
    button._assetUrl = storedUrl;
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = name;
    image.loading = 'lazy';
    image.decoding = 'async';
    button.appendChild(image);
    imageAssetTrack.insertBefore(button, imageAssetTrack.firstElementChild || null);
    renderedUploadedAssetKeys.add(assetKey);
    requestAnimationFrame(updateAssetTrayScrollState);
    return button;
  }

  function setUploadedAssetState(button, stateName, message = '') {
    if (!button) return;
    button.classList.toggle('is-uploading', stateName === 'uploading');
    button.classList.toggle('is-upload-failed', stateName === 'failed');
    if (stateName === 'uploading') button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
    if (message) {
      button.title = message;
      button.setAttribute('aria-label', message);
    }
  }

  async function loadUploadedArtworkLibrary() {
    if (!modelDesignerConfig.userAuthenticated || !window.UserProjects?.listImages || !imageAssetTrack) return;
    imageAssetTrack.setAttribute('aria-busy', 'true');
    try {
      const images = await window.UserProjects.listImages('artwork');
      images
        .filter((image) => image?.purpose === 'artwork' && /^(?:https:\/\/|\/)/.test(String(image.url || '')))
        .reverse()
        .forEach((image) => createUploadedAssetCard(image.url, image.name || 'Uploaded image', image.url, image.id));
    } catch (error) {
      console.warn('Saved artwork could not be loaded:', error);
    } finally {
      imageAssetTrack.removeAttribute('aria-busy');
      requestAnimationFrame(updateAssetTrayScrollState);
    }
  }

  function handleArtworkFiles(files) {
    const selectedFiles = [...(files || [])];
    const mimeByExtension = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
    const acceptedFiles = [];

    selectedFiles.forEach((file) => {
      const extension = String(file.name || '').split('.').pop().toLowerCase();
      const inferredMime = mimeByExtension[extension] || '';
      const mimeType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ? file.type : inferredMime;
      if (!mimeType) {
        setDesignSaveStatus(`${file.name || 'This file'} is not supported. Use PNG, JPG, or WebP.`, true);
        showImageUploadToast('Unsupported file. Use PNG, JPG, or WebP.', 'error', 5000);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setDesignSaveStatus(`${file.name || 'Image'} is larger than 10 MB.`, true);
        showImageUploadToast('Image is larger than 10 MB.', 'error', 5000);
        return;
      }
      acceptedFiles.push({ file, mimeType });
    });

    if (!selectedFiles.length) {
      setDesignSaveStatus('No image was selected', true);
      showImageUploadToast('No image was selected.', 'error', 3500);
    }

    acceptedFiles.forEach(({ file, mimeType }, index) => {
      const reader = new FileReader();
      let finishUploadTask;
      const uploadTask = new Promise((resolve) => {
        finishUploadTask = resolve;
      });
      state.pendingArtworkUploads.add(uploadTask);
      uploadTask.finally(() => state.pendingArtworkUploads.delete(uploadTask));
      reader.addEventListener('load', async () => {
        try {
          const dataUrl = String(reader.result || '');
          if (!dataUrl.startsWith('data:image/')) {
            setDesignSaveStatus(`${file.name || 'Image'} could not be read`, true);
            showImageUploadToast('Image could not be read.', 'error', 5000);
            return;
          }
          const button = createUploadedAssetCard(dataUrl, file.name);
          if (index === 0) await addArtworkFromSource(dataUrl, button);
          try {
            if (modelDesignerConfig.userAuthenticated && window.UserProjects) {
              setUploadedAssetState(button, 'uploading', `Uploading ${file.name}`);
              setDesignSaveStatus(`Uploading ${file.name}…`);
              showImageUploadToast(`Uploading ${file.name}…`, 'loading');
              const uploaded = await window.UserProjects.uploadImage(dataUrl, file.name, 'artwork');
              const storedUrl = uploaded.url;
              state.uploadedAssetUrls.set(dataUrl, storedUrl);
              button._assetUrl = storedUrl;
              button.dataset.assetUrl = dataUrl;
              if (uploaded.id) button.dataset.userImageId = uploaded.id;
              renderedUploadedAssetKeys.add(storedUrl);
              setUploadedAssetState(button, 'saved', `Add ${file.name}`);
              setDesignSaveStatus(`${file.name} uploaded`);
              showImageUploadToast(`${file.name} uploaded`, 'success', 2400);
            } else {
              showImageUploadToast(`${file.name} added`, 'success', 1800);
            }
          } catch (error) {
            console.error(error);
            setUploadedAssetState(button, 'failed', `${file.name} upload failed. Select it again to retry.`);
            setDesignSaveStatus(error.message || 'Image could not be saved', true);
            showImageUploadToast(error.message || 'Image could not be saved.', 'error', 6000);
          }
        } finally {
          finishUploadTask();
        }
      }, { once: true });
      reader.addEventListener('error', () => {
        setDesignSaveStatus(`${file.name || 'Image'} could not be read`, true);
        showImageUploadToast('Image could not be read.', 'error', 5000);
        finishUploadTask();
      }, { once: true });
      reader.addEventListener('abort', () => {
        setDesignSaveStatus(`${file.name || 'Image'} upload was cancelled`, true);
        showImageUploadToast('Image upload was cancelled.', 'error', 4000);
        finishUploadTask();
      }, { once: true });
      const readableFile = file.type === mimeType ? file : new Blob([file], { type: mimeType });
      setDesignSaveStatus(`Reading ${file.name}…`);
      showImageUploadToast(`Preparing ${file.name}…`, 'loading');
      reader.readAsDataURL(readableFile);
    });
  }

  toolButtons.image?.addEventListener('click', () => setAssetTrayOpen(true));
  imageAssetUpload?.addEventListener('click', () => imageAssetUploadInput?.click());
  imageAssetUploadInput?.addEventListener('change', (event) => {
    handleArtworkFiles(event.target.files);
    event.target.value = '';
  });
  imageAssetClose?.addEventListener('click', () => {
    setAssetTrayOpen(false);
    setTool('select');
    openAppearancePanel();
  });
  imageAssetFilter?.addEventListener('click', () => {
    const nextPressed = imageAssetFilter.getAttribute('aria-pressed') !== 'true';
    imageAssetFilter.setAttribute('aria-pressed', String(nextPressed));
    imageAssetTrack?.classList.toggle('show-uploaded-only', nextPressed);
    requestAnimationFrame(updateAssetTrayScrollState);
  });
  assetScrollPrev?.addEventListener('click', () => {
    imageAssetViewport?.scrollBy({ left: -Math.max(240, imageAssetViewport.clientWidth * 0.62), behavior: 'smooth' });
  });
  assetScrollNext?.addEventListener('click', () => {
    imageAssetViewport?.scrollBy({ left: Math.max(240, imageAssetViewport.clientWidth * 0.62), behavior: 'smooth' });
  });
  imageAssetViewport?.addEventListener('scroll', updateAssetTrayScrollState, { passive: true });

  imageAssetTrack?.addEventListener('click', (event) => {
    const button = event.target.closest('.image-asset-card:not(.image-asset-upload)');
    if (!button) return;
    addArtworkFromSource(button._assetDataUrl || button.dataset.assetUrl, button, button._assetUrl || button.dataset.assetUrl);
  });

  imageAssetTrack?.addEventListener('dragstart', (event) => {
    const button = event.target.closest('.image-asset-card:not(.image-asset-upload)');
    if (!button || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', button._assetDataUrl || button.dataset.assetUrl || '');
    event.dataTransfer.setData('application/x-garment-artwork', 'true');
  });

  imageAssetTrack?.querySelectorAll('.image-asset-card:not(.image-asset-upload)').forEach((button) => {
    button.draggable = true;
  });
  loadUploadedArtworkLibrary();

  textureCanvasArea?.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('application/x-garment-artwork')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    textureCanvasArea.classList.add('is-artwork-drop-target');
  });
  textureCanvasArea?.addEventListener('dragleave', () => textureCanvasArea.classList.remove('is-artwork-drop-target'));
  textureCanvasArea?.addEventListener('drop', (event) => {
    const source = event.dataTransfer?.getData('text/plain');
    if (!source) return;
    event.preventDefault();
    textureCanvasArea.classList.remove('is-artwork-drop-target');
    addArtworkFromSource(source);
  });

  function startDraw(event) {
    const point = svgPoint(event);
    const path = createSvg('path', {
      d: `M ${point.x} ${point.y}`,
      fill: 'none',
      stroke: '#111827',
      'stroke-width': 6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });
    textureElements.appendChild(path);
    state.active = { mode: 'draw', path, points: [point] };
  }

  function finishDraw() {
    if (!state.active || state.active.mode !== 'draw') return;
    const { path, points } = state.active;
    state.active = null;
    if (points.length < 2) {
      path.remove();
      return;
    }
    const bbox = path.getBBox();
    const d = points.map((point, index) => {
      const cmd = index === 0 ? 'M' : 'L';
      return `${cmd} ${point.x - bbox.x} ${point.y - bbox.y}`;
    }).join(' ');
    path.remove();
    createElement('path', {
      x: bbox.x,
      y: bbox.y,
      width: Math.max(minSize, bbox.width),
      height: Math.max(minSize, bbox.height),
      baseWidth: Math.max(minSize, bbox.width),
      baseHeight: Math.max(minSize, bbox.height),
      d
    });
  }

  textureSvg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('[data-editor-toolbar]')) {
      event.stopPropagation();
      return;
    }
    if (event.target.closest('.texture-text-box.is-editing')) {
      event.stopPropagation();
      return;
    }
    if (state.tool === 'pan') {
      textureSvg.setPointerCapture(event.pointerId);
      state.active = {
        mode: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: textureCanvasArea.scrollLeft,
        startScrollTop: textureCanvasArea.scrollTop
      };
      textureSvg.style.cursor = 'grabbing';
      return;
    }

    if (state.tool === 'draw') {
      event.preventDefault();
      textureSvg.setPointerCapture(event.pointerId);
      startDraw(event);
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget && state.selected) {
      event.preventDefault();
      textureSvg.setPointerCapture(event.pointerId);
      state.active = {
        mode: actionTarget.dataset.action,
        handle: actionTarget.dataset.handle,
        startPoint: svgPoint(event),
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        startData: getData(state.selected)
      };
      return;
    }

    const target = event.target.closest('.texture-element');
    const templatePath = event.target.closest('.texture-template-path');
    if (templatePath) {
      event.preventDefault();
      selectElement(templatePath);
      scheduleTexturePreviewUpdate();
      requestAnimationFrame(() => {
        const surfaceColorButton = elementToolbar.querySelector('[data-color-prop="color"]');
        if (surfaceColorButton && state.selected === templatePath) {
          openColorPopover(surfaceColorButton);
        }
      });
      return;
    }
    if (target) {
      event.preventDefault();
      textureSvg.setPointerCapture(event.pointerId);
      selectElement(target);
      state.active = {
        mode: 'move',
        startPoint: svgPoint(event),
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        startData: getData(target)
      };
    } else {
      clearSelection();
    }
  });

  textureSvg.addEventListener('pointerover', (event) => {
    const templatePath = event.target.closest('.texture-template-path');
    if (!templatePath) return;
    if (templatePath !== state.selectedTemplatePath) {
      setTemplatePathPreview(templatePath, 'hover');
    }
    previewHoveredTemplatePath(templatePath);
  });

  textureSvg.addEventListener('pointerout', (event) => {
    const templatePath = event.target.closest('.texture-template-path');
    if (!templatePath) return;
    if (templatePath !== state.selectedTemplatePath) {
      restoreTemplatePathPreview(templatePath);
    }
    clearHoveredTemplatePreview(templatePath);
  });

  textureSvg.addEventListener('dblclick', (event) => {
    const target = event.target.closest('.texture-element')
      || (event.target.closest('.selection-text-hit-area') ? state.selected : null);
    if (!target || target.dataset.type !== 'text') return;
    event.preventDefault();
    event.stopPropagation();
    editTextElement(target);
  });

  textureSvg.addEventListener('pointermove', (event) => {
    if (!state.active) return;
    const point = svgPoint(event);

    if (state.active.mode === 'pan') {
      textureCanvasArea.scrollLeft = state.active.startScrollLeft - (event.clientX - state.active.startClientX);
      textureCanvasArea.scrollTop = state.active.startScrollTop - (event.clientY - state.active.startClientY);
      return;
    }

    if (state.active.mode === 'draw') {
      state.active.points.push(point);
      state.active.path.setAttribute('d', `${state.active.path.getAttribute('d')} L ${point.x} ${point.y}`);
      return;
    }

    if (!state.selected) return;
    const start = state.active.startPoint;
    const data = state.active.startData;
    const dx = point.x - start.x;
    const dy = point.y - start.y;

    if (state.active.mode === 'move') {
      if (Math.hypot(
        event.clientX - state.active.startClientX,
        event.clientY - state.active.startClientY
      ) > 4) {
        state.active.moved = true;
      }
      setData(state.selected, constrainToCanvas({ ...data, x: data.x + dx, y: data.y + dy }));
    } else if (state.active.mode === 'resize') {
      const isText = state.selected.dataset.type === 'text';
      const isImage = state.selected.dataset.type === 'image';
      const handle = state.active.handle;
      const isCorner = handle.length === 2;
      const patch = resizeFromPointer(data, handle, dx, dy, {
        minSize,
        lockAspect: event.shiftKey || (isImage && isCorner) || (isText && isCorner)
      });
      if (isText) {
        patch.fontSize = isCorner
          ? Math.max(8, data.fontSize * patch.scale)
          : data.fontSize;
      }
      setData(state.selected, constrainToCanvas({ ...data, ...patch }));
      if (isText && (handle === 'e' || handle === 'w')) {
        const textBox = state.selected.querySelector('.texture-text-box');
        if (textBox) {
          const previousHeight = textBox.style.height;
          textBox.style.height = 'auto';
          const fittedHeight = Math.max(minSize, Math.ceil(textBox.scrollHeight));
          textBox.style.height = previousHeight || '100%';
          setData(state.selected, constrainToCanvas({
            ...placeRectAtFixedAnchor(data, handle, patch.width, fittedHeight),
            fontSize: data.fontSize
          }));
        }
      }
    } else if (state.active.mode === 'rotate') {
      const cx = data.x + data.width / 2;
      const cy = data.y + data.height / 2;
      const startAngle = Math.atan2(start.y - cy, start.x - cx);
      const currentAngle = Math.atan2(point.y - cy, point.x - cx);
      setData(state.selected, constrainToCanvas({
        ...data,
        rotate: data.rotate + (currentAngle - startAngle) * 180 / Math.PI
      }));
    }
    renderSelection();
    scheduleTexturePreviewUpdate();
  });

  function endInteraction(event) {
    if (!state.active) return;
    const active = state.active;
    const mode = active.mode;
    const clickedText = mode === 'move' && !active.moved && state.selected?.dataset.type === 'text'
      ? state.selected
      : null;
    let shouldEditText = false;
    if (clickedText) {
      const now = Number(event.timeStamp) || performance.now();
      const previous = state.textClickCandidate;
      const closeInTime = previous && now - previous.time <= 500;
      const closeOnScreen = previous && Math.hypot(
        event.clientX - previous.clientX,
        event.clientY - previous.clientY
      ) <= 8;
      shouldEditText = Boolean(previous?.group === clickedText && closeInTime && closeOnScreen);
      state.textClickCandidate = shouldEditText
        ? null
        : { group: clickedText, time: now, clientX: event.clientX, clientY: event.clientY };
    } else if (mode === 'move') {
      state.textClickCandidate = null;
    }
    if (mode === 'draw') {
      finishDraw();
    } else if (mode !== 'pan') {
      saveHistory();
    }
    state.active = null;
    if (state.tool === 'pan') {
      textureSvg.style.cursor = 'grab';
    }
    if (event.pointerId !== undefined && textureSvg.hasPointerCapture(event.pointerId)) {
      textureSvg.releasePointerCapture(event.pointerId);
    }
    if (shouldEditText) requestAnimationFrame(() => editTextElement(clickedText));
  }

  textureSvg.addEventListener('pointerup', endInteraction);
  textureSvg.addEventListener('pointercancel', endInteraction);

  elementToolbar.addEventListener('input', (event) => {
    const input = event.target.closest('[data-prop]');
    if (!input) return;
    event.stopPropagation();
    updateSelectedElement({ [input.dataset.prop]: input.value });
  });

  elementToolbar.addEventListener('change', (event) => {
    const input = event.target.closest('[data-prop]');
    if (!input) return;
    event.stopPropagation();
    updateSelectedElement({ [input.dataset.prop]: input.value }, { commit: true });
  });

  elementToolbar.addEventListener('keydown', (event) => {
    const input = event.target.closest('[data-prop]');
    if (!input) return;
    event.stopPropagation();
    if (event.key === 'Enter') {
      updateSelectedElement({ [input.dataset.prop]: input.value }, { commit: true });
      input.blur();
    }
  });

  elementToolbar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-editor-toolbar]')) {
      event.stopPropagation();
    }
  });

  elementToolbar.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-element]');
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      deleteSelected();
      return;
    }
    const button = event.target.closest('[data-color-prop]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openColorPopover(button);
  });

  colorPopover.addEventListener('pointerdown', (event) => event.stopPropagation());
  colorPopover.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-mode]');
    const stopButton = event.target.closest('[data-gradient-stop]');
    const recentButton = event.target.closest('[data-recent-color]');
    if (!state.colorPicker) return;
    if (modeButton) {
      if (modeButton.dataset.mode === 'solid' && state.colorPicker.mode === 'gradient') {
        state.colorPicker.solidColor = getActivePickerColor();
      }
      state.colorPicker.mode = modeButton.dataset.mode;
      syncPickerHsvFromActiveColor();
    } else if (stopButton) {
      setActiveStop(stopButton.dataset.gradientStop);
    } else if (event.target.closest('[data-add-gradient-stop]')) {
      addGradientStopInLargestGap();
      return;
    } else if (event.target.closest('[data-reverse-gradient]')) {
      reverseGradientStops();
      return;
    } else if (event.target.closest('[data-delete-gradient-stop]')) {
      deleteActiveGradientStop();
      return;
    } else if (recentButton) {
      setActiveColorFromHex(recentButton.dataset.recentColor);
    } else if (event.target.closest('[data-eyedropper]') && 'EyeDropper' in window) {
      new window.EyeDropper().open().then((result) => {
        setActiveColorFromHex(result.sRGBHex);
        renderColorPopover();
        applyColorPicker(true);
      }).catch(() => {});
      return;
    } else {
      return;
    }
    renderColorPopover();
    applyColorPicker(false);
  });
  colorPopover.addEventListener('input', (event) => {
    const field = event.target.closest('[data-color-field]');
    if (!field || !state.colorPicker) return;
    const key = field.dataset.colorField;
    if (key === 'alpha') {
      state.colorPicker[key] = field.value;
    } else if (key === 'angle') {
      updateGradientAngle(field.value, false);
      return;
    } else {
      if (!/^#?[0-9a-fA-F]{6}$/.test(field.value)) return;
      setActiveColorFromHex(field.value);
    }
    renderColorPopover();
    applyColorPicker(false);
  });
  colorPopover.addEventListener('change', () => applyColorPicker(true));
  colorPopover.addEventListener('keydown', (event) => {
    const dial = event.target.closest('[data-angle-dial]');
    if (!dial || !state.colorPicker || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
    updateGradientAngle(state.colorPicker.angle + direction * (event.shiftKey ? 15 : 1), true);
  });
  colorPopover.addEventListener('pointerdown', (event) => {
    const stopButton = event.target.closest('[data-gradient-stop]');
    const track = event.target.closest('[data-gradient-track]');
    if (!track || !state.colorPicker || state.colorPicker.mode !== 'gradient') return;
    event.preventDefault();
    const trackRect = track.getBoundingClientRect();
    const positionFromEvent = (pointerEvent) => Math.max(0, Math.min(100,
      ((pointerEvent.clientX - trackRect.left) / Math.max(1, trackRect.width)) * 100
    ));
    if (!stopButton) {
      addGradientStop(positionFromEvent(event));
      applyColorPicker(true);
      return;
    }
    const stopId = stopButton.dataset.gradientStop;
    setActiveStop(stopId);
    renderColorPopover();
    const handleMove = (moveEvent) => {
      const stop = state.colorPicker?.stops.find((item) => item.id === stopId);
      if (!stop) return;
      stop.position = positionFromEvent(moveEvent);
      state.colorPicker.stops.sort((left, right) => left.position - right.position);
      renderColorPopover();
      applyColorPicker(false);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      applyColorPicker(true);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  });
  colorPopover.addEventListener('pointerdown', (event) => {
    const dial = event.target.closest('[data-angle-dial]');
    if (!dial || !state.colorPicker || state.colorPicker.mode !== 'gradient') return;
    event.preventDefault();
    const updateFromPointer = (pointerEvent) => {
      const rect = dial.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(pointerEvent.clientY - centerY, pointerEvent.clientX - centerX) * 180 / Math.PI + 90;
      updateGradientAngle(angle, false);
    };
    updateFromPointer(event);
    const handleMove = (moveEvent) => updateFromPointer(moveEvent);
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      applyColorPicker(true);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  });
  colorPopover.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-color-area]')) return;
    event.preventDefault();
    updatePickerFromArea(event);
    const handleMove = (moveEvent) => updatePickerFromArea(moveEvent);
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      applyColorPicker(true);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  });
  colorPopover.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-hue-field]')) return;
    event.preventDefault();
    setPickerHue(event);
    const handleMove = (moveEvent) => setPickerHue(moveEvent);
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      applyColorPicker(true);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!colorPopover.classList.contains('visible')) return;
    if (event.target.closest('[data-editor-toolbar]')) return;
    closeColorPopover();
  });

  textureCanvasArea.addEventListener('scroll', () => positionElementToolbar());
  window.addEventListener('resize', () => {
    positionElementToolbar();
    updateAssetTrayScrollState();
    if (state.zoomMode === 'fit' && designModal.classList.contains('active')) fitCanvasZoom();
  });

  function saveHistory() {
    const snapshot = getCleanElementsHtml();
    if (state.history[state.historyIndex] === snapshot) return;
    const hadHistory = state.historyIndex >= 0;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    state.historyIndex++;
    if (hadHistory) setDesignSaveStatus('Unapplied changes', true);
    scheduleTexturePreviewUpdate();
  }

  function restoreHistory(index) {
    textureElements.innerHTML = state.history[index] || '';
    selectElement(null);
    const ids = [...textureElements.querySelectorAll('.texture-element')]
      .map(element => parseInt((element.id || '').replace('element-', ''), 10))
      .filter(Number.isFinite);
    state.elementCounter = Math.max(state.elementCounter, 0, ...ids);
    setDesignSaveStatus('Unapplied changes', true);
    scheduleTexturePreviewUpdate();
  }

  function undo() {
    state.textEditor?.commit();
    if (state.historyIndex > 0) {
      state.historyIndex--;
      restoreHistory(state.historyIndex);
    }
  }

  function redo() {
    state.textEditor?.commit();
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      restoreHistory(state.historyIndex);
    }
  }

  function deleteSelected() {
    state.textEditor?.cancel();
    if (!state.selected) return;
    state.selected.remove();
    clearSelection();
    saveHistory();
  }

  document.getElementById('toolUndo')?.addEventListener('click', undo);
  document.getElementById('toolRedo')?.addEventListener('click', redo);
  document.getElementById('toolDelete')?.addEventListener('click', deleteSelected);

  document.addEventListener('keydown', (event) => {
    if (document.getElementById('modelMockupModal')?.classList.contains('active')) {
      return;
    }
    if (customizationInquiryModal.classList.contains('active')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCustomizationInquiry();
      }
      return;
    }
    if (!designModal.classList.contains('active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (colorPopover.classList.contains('visible')) closeColorPopover();
      else if (imageAssetTray && !imageAssetTray.hidden) {
        setAssetTrayOpen(false);
        setTool('select');
        openAppearancePanel();
      }
      else if (designAppearancePanel?.classList.contains('is-mobile-open')) designAppearancePanel.classList.remove('is-mobile-open');
      else closeModal();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
      event.preventDefault();
      deleteSelected();
    }
  });

  designerViewer?.addEventListener('load', () => {
    if (designPreviewLoading) designPreviewLoading.hidden = true;
    renderStandardPromise.then((renderStandard) => applyFabricLighting(designerViewer, renderStandard));
    if (state.selectedMaterial) {
      applyMaterialToViewer(designerViewer, state.selectedMaterial);
    }
    scheduleTexturePreviewUpdate({ requireArtwork: true });
  });
  detailViewer?.addEventListener('load', () => {
    const designedTexture = state.finalTextureUrl || state.appliedTextureUrl;
    if (designedTexture) {
      applyTextureToViewer(detailViewer, designedTexture);
    }
  });
  saveDesignModal?.addEventListener('click', saveDesignAndClose);
  renderCurrentModelBtn?.addEventListener('click', renderCurrentModelImage);
  customizationInquiryBtn?.addEventListener('click', openCustomizationInquiry);
  customizationInquiryOverlay?.addEventListener('click', closeCustomizationInquiry);
  customizationInquiryClose?.addEventListener('click', closeCustomizationInquiry);
  customizationInquiryCancel?.addEventListener('click', closeCustomizationInquiry);
  customizationInquiryDone?.addEventListener('click', closeCustomizationInquiry);
  customizationRefreshSnapshots?.addEventListener('click', prepareCustomizationSnapshots);
  customizationInquiryForm?.addEventListener('submit', submitCustomizationInquiry);

  async function applyQuickMaterial(materialId) {
    const material = window.Design3DMaterials?.materials?.find((item) => item.id === materialId);
    if (!material) throw new Error('Material preset is unavailable.');
    await applyMaterialPreset(material);
    return { id: material.id, name: material.name };
  }

  async function applyQuickColor(color) {
    const normalized = normalizeHex(color);
    await loadTextureDimensions();
    state.fillScope = 'whole';
    state.fillMode = 'solid';
    if (appearanceColorStart) appearanceColorStart.value = normalized;
    if (appearanceColorEnd) appearanceColorEnd.value = normalized;
    const paths = [...textureSvg.querySelectorAll('.texture-template-path')];
    if (!paths.length) throw new Error('Garment surfaces are still loading.');
    paths.forEach((path) => setElementColor(path, normalized));
    renderAppearanceControls();
    renderSelection();
    setDesignSaveStatus('Unapplied changes', true);
    const textureUrl = await rasterizeModelTexture();
    state.finalTextureUrl = textureUrl;
    state.appliedTextureUrl = textureUrl;
    await Promise.all(getLoadedDesignViewers().map((viewerElement) => applyTextureToViewer(viewerElement, textureUrl)));
    saveHistory();
    return normalized;
  }

  window.applyModelQuickMaterial = applyQuickMaterial;
  window.applyModelQuickColor = applyQuickColor;

  // Initialize history
  renderMaterialSwatches();
  saveHistory();

  function parseSavedProjectElements(elementsMarkup) {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="${SVG_NS}"><g id="savedProjectElements">${String(elementsMarkup || '')}</g></svg>`,
      'image/svg+xml'
    );
    if (parsed.querySelector('parsererror')) {
      throw new Error('Saved project artwork could not be read.');
    }
    const elements = parsed.getElementById('savedProjectElements');
    if (!elements) throw new Error('Saved project artwork is missing.');
    return elements;
  }

  function replaceTextureElements(savedElements) {
    const imported = [...savedElements.childNodes].map((node) => document.importNode(node, true));
    textureElements.replaceChildren(...imported);
  }

  async function loadCloudProject() {
    if (!window.UserProjects) return;
    try {
      const project = await window.UserProjects.loadProjectFromUrl('3d');
      if (!project) return;
      const currentSourceId = String(modelDesignerConfig.modelId || modelDesignerConfig.modelSlug || '');
      if (project.sourceId && project.sourceId !== currentSourceId) throw new Error('This project uses another 3D model.');
      await loadTextureDimensions();
      const saved = project.designData || {};
      const wrapper = parseSavedProjectElements(saved.elements);
      await Promise.all([...wrapper.querySelectorAll('image')].map(async (image) => {
        const storedUrl = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
        if (!storedUrl) return;
        const dataUrl = await resolveArtworkDataUrl(storedUrl);
        state.uploadedAssetUrls.set(dataUrl, storedUrl);
        image.setAttribute('href', dataUrl);
        image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
      }));
      replaceTextureElements(wrapper);
      state.projectId = project.id;
      state.projectName = project.name;
      state.fillScope = saved.fillScope || 'whole';
      state.fillMode = saved.fillMode || 'gradient';
      state.finalTextureUrl = saved.textureUrl || null;
      window.syncModelTryOnLinks?.(project.id);
      if (saved.appearance) restoreAppearanceState(saved.appearance);
      else if (saved.textureUrl) await restoreLegacyAppearanceFromTexture(saved.textureUrl);
      if (!saved.textureUrl) {
        state.finalTextureUrl = await rasterizeModelTexture({ includeSelectionHighlight: false });
      }
      persistTryOnDesign(state.finalTextureUrl);
      const elementIds = [...textureElements.querySelectorAll('.texture-element')]
        .map(element => Number.parseInt(String(element.id || '').replace('element-', ''), 10))
        .filter(Number.isFinite);
      state.elementCounter = Math.max(0, ...elementIds);
      state.history = [];
      state.historyIndex = -1;
      saveHistory();
      renderAppearanceControls();
      await window.loadClothingModelViewer?.(detailViewer).catch(() => null);
      if (saved.materialId && window.Design3DMaterials) {
        const material = window.Design3DMaterials.materials.find(item => item.id === saved.materialId);
        if (material) await applyMaterialPreset(material);
      }
      if (state.finalTextureUrl) {
        const applied = await Promise.all(getLoadedDesignViewers().map(viewerElement => applyTextureToViewer(viewerElement, state.finalTextureUrl)));
        if (!applied.some(Boolean)) throw new Error('Saved project texture could not be applied.');
      }
      setDesignSaveStatus('Saved project loaded');
    } catch (error) {
      console.error(error);
      setDesignSaveStatus(error.status === 401 ? 'Sign in to open this project' : (error.message || 'Project could not be loaded'), true);
    }
  }
  cloudProjectLoadPromise = loadCloudProject();

  let pendingArtwork = null;
  try {
    pendingArtwork = JSON.parse(sessionStorage.getItem('clothingdesign_pending_artwork') || 'null');
  } catch (error) {
    pendingArtwork = null;
  }
  sessionStorage.removeItem('clothingdesign_pending_artwork');
  const pendingArtworkIsFresh = pendingArtwork?.dataUrl && Date.now() - Number(pendingArtwork.createdAt || 0) < 10 * 60 * 1000;
  let pendingArtworkImported = false;
  const openDesignFromNavigation = () => {
    if (!pendingArtworkIsFresh) return;
    window.setTimeout(() => {
      if (!designModal.classList.contains('active')) openModal();
      if (pendingArtworkIsFresh && !pendingArtworkImported) {
        importArtworkDataUrl(pendingArtwork.dataUrl);
        saveHistory();
        pendingArtworkImported = true;
      }
    }, 80);
  };
  openDesignFromNavigation();
  window.addEventListener('load', openDesignFromNavigation, { once: true });
  window.openModelDesigner = openModal;
  window.renderCurrentModelImage = renderCurrentModelImage;
  window.openModelCustomizationInquiry = openCustomizationInquiry;
};
})();
