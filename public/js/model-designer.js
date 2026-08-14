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
  const designSaveStatus = document.getElementById('designSaveStatus');
  const designSaveStatusText = document.getElementById('designSaveStatusText');
  const downloadRenderBtn = document.getElementById('downloadRenderBtn');
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
  const detailViewer = document.querySelector('#model3dViewer model-viewer');
  const textureCanvasArea = document.querySelector('.texture-canvas-area');
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
  const elementToolbar = document.createElement('div');
  elementToolbar.className = 'element-toolbar';
  elementToolbar.dataset.editorToolbar = 'true';
  textureCanvasArea.appendChild(elementToolbar);
  const colorPopover = document.createElement('div');
  colorPopover.className = 'color-popover';
  colorPopover.dataset.editorToolbar = 'true';
  textureCanvasArea.appendChild(colorPopover);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const defaultTextContent = modelDesignerConfig.defaultTextContent || 'Text';
  const currentModelCategory = modelDesignerConfig.currentModelCategory || '';
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
      webOrbit: '-48deg 72deg 142%',
      webFieldOfView: '28deg',
      webTarget: 'auto auto auto'
    },
    web: {
      environmentImage: 'neutral',
      shadowIntensity: 1.7,
      shadowSoftness: 0.48,
      exposure: 0.78,
      toneMapping: 'aces'
    }
  };
  const renderStandardPromise = fetch('/config/design3d-render-standard.json')
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
    svgWidth: 800,
    svgHeight: 600,
    zoom: 1,
    zoomMode: 'fit',
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
    materialTextureCache: new WeakMap(),
    finalTextureUrl: null,
    isExportingRender: false,
    isCapturingInquiry: false,
    isSubmittingInquiry: false,
    inquirySnapshots: null,
    coverCaptureHidden: []
  };
  let modalReturnFocus = null;
  let customizationReturnFocus = null;

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

  function applyCanvasZoom(nextZoom, mode = 'manual') {
    const zoom = Math.min(2.5, Math.max(0.2, Number(nextZoom) || 1));
    state.zoom = zoom;
    state.zoomMode = mode;
    textureSvg.style.width = `${state.svgWidth * zoom}px`;
    textureSvg.style.height = `${state.svgHeight * zoom}px`;
    textureSvg.style.maxWidth = 'none';
    textureSvg.style.maxHeight = 'none';
    if (canvasZoomLabel) canvasZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    requestAnimationFrame(() => renderSelection());
  }

  function fitCanvasZoom() {
    if (!textureCanvasArea || !state.svgWidth || !state.svgHeight) return;
    const isCompact = window.matchMedia('(max-width: 900px)').matches;
    const availableWidth = Math.max(160, textureCanvasArea.clientWidth - (isCompact ? 28 : 48));
    const availableHeight = Math.max(120, textureCanvasArea.clientHeight - (isCompact ? 118 : 154));
    const fitScale = Math.min(availableWidth / state.svgWidth, availableHeight / state.svgHeight, 1.4);
    applyCanvasZoom(fitScale, 'fit');
  }

  function openModal() {
    modalReturnFocus = document.activeElement;
    designModal.classList.add('active');
    designModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    loadTextureDimensions();
    renderSelection();
    window.loadClothingModelViewer?.(designerViewer).catch((error) => {
      console.warn('Failed to load the design preview:', error);
    });
    requestAnimationFrame(() => {
      fitCanvasZoom();
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

  function getSelectedMaterialFactor() {
    const material = state.selectedMaterial;
    if (!material) return [1, 1, 1, 1];
    return [...hexToRgbUnit(material.color), 1];
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

  function resetArtworkTextureTransform(textureInfo) {
    const sampler = textureInfo?.texture?.sampler;
    if (!sampler) return;
    // Fabric maps in the source GLB may intentionally tile. A designed UV image is
    // already a complete atlas, so it must always use the model's UVs one-to-one.
    sampler.setRotation?.(null);
    sampler.setScale?.(null);
    sampler.setOffset?.(null);
  }

  function hasEditableArtwork() {
    return Boolean(
      textureElements?.children.length > 0 ||
      textureSvg?.querySelector('.texture-template-fill[data-persistent="true"]')
    );
  }

  async function loadMaterialMaps(viewerElement, material, options = {}) {
    const maps = {};
    const mapNames = options.includeBaseColorMap
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
      const colorFactor = [...hexToRgbUnit(material.color), 1];
      const maps = await loadMaterialMaps(viewerElement, material, {
        includeBaseColorMap: options.includeBaseColorMap === true
      });
      materials.forEach((modelMaterial) => {
        const pbr = modelMaterial.pbrMetallicRoughness;
        pbr?.setBaseColorFactor?.(colorFactor);
        pbr?.setMetallicFactor?.(material.metalness ?? 0);
        pbr?.setRoughnessFactor?.(material.roughness ?? 0.8);
        if (maps.baseColor) {
          if (!setMaterialTextureSlot(pbr?.baseColorTexture, maps.baseColor)) {
            pbr?.setBaseColorTexture?.(maps.baseColor);
          }
        }
        setMaterialTextureSlot(modelMaterial.normalTexture, maps.normal);
        modelMaterial.normalTexture?.setScale?.(material.normalScale ?? 0.1);
        if (maps.roughness) {
          setMaterialTextureSlot(pbr?.metallicRoughnessTexture, maps.roughness);
        }
      });
    } catch (error) {
      console.warn('Failed to apply material preset:', error);
    }
  }

  async function applyMaterialPreset(material) {
    state.selectedMaterial = material;
    setDesignSaveStatus('Unsaved changes', true);
    materialSwatchGrid?.querySelectorAll('.material-swatch').forEach((button) => {
      button.classList.toggle('active', button.dataset.materialId === material.id);
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
    const materials = categoryInputs
      .map(value => window.Design3DMaterials.getMaterialsForCategory(value))
      .find(items => items.length > 0) || [];
    materialSwatchGrid.innerHTML = '';
    if (materialCount) materialCount.textContent = String(materials.length);
    materials.forEach((material) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'material-swatch';
      button.dataset.materialId = material.id;
      button.title = `${material.name}: ${material.weave}`;
      button.innerHTML = `
        <span class="material-ball" aria-hidden="true"></span>
        <span class="material-swatch-name">${material.name}</span>
      `;
      button.querySelector('.material-ball').style.background = material.sphere;
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
        // Extract width and height from SVG tag using regex
        const widthMatch = svgText.match(/<svg[^>]*\swidth=["']([^"']+)["']/i);
        const heightMatch = svgText.match(/<svg[^>]*\sheight=["']([^"']+)["']/i);
        const viewBoxMatch = svgText.match(/<svg[^>]*\sviewBox=["']([^"']+)["']/i);

        let width = parseSvgLength(widthMatch ? widthMatch[1] : null);
        let height = parseSvgLength(heightMatch ? heightMatch[1] : null);

        // Fallback to viewBox if width/height not available
        if ((isNaN(width) || isNaN(height)) && viewBoxMatch) {
          const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
          if (parts.length >= 4) {
            if (isNaN(width)) width = parts[2];
            if (isNaN(height)) height = parts[3];
          }
        }

        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
          width = 800;
          height = 600;
        }

        setSvgDimensions(Math.round(width), Math.round(height));
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
      fillPath.classList.remove('texture-template-path', 'hover-template-path', 'selected-template-path');
      fillPath.classList.add('texture-template-fill');
      fillPath.dataset.templatePathId = path.dataset.templatePathId;
      fillPath.style.pointerEvents = 'none';
      fillPath.setAttribute('stroke', 'transparent');
      fillPath.setAttribute('stroke-width', '0');
      fillPath.removeAttribute('filter');
      if (persistent) fillPath.dataset.persistent = 'true';
      path.parentNode.insertBefore(fillPath, path);
    }
    return fillPath;
  }

  function setTemplatePathPreview(path, mode) {
    if (!path || path.dataset.color) return;
    const fillPath = getTemplateFillPath(path, true, false);
    fillPath.setAttribute('fill', mode === 'selected' ? 'rgba(0,102,255,0.42)' : 'rgba(0,102,255,0.24)');
    fillPath.setAttribute('fill-opacity', '1');
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

  function setTool(tool) {
    state.tool = tool;
    state.textClickCandidate = null;
    Object.values(toolButtons).forEach(btn => btn?.classList.remove('active'));
    if (toolButtons[tool]) toolButtons[tool].classList.add('active');
    textureSvg.classList.toggle('is-drawing', tool === 'draw');
    textureSvg.style.cursor = tool === 'pan' ? 'grab' : tool === 'draw' ? 'crosshair' : 'default';
  }

  Object.entries(toolButtons).forEach(([tool, btn]) => {
    btn?.addEventListener('click', () => setTool(tool));
  });

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

  function rasterizeModelTexture(options = {}) {
    // The editable/exported UV artwork is transparent by default. model-viewer's
    // OPAQUE glTF materials do not blend PNG alpha with the previous base map, so
    // the live 3D texture gets an explicit neutral backing layer.
    return rasterizeTexture({ ...options, backgroundColor: '#ffffff' });
  }

  async function applyTextureToViewer(viewerElement, textureUrl, options = {}) {
    if (!viewerElement || !textureUrl) return;
    try {
      await viewerElement.updateComplete;
      if (typeof viewerElement.createTexture !== 'function') return;
      const model = viewerElement.model;
      const materials = model?.materials || [];
      if (!materials.length) return;
      const texture = await viewerElement.createTexture(textureUrl);
      const materialMaps = state.selectedMaterial
        ? await loadMaterialMaps(viewerElement, state.selectedMaterial)
        : {};
      materials.forEach((material) => {
        const pbr = material.pbrMetallicRoughness;
        if (!options.preserveMaterial && pbr?.setBaseColorFactor) {
          pbr.setBaseColorFactor(getSelectedMaterialFactor());
        }
        if (!options.preserveMaterial && state.selectedMaterial) {
          pbr?.setMetallicFactor?.(state.selectedMaterial.metalness ?? 0);
          pbr?.setRoughnessFactor?.(state.selectedMaterial.roughness ?? 0.8);
        }
        const baseColorTexture = pbr?.baseColorTexture;
        if (baseColorTexture?.setTexture) {
          baseColorTexture.setTexture(texture);
        } else if (pbr?.setBaseColorTexture) {
          pbr.setBaseColorTexture(texture);
        }
        resetArtworkTextureTransform(baseColorTexture);
        if (!options.preserveMaterial) {
          setMaterialTextureSlot(material.normalTexture, materialMaps.normal);
          material.normalTexture?.setScale?.(state.selectedMaterial?.normalScale ?? 0.1);
          if (materialMaps.roughness) {
            setMaterialTextureSlot(pbr?.metallicRoughnessTexture, materialMaps.roughness);
          }
        }
      });
      if (options.trackApplied !== false) state.appliedTextureUrl = textureUrl;
    } catch (error) {
      console.warn('Failed to update 3D texture preview:', error);
    }
  }

  function applyTextureToModel(textureUrl) {
    return applyTextureToViewer(designerViewer, textureUrl);
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
    state.textureUpdateTimer = setTimeout(async () => {
      const updateId = ++state.textureUpdateId;
      const textureUrl = await rasterizeModelTexture();
      if (updateId === state.textureUpdateId) {
        applyTextureToModel(textureUrl);
      }
    }, 120);
  }

  async function saveDesignAndClose() {
    state.textEditor?.commit();
    setDesignSaveStatus('Applying…');
    const textureUrl = await rasterizeModelTexture({ includeSelectionHighlight: false });
    state.finalTextureUrl = textureUrl;
    await Promise.all(getLoadedDesignViewers().map((viewerElement) => applyTextureToViewer(viewerElement, textureUrl)));
    setDesignSaveStatus('Saved');
    closeModal();
  }

  function setRenderStatus(message) {
    if (downloadRenderStatus) downloadRenderStatus.textContent = message || '';
  }

  function setExportingState(isExporting) {
    state.isExportingRender = isExporting;
    [downloadRenderBtn].forEach((button) => {
      if (!button) return;
      button.disabled = isExporting;
      button.classList.toggle('is-loading', isExporting);
    });
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  }

  function createCoverExportViewer(options = {}, renderStandard = defaultRenderStandard) {
    const isVisibleCapture = options.visibleCapture === true;
    const webStandard = { ...defaultRenderStandard.web, ...(renderStandard.web || {}) };
    const exportViewer = document.createElement('model-viewer');
    exportViewer.src = modelDesignerConfig.previewModelFileUrl || '';
    exportViewer.alt = modelDesignerConfig.modelName || 'Designed 3D model';
    exportViewer.setAttribute('loading', 'eager');
    exportViewer.setAttribute('reveal', 'auto');
    exportViewer.setAttribute('interaction-prompt', 'none');
    exportViewer.setAttribute('environment-image', webStandard.environmentImage);
    exportViewer.setAttribute('shadow-intensity', String(webStandard.shadowIntensity));
    exportViewer.setAttribute('shadow-softness', String(webStandard.shadowSoftness));
    exportViewer.setAttribute('exposure', String(webStandard.exposure));
    exportViewer.setAttribute('tone-mapping', webStandard.toneMapping);
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
    const exportViewer = createCoverExportViewer({ zIndex: options.viewerZIndex }, renderStandard);
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
    try {
      return await renderDesignedModelImage(textureUrl, options);
    } catch (error) {
      console.warn('High-resolution render failed, falling back to active viewer:', error);
      const activeViewer = designModal.classList.contains('active') ? designerViewer : detailViewer;
      if (textureUrl) {
        await applyTextureToViewer(activeViewer, textureUrl);
      } else if (state.selectedMaterial) {
        await applyMaterialToViewer(activeViewer, state.selectedMaterial);
      }
      return captureModelViewerImage(activeViewer, options);
    }
  }

  async function downloadDesignedRender() {
    if (state.isExportingRender) return;
    if (!modelDesignerConfig.previewModelFileUrl) return;
    setExportingState(true);
    setRenderStatus('Rendering high-resolution 3D image...');

    try {
      await loadModelViewerModule();
      stopModelRotation();
      const cameraSnapshot = captureViewerCamera();
      const textureUrl = await createFinalRenderTexture();
      const renderUrl = await renderDesignedModelImageWithFallback(textureUrl, {
        mimeType: 'image/png',
        quality: 0.95,
        cameraSnapshot
      });
      downloadDataUrl(renderUrl, `${modelDesignerConfig.modelSlug || 'designed-3d-model'}-hd-render.png`);
      setRenderStatus('HD render downloaded.');
      window.trackEvent?.('design_export', {
        export_format: 'png',
        export_type: 'hd_3d_render',
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
            email: formData.get('email')
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
      window.trackEvent?.('generate_lead', {
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

  function getCleanElementsHtml() {
    const clone = textureElements.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach((element) => {
      element.removeAttribute('contenteditable');
      element.classList.remove('is-editing');
    });
    clone.querySelectorAll('.texture-element.selected').forEach((element) => {
      element.classList.remove('selected');
    });
    return clone.innerHTML;
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
      fillPath.setAttribute('fill', getSvgPaint(group, color, 'fill'));
      fillPath.setAttribute('fill-opacity', '1');
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
    let gradient = document.getElementById(id);
    if (!gradient) {
      gradient = createSvg('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
      textureSvg.querySelector('defs')?.appendChild(gradient);
    }
    gradient.innerHTML = '';
    gradient.appendChild(createSvg('stop', { offset: '0%', 'stop-color': rgbaFrom(parsed.start, parsed.alpha) }));
    gradient.appendChild(createSvg('stop', { offset: '100%', 'stop-color': rgbaFrom(parsed.end, parsed.alpha) }));
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

  function gradientFrom(start, end, alpha) {
    return `linear-gradient(90deg, ${rgbaFrom(start, alpha)}, ${rgbaFrom(end, alpha)})`;
  }

  function parseCssColorTokens(value) {
    const source = String(value || '');
    const colorRegex = /#[0-9a-fA-F]{6}|rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/g;
    return [...source.matchAll(colorRegex)].map((match) => {
      if (match[0].startsWith('#')) {
        return { hex: normalizeHex(match[0]) };
      }
      return {
        hex: rgbToHex(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])),
        alpha: match[4] !== undefined ? Math.round(parseFloat(match[4]) * 100) : undefined
      };
    });
  }

  function parseColorState(value) {
    const colorTokens = parseCssColorTokens(value);
    const isGradient = String(value || '').includes('linear-gradient');
    const start = colorTokens[0]?.hex || normalizeHex(value);
    const end = colorTokens[1]?.hex || (isGradient ? start : '#ffffff');
    const hsv = rgbToHsv(...Object.values(hexToRgb(start)));
    return {
      mode: isGradient ? 'gradient' : 'solid',
      activeStop: 'start',
      start,
      end,
      h: hsv.h,
      s: hsv.s,
      v: hsv.v,
      alpha: colorTokens.find((token) => token.alpha !== undefined)?.alpha ?? 100
    };
  }

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
      valueLabel.textContent = parseColorState(value).start.toUpperCase();
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

    positionElementToolbar(group);
  }

  function positionElementToolbar(group = state.selected) {
    if (!group) {
      elementToolbar.classList.remove('visible');
      return;
    }
    const areaRect = textureCanvasArea.getBoundingClientRect();
    elementToolbar.classList.add('visible');
    const toolbarWidth = elementToolbar.offsetWidth || 320;
    const toolbarHeight = elementToolbar.offsetHeight || 44;
    const outlineRect = selectionLayer.querySelector('.selection-outline')?.getBoundingClientRect()
      || group.getBoundingClientRect();
    const selectionRect = selectionLayer.querySelector('.selection-box')?.getBoundingClientRect()
      || outlineRect;
    const visibleLeft = textureCanvasArea.scrollLeft + 8;
    const visibleTop = textureCanvasArea.scrollTop + 8;
    const visibleRight = textureCanvasArea.scrollLeft + textureCanvasArea.clientWidth - 8;
    const visibleBottom = textureCanvasArea.scrollTop + textureCanvasArea.clientHeight - 8;
    const left = outlineRect.left - areaRect.left + textureCanvasArea.scrollLeft
      + outlineRect.width / 2 - toolbarWidth / 2;
    let top = selectionRect.top - areaRect.top + textureCanvasArea.scrollTop - toolbarHeight - 10;
    if (top < visibleTop) {
      top = selectionRect.bottom - areaRect.top + textureCanvasArea.scrollTop + 10;
    }
    elementToolbar.style.left = `${Math.max(visibleLeft, Math.min(visibleRight - toolbarWidth, left))}px`;
    elementToolbar.style.top = `${Math.max(visibleTop, Math.min(visibleBottom - toolbarHeight, top))}px`;
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
    const startHsv = rgbToHsv(...Object.values(hexToRgb(current.start)));
    const endHsv = rgbToHsv(...Object.values(hexToRgb(current.end)));
    state.colorPicker = {
      prop,
      mode: current.mode,
      activeStop: current.activeStop,
      start: current.start,
      end: current.end,
      stopHsv: {
        start: startHsv,
        end: endHsv
      },
      h: current.h,
      s: current.s,
      v: current.v,
      alpha: current.alpha
    };

    const buttonRect = button.getBoundingClientRect();
    const areaRect = textureCanvasArea.getBoundingClientRect();
    colorPopover.innerHTML = `
      <div class="color-mode" role="group">
        <button type="button" data-mode="solid" class="${current.mode === 'solid' ? 'active' : ''}">Solid</button>
        <button type="button" data-mode="gradient" class="${current.mode === 'gradient' ? 'active' : ''}">Gradient</button>
      </div>
      <div class="gradient-stops">
        <button type="button" data-stop="start" class="active"><span style="background:${current.start}"></span> A</button>
        <button type="button" data-stop="end"><span style="background:${current.end}"></span> B</button>
      </div>
      <div class="color-area" data-color-area><span class="color-area-cursor"></span></div>
      <div class="hue-row">
        <span>Hue</span>
        <div class="hue-field" data-hue-field><span class="hue-field-cursor"></span></div>
      </div>
      <div class="slider-row">
        <span>Alpha</span>
        <input class="alpha-slider" type="range" min="0" max="100" value="${current.alpha}" data-color-field="alpha">
      </div>
      <label class="color-field">HEX <input data-color-field="hex" value="${current.start}" maxlength="7"></label>
      <div class="color-preview"></div>
    `;
    colorPopover.classList.add('visible');
    const popoverWidth = colorPopover.offsetWidth || 260;
    const popoverHeight = colorPopover.offsetHeight || 420;
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
    button.setAttribute('aria-expanded', 'true');
    renderColorPopover();
  }

  function getPickerCss() {
    if (!state.colorPicker) return '#111827';
    return state.colorPicker.mode === 'gradient'
      ? gradientFrom(state.colorPicker.start, state.colorPicker.end, state.colorPicker.alpha)
      : rgbaFrom(state.colorPicker.start, state.colorPicker.alpha);
  }

  function renderColorPopover() {
    if (!state.colorPicker) return;
    colorPopover.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === state.colorPicker.mode);
    });
    const stops = colorPopover.querySelector('.gradient-stops');
    if (stops) stops.style.display = state.colorPicker.mode === 'gradient' ? 'grid' : 'none';
    colorPopover.querySelectorAll('[data-stop]').forEach((button) => {
      button.classList.toggle('active', button.dataset.stop === state.colorPicker.activeStop);
      const swatch = button.querySelector('span');
      if (swatch) swatch.style.background = state.colorPicker[button.dataset.stop];
    });
    const hue = hsvToHex(state.colorPicker.h, 1, 1);
    const area = colorPopover.querySelector('.color-area');
    if (area) area.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})`;
    const cursor = colorPopover.querySelector('.color-area-cursor');
    if (cursor) {
      cursor.style.left = `${state.colorPicker.s * 100}%`;
      cursor.style.top = `${(1 - state.colorPicker.v) * 100}%`;
    }
    const hexInput = colorPopover.querySelector('[data-color-field="hex"]');
    if (hexInput) hexInput.value = state.colorPicker[state.colorPicker.activeStop];
    const hueCursor = colorPopover.querySelector('.hue-field-cursor');
    if (hueCursor) hueCursor.style.left = `${(state.colorPicker.h / 360) * 100}%`;
    const alphaInput = colorPopover.querySelector('[data-color-field="alpha"]');
    if (alphaInput) alphaInput.value = state.colorPicker.alpha;
    const preview = colorPopover.querySelector('.color-preview');
    if (preview) preview.style.background = getPickerCss();
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
        : state.colorPicker.start.toUpperCase();
    }
  }

  function setActiveColorFromHex(hex) {
    if (!state.colorPicker) return;
    const normalized = normalizeHex(hex);
    state.colorPicker[state.colorPicker.activeStop] = normalized;
    const rgb = hexToRgb(normalized);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    state.colorPicker.stopHsv[state.colorPicker.activeStop] = hsv;
    state.colorPicker.h = hsv.h;
    state.colorPicker.s = hsv.s;
    state.colorPicker.v = hsv.v;
  }

  function setActiveStop(stop) {
    if (!state.colorPicker) return;
    state.colorPicker.activeStop = stop;
    const hsv = state.colorPicker.stopHsv[stop] || rgbToHsv(...Object.values(hexToRgb(state.colorPicker[stop])));
    state.colorPicker.h = hsv.h;
    state.colorPicker.s = hsv.s;
    state.colorPicker.v = hsv.v;
  }

  function setPickerHue(event) {
    if (!state.colorPicker) return;
    const field = colorPopover.querySelector('[data-hue-field]');
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    state.colorPicker.h = ratio * 360;
    state.colorPicker[state.colorPicker.activeStop] = hsvToHex(state.colorPicker.h, state.colorPicker.s, state.colorPicker.v);
    state.colorPicker.stopHsv[state.colorPicker.activeStop] = {
      h: state.colorPicker.h,
      s: state.colorPicker.s,
      v: state.colorPicker.v
    };
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
    state.colorPicker[state.colorPicker.activeStop] = hsvToHex(state.colorPicker.h, s, v);
    state.colorPicker.stopHsv[state.colorPicker.activeStop] = {
      h: state.colorPicker.h,
      s,
      v
    };
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
    const svgRect = textureSvg.getBoundingClientRect();
    const selectionScale = Math.max(0.001, Math.min(
      svgRect.width / state.svgWidth,
      svgRect.height / state.svgHeight
    ));
    const screenUnit = 1 / selectionScale;
    const handleSize = 10 * screenUnit;
    const handleRadius = 2 * screenUnit;
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

    if (!state.selected.classList?.contains('texture-template-path')) {
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
          style: `cursor:${resizeCursor(handle, data.rotate)}`
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
      setTool('select');
    };
    artworkImage.addEventListener('load', () => {
      createArtwork(artworkImage.naturalWidth, artworkImage.naturalHeight);
    }, { once: true });
    artworkImage.addEventListener('error', () => createArtwork(), { once: true });
    artworkImage.src = dataUrl;
    return true;
  }

  toolButtons.image?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          importArtworkDataUrl(event.target.result);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
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
    const target = event.target.closest('.texture-element');
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
    const button = event.target.closest('[data-color-prop]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openColorPopover(button);
  });

  colorPopover.addEventListener('pointerdown', (event) => event.stopPropagation());
  colorPopover.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-mode]');
    const stopButton = event.target.closest('[data-stop]');
    if (!state.colorPicker) return;
    if (modeButton) {
      state.colorPicker.mode = modeButton.dataset.mode;
    } else if (stopButton) {
      setActiveStop(stopButton.dataset.stop);
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
    } else {
      if (!/^#?[0-9a-fA-F]{6}$/.test(field.value)) return;
      setActiveColorFromHex(field.value);
    }
    renderColorPopover();
    applyColorPicker(false);
  });
  colorPopover.addEventListener('change', () => applyColorPicker(true));
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
    if (state.zoomMode === 'fit' && designModal.classList.contains('active')) fitCanvasZoom();
  });

  function saveHistory() {
    const snapshot = getCleanElementsHtml();
    if (state.history[state.historyIndex] === snapshot) return;
    const hadHistory = state.historyIndex >= 0;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    state.historyIndex++;
    if (hadHistory) setDesignSaveStatus('Unsaved changes', true);
    scheduleTexturePreviewUpdate();
  }

  function restoreHistory(index) {
    textureElements.innerHTML = state.history[index] || '';
    selectElement(null);
    const ids = [...textureElements.querySelectorAll('.texture-element')]
      .map(element => parseInt((element.id || '').replace('element-', ''), 10))
      .filter(Number.isFinite);
    state.elementCounter = Math.max(state.elementCounter, 0, ...ids);
    setDesignSaveStatus('Unsaved changes', true);
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
  downloadRenderBtn?.addEventListener('click', downloadDesignedRender);
  customizationInquiryBtn?.addEventListener('click', openCustomizationInquiry);
  customizationInquiryOverlay?.addEventListener('click', closeCustomizationInquiry);
  customizationInquiryClose?.addEventListener('click', closeCustomizationInquiry);
  customizationInquiryCancel?.addEventListener('click', closeCustomizationInquiry);
  customizationInquiryDone?.addEventListener('click', closeCustomizationInquiry);
  customizationRefreshSnapshots?.addEventListener('click', prepareCustomizationSnapshots);
  customizationInquiryForm?.addEventListener('submit', submitCustomizationInquiry);

  // Initialize history
  renderMaterialSwatches();
  saveHistory();

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
    if (window.location.hash !== '#design' && !pendingArtworkIsFresh) return;
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
  window.addEventListener('hashchange', openDesignFromNavigation);
  window.openModelDesigner = openModal;
  window.downloadDesignedModelRender = downloadDesignedRender;
  window.openModelCustomizationInquiry = openCustomizationInquiry;
};
})();
