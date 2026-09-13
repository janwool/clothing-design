(function initSvgMaskEditor() {
  'use strict';

  const root = document.getElementById('svgMaskEditor');
  const geometry = window.SvgMaskGeometry;
  if (!root || !geometry) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY_PREFIX = 'clothingdesign.svg-mask-editor.v2';
  const REVIEWED_STORAGE_KEY = 'clothingdesign.svg-mask-editor.reviewed.v1';
  const svg = document.getElementById('maskEditorSvg');
  const viewport = document.getElementById('maskCanvasViewport');
  const baseImage = document.getElementById('maskBaseImage');
  const canvasBackground = document.getElementById('maskCanvasBackground');
  const blackPreview = document.getElementById('maskBlackPreview');
  const addLayer = document.getElementById('maskAddRegions');
  const subtractLayer = document.getElementById('maskSubtractRegions');
  const draftLayer = document.getElementById('maskDraftLayer');
  const nodeLayer = document.getElementById('maskNodeLayer');
  const emptyNote = document.getElementById('maskEmptyNote');
  const dropOverlay = document.getElementById('maskCanvasDrop');
  const imageInput = document.getElementById('maskImageInput');
  const svgInput = document.getElementById('maskSvgInput');
  const undoButton = document.getElementById('maskUndo');
  const redoButton = document.getElementById('maskRedo');
  const layerList = document.getElementById('maskLayerList');
  const selectionLabel = document.getElementById('maskSelectionLabel');
  const regionKindInput = document.getElementById('maskRegionKind');
  const smoothingInput = document.getElementById('maskSmoothing');
  const smoothingValue = document.getElementById('maskSmoothingValue');
  const deleteButton = document.getElementById('maskDeleteRegion');
  const deleteNodeButton = document.getElementById('maskDeleteNode');
  const duplicateButton = document.getElementById('maskDuplicateRegion');
  const documentWidthInput = document.getElementById('maskDocumentWidth');
  const documentHeightInput = document.getElementById('maskDocumentHeight');
  const overlayOpacityInput = document.getElementById('maskOverlayOpacity');
  const overlayOpacityValue = document.getElementById('maskOverlayOpacityValue');
  const dimensionLabel = document.getElementById('maskCanvasDimensions');
  const cursorLabel = document.getElementById('maskCursorPosition');
  const zoomLabel = document.getElementById('maskZoomLabel');
  const regionSummary = document.getElementById('maskRegionSummary');
  const statusMessage = document.getElementById('maskStatusMessage');
  const saveState = document.getElementById('maskSaveState');
  const documentName = document.getElementById('maskDocumentName');
  const workspaceHint = document.getElementById('maskWorkspaceHint');
  const saveApplyButton = document.getElementById('maskSaveApply');
  const modelSelect = document.getElementById('maskModelSelect');
  const previousModelButton = document.getElementById('maskPreviousModel');
  const nextModelButton = document.getElementById('maskNextModel');
  const reviewedButton = document.getElementById('maskMarkReviewed');
  const queueProgress = document.getElementById('maskQueueProgress');
  const quickSwitchTrigger = document.getElementById('maskQuickSwitchTrigger');
  const quickSwitchLabel = document.getElementById('maskQuickSwitchLabel');
  const quickSwitchPanel = document.getElementById('maskQuickSwitchPanel');
  const quickSwitchSearch = document.getElementById('maskQuickSwitchSearch');
  const quickSwitchList = document.getElementById('maskQuickSwitchList');
  const quickSwitchCount = document.getElementById('maskQuickSwitchCount');
  const colorPreview = document.getElementById('maskColorPreview');
  const colorPreviewImage = document.getElementById('maskColorPreviewImage');
  const colorPreviewClear = document.getElementById('maskColorPreviewClear');
  const colorPreviewBackdrop = document.getElementById('maskColorPreviewBackdrop');
  const colorPreviewTint = document.getElementById('maskColorPreviewTint');
  const colorPreviewAdd = document.getElementById('maskColorPreviewAdd');
  const colorPreviewCut = document.getElementById('maskColorPreviewCut');
  const colorPreviewEmpty = document.getElementById('maskColorPreviewEmpty');
  const previewColorInput = document.getElementById('maskPreviewColor');
  const previewColorValue = document.getElementById('maskPreviewColorValue');
  const colorSwatches = document.getElementById('maskColorSwatches');

  const state = {
    width: 1024,
    height: 1536,
    imageSrc: '',
    imageName: 'model-004-roll-sleeve-henley-from3d-v1-base.png',
    imageObjectUrl: '',
    regions: [],
    selectedId: null,
    selectedNode: null,
    tool: 'select',
    kind: 'add',
    preview: 'overlay',
    smoothing: 28,
    overlayOpacity: 10,
    previewColor: '#c43d32',
    draft: [],
    draftPointer: null,
    drawingFreehand: false,
    drag: null,
    spacePressed: false,
    history: [],
    future: [],
    viewBox: { x: 0, y: 0, width: 1024, height: 1536 },
    saveTimer: 0,
    smoothingHistoryOpen: false,
    idCounter: 1
  };
  let quickSwitchResults = [];
  let quickSwitchActiveIndex = 0;

  function createSvgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function selectedRegion() {
    return state.regions.find(region => region.id === state.selectedId) || null;
  }

  function selectedNodeData() {
    if (!state.selectedNode) return null;
    const region = state.regions.find(item => item.id === state.selectedNode.regionId);
    const index = Number(state.selectedNode.index);
    if (!region || !Array.isArray(region.points) || !Number.isInteger(index) || index < 0 || index >= region.points.length) return null;
    return { region, index, point: region.points[index] };
  }

  function storageKey() {
    return `${STORAGE_KEY_PREFIX}.${root.dataset.maskKey || 'untitled'}`;
  }

  function reviewedModels() {
    try {
      const value = JSON.parse(localStorage.getItem(REVIEWED_STORAGE_KEY) || '[]');
      return new Set(Array.isArray(value) ? value : []);
    } catch (error) {
      return new Set();
    }
  }

  function maskModelOptions() {
    return [...modelSelect.options].map((option, index) => {
      const label = option.dataset.label || option.textContent.replace(/^✓\s*/, '');
      return {
        id: option.value,
        index,
        number: String(index + 1).padStart(3, '0'),
        label,
        title: label.replace(/^\d+\s*·\s*/, ''),
        search: `${index + 1} ${label} ${option.value}`.toLowerCase()
      };
    });
  }

  function updateQuickSwitchSelection(shouldScroll) {
    const rows = [...quickSwitchList.querySelectorAll('[data-quick-switch-index]')];
    rows.forEach((row, index) => {
      const active = index === quickSwitchActiveIndex;
      row.classList.toggle('is-active', active);
      row.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) {
        quickSwitchList.setAttribute('aria-activedescendant', row.id);
        if (shouldScroll) row.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function renderQuickSwitcher(resetActive) {
    const query = quickSwitchSearch.value.trim().toLowerCase();
    const reviewed = reviewedModels();
    quickSwitchResults = maskModelOptions().filter(item => !query || item.search.includes(query));
    if (resetActive) quickSwitchActiveIndex = 0;
    if (!query && resetActive) {
      const currentIndex = quickSwitchResults.findIndex(item => item.id === root.dataset.maskKey);
      quickSwitchActiveIndex = Math.max(0, currentIndex);
    }
    quickSwitchActiveIndex = geometry.clamp(quickSwitchActiveIndex, 0, Math.max(0, quickSwitchResults.length - 1));
    quickSwitchCount.textContent = `${quickSwitchResults.length} model${quickSwitchResults.length === 1 ? '' : 's'}`;
    quickSwitchList.replaceChildren();

    if (!quickSwitchResults.length) {
      const empty = document.createElement('div');
      empty.className = 'mask-quick-switch-empty';
      empty.innerHTML = '<span>No matching models</span><small>Try a model number, garment name, or asset slug</small>';
      quickSwitchList.appendChild(empty);
      quickSwitchList.removeAttribute('aria-activedescendant');
      return;
    }

    const fragment = document.createDocumentFragment();
    quickSwitchResults.forEach((item, resultIndex) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.id = `maskQuickSwitchOption-${item.index}`;
      row.className = `mask-quick-switch-option${item.id === root.dataset.maskKey ? ' is-current' : ''}`;
      row.dataset.maskId = item.id;
      row.dataset.quickSwitchIndex = String(resultIndex);
      row.setAttribute('role', 'option');

      const index = document.createElement('span');
      index.className = 'mask-quick-switch-index';
      index.textContent = item.number;

      const copy = document.createElement('span');
      copy.className = 'mask-quick-switch-copy';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const slug = document.createElement('small');
      slug.textContent = item.id;
      copy.append(title, slug);

      const badges = document.createElement('span');
      badges.className = 'mask-quick-switch-badges';
      if (item.id === root.dataset.maskKey) {
        const current = document.createElement('span');
        current.textContent = 'Current';
        badges.appendChild(current);
      }
      if (reviewed.has(item.id)) {
        const complete = document.createElement('span');
        complete.className = 'is-reviewed';
        complete.textContent = 'Reviewed';
        badges.appendChild(complete);
      }
      row.append(index, copy, badges);
      fragment.appendChild(row);
    });
    quickSwitchList.appendChild(fragment);
    updateQuickSwitchSelection(false);
  }

  function openQuickSwitcher() {
    quickSwitchPanel.hidden = false;
    quickSwitchTrigger.setAttribute('aria-expanded', 'true');
    quickSwitchSearch.value = '';
    renderQuickSwitcher(true);
    window.requestAnimationFrame(() => {
      quickSwitchSearch.focus();
      quickSwitchSearch.select();
      updateQuickSwitchSelection(true);
    });
  }

  function closeQuickSwitcher(restoreFocus) {
    quickSwitchPanel.hidden = true;
    quickSwitchTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) quickSwitchTrigger.focus();
  }

  function moveQuickSwitchSelection(delta) {
    if (!quickSwitchResults.length) return;
    quickSwitchActiveIndex = (quickSwitchActiveIndex + delta + quickSwitchResults.length) % quickSwitchResults.length;
    updateQuickSwitchSelection(true);
  }

  function openQuickSwitchSelection() {
    const result = quickSwitchResults[quickSwitchActiveIndex];
    if (result) openModel(result.id);
  }

  function renderQueueProgress() {
    if (!modelSelect || !queueProgress) return;
    const reviewed = reviewedModels();
    [...modelSelect.options].forEach(option => {
      const label = option.dataset.label || option.textContent.replace(/^✓\s*/, '');
      option.dataset.label = label;
      option.textContent = `${reviewed.has(option.value) ? '✓ ' : ''}${label}`;
    });
    const currentPosition = modelSelect.selectedIndex + 1;
    const currentOption = modelSelect.options[modelSelect.selectedIndex];
    if (quickSwitchLabel && currentOption) quickSwitchLabel.textContent = currentOption.dataset.label || currentOption.textContent.replace(/^✓\s*/, '');
    queueProgress.textContent = `${currentPosition} / ${modelSelect.options.length} · ${reviewed.size} reviewed`;
    if (reviewedButton) {
      const currentReviewed = reviewed.has(root.dataset.maskKey);
      reviewedButton.classList.toggle('is-reviewed', currentReviewed);
      reviewedButton.textContent = currentReviewed ? 'Reviewed ✓' : 'Mark reviewed';
    }
    if (!quickSwitchPanel.hidden) renderQuickSwitcher(false);
  }

  function toggleReviewed() {
    const reviewed = reviewedModels();
    const identifier = root.dataset.maskKey;
    if (reviewed.has(identifier)) reviewed.delete(identifier);
    else reviewed.add(identifier);
    localStorage.setItem(REVIEWED_STORAGE_KEY, JSON.stringify([...reviewed]));
    renderQueueProgress();
    setStatus(reviewed.has(identifier) ? 'Model marked as reviewed' : 'Review mark removed');
  }

  function snapshot() {
    return {
      width: state.width,
      height: state.height,
      regions: state.regions.map(region => ({
        ...region,
        points: (region.points || []).map(point => ({ ...point }))
      })),
      selectedId: state.selectedId,
      selectedNode: state.selectedNode ? { ...state.selectedNode } : null,
      idCounter: state.idCounter
    };
  }

  function restoreSnapshot(value) {
    state.width = value.width;
    state.height = value.height;
    state.regions = value.regions.map(region => ({
      ...region,
      points: (region.points || []).map(point => ({ ...point }))
    }));
    state.selectedId = value.selectedId;
    state.selectedNode = value.selectedNode ? { ...value.selectedNode } : null;
    if (!selectedNodeData()) state.selectedNode = null;
    state.idCounter = value.idCounter || state.idCounter;
    applyDocumentSize(false);
    renderAll();
    markDirty();
  }

  function pushHistory(value) {
    state.history.push(value || snapshot());
    if (state.history.length > 80) state.history.shift();
    state.future = [];
    updateHistoryButtons();
  }

  function undo() {
    if (state.draft.length) {
      state.draft.pop();
      if (!state.draft.length) state.draftPointer = null;
      renderScene();
      return;
    }
    const previous = state.history.pop();
    if (!previous) return;
    state.future.push(snapshot());
    restoreSnapshot(previous);
    setStatus('Undid last change');
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push(snapshot());
    restoreSnapshot(next);
    setStatus('Redid change');
  }

  function updateHistoryButtons() {
    undoButton.disabled = state.history.length === 0 && state.draft.length === 0;
    redoButton.disabled = state.future.length === 0;
  }

  function setStatus(message, isError) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('is-error', Boolean(isError));
  }

  function markDirty() {
    saveState.classList.add('is-dirty');
    saveState.querySelector('span').textContent = 'Saving local draft…';
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(saveDraft, 240);
  }

  function saveDraft() {
    const persistentImage = /^(?:https?:|\/)/.test(state.imageSrc) ? state.imageSrc : '';
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        ...snapshot(),
        baseRevision: root.dataset.maskRevision || '',
        savedAt: Date.now(),
        imageSrc: persistentImage,
        imageName: state.imageName,
        smoothing: state.smoothing,
        overlayOpacity: state.overlayOpacity,
        previewColor: state.previewColor
      }));
      saveState.classList.remove('is-dirty');
      saveState.querySelector('span').textContent = 'Saved in this browser';
    } catch (error) {
      saveState.querySelector('span').textContent = 'Local save unavailable';
    }
  }

  function restoreDraft() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey()) || 'null');
      if (!stored || !Array.isArray(stored.regions)) return null;
      const databaseRevision = root.dataset.maskRevision || '';
      const draftRevision = String(stored.baseRevision || '');
      if (databaseRevision && draftRevision !== databaseRevision) {
        return null;
      }
      state.width = Number(stored.width) || state.width;
      state.height = Number(stored.height) || state.height;
      state.regions = stored.regions.map(region => ({
        ...region,
        points: (region.points || []).map(point => ({ x: Number(point.x), y: Number(point.y) }))
      }));
      state.selectedId = stored.selectedId || null;
      state.selectedNode = stored.selectedNode ? { ...stored.selectedNode } : null;
      if (!selectedNodeData()) state.selectedNode = null;
      state.idCounter = Number(stored.idCounter) || state.regions.length + 1;
      state.smoothing = Number(stored.smoothing) || state.smoothing;
      const storedOverlayOpacity = Number(stored.overlayOpacity);
      state.overlayOpacity = storedOverlayOpacity === 58 || storedOverlayOpacity === 38 || storedOverlayOpacity === 30 || storedOverlayOpacity === 20
        ? 10
        : (storedOverlayOpacity || state.overlayOpacity);
      state.imageName = stored.imageName || state.imageName;
      if (/^#[0-9a-f]{6}$/i.test(String(stored.previewColor || ''))) {
        state.previewColor = String(stored.previewColor).toLowerCase();
      }
      return stored.imageSrc || null;
    } catch (error) {
      return null;
    }
  }

  function regionPath(region) {
    return region.d || geometry.pathFromPoints(region.points, region.smoothing, true);
  }

  function renderRegion(region) {
    const path = createSvgElement('path', {
      d: regionPath(region),
      class: `mask-region${region.id === state.selectedId ? ' is-selected' : ''}${region.visible === false ? ' is-hidden' : ''}`,
      'data-region-id': region.id,
      'vector-effect': 'non-scaling-stroke'
    });
    (region.kind === 'subtract' ? subtractLayer : addLayer).appendChild(path);
  }

  function handleRadius() {
    return Math.max(1.3, state.viewBox.width / Math.max(1, svg.clientWidth) * 4.6);
  }

  function renderNodes() {
    nodeLayer.replaceChildren();
    const region = selectedRegion();
    if (!region || state.tool !== 'select' || !Array.isArray(region.points) || region.points.length < 3) return;
    const radius = handleRadius();
    nodeLayer.appendChild(createSvgElement('path', {
      d: regionPath(region),
      class: 'mask-region-hit',
      'data-region-id': region.id,
      'vector-effect': 'non-scaling-stroke'
    }));
    region.points.forEach((point, index) => {
      const nodeSelected = state.selectedNode?.regionId === region.id && Number(state.selectedNode.index) === index;
      const node = createSvgElement('circle', {
        cx: point.x,
        cy: point.y,
        r: radius,
        class: `mask-node${nodeSelected ? ' is-active' : ''}`,
        'data-node-index': index,
        'data-region-id': region.id,
        'aria-label': `Node ${index + 1}`
      });
      nodeLayer.appendChild(node);
    });
  }

  function renderDraft() {
    draftLayer.replaceChildren();
    if (!state.draft.length) return;
    let previewPoints = state.draft;
    if (state.draftPointer && state.tool === 'pen') previewPoints = state.draft.concat([state.draftPointer]);
    const path = createSvgElement('path', {
      d: geometry.pathFromPoints(previewPoints, 0, false),
      class: 'mask-draft-path'
    });
    draftLayer.appendChild(path);
    const radius = handleRadius() * 0.82;
    state.draft.forEach((point, index) => {
      draftLayer.appendChild(createSvgElement('circle', {
        cx: point.x,
        cy: point.y,
        r: index === 0 ? radius * 1.25 : radius,
        class: 'mask-draft-point'
      }));
    });
  }

  function renderScene() {
    addLayer.replaceChildren();
    subtractLayer.replaceChildren();
    state.regions.forEach(renderRegion);
    renderDraft();
    renderNodes();
    renderColorPreview();
    emptyNote.hidden = state.regions.length > 0 || state.draft.length > 0;
  }

  function renderColorPreview() {
    if (!colorPreview) return;
    colorPreview.setAttribute('viewBox', `0 0 ${state.width} ${state.height}`);
    [colorPreviewClear, colorPreviewBackdrop, colorPreviewTint].forEach(element => {
      element.setAttribute('width', String(state.width));
      element.setAttribute('height', String(state.height));
    });
    colorPreviewImage.setAttribute('width', String(state.width));
    colorPreviewImage.setAttribute('height', String(state.height));
    colorPreviewImage.setAttribute('href', state.imageSrc || baseImage.getAttribute('href') || root.dataset.defaultImage || '');
    colorPreviewTint.setAttribute('fill', state.previewColor);
    previewColorInput.value = state.previewColor;
    previewColorValue.textContent = state.previewColor.toUpperCase();

    colorPreviewAdd.replaceChildren();
    colorPreviewCut.replaceChildren();
    state.regions.forEach(region => {
      if (region.visible === false) return;
      const path = createSvgElement('path', { d: regionPath(region) });
      (region.kind === 'subtract' ? colorPreviewCut : colorPreviewAdd).appendChild(path);
    });
    const hasAddRegion = state.regions.some(region => region.visible !== false && region.kind !== 'subtract');
    colorPreviewEmpty.hidden = hasAddRegion;
    colorSwatches.querySelectorAll('[data-preview-color]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.previewColor.toLowerCase() === state.previewColor);
    });
  }

  function setPreviewColor(value) {
    const normalized = String(value || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalized)) return;
    state.previewColor = normalized;
    renderColorPreview();
    markDirty();
    setStatus(`Preview color ${normalized.toUpperCase()}`);
  }

  function eyeIcon(visible) {
    return visible
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A8.7 8.7 0 0 1 12 6c6 0 10 6 10 6a16 16 0 0 1-2.1 2.6M6.2 6.2C3.6 8 2 12 2 12s4 6 10 6c1 0 2-.2 2.8-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  }

  function renderLayers() {
    layerList.replaceChildren();
    if (!state.regions.length) {
      const empty = document.createElement('div');
      empty.className = 'mask-layer-empty';
      empty.textContent = 'No mask regions yet.';
      layerList.appendChild(empty);
      return;
    }
    [...state.regions].reverse().forEach((region, reverseIndex) => {
      const naturalIndex = state.regions.length - reverseIndex;
      const row = document.createElement('div');
      row.className = `mask-layer${region.kind === 'subtract' ? ' is-subtract' : ''}${region.id === state.selectedId ? ' is-selected' : ''}`;
      row.dataset.regionId = region.id;

      const kind = document.createElement('span');
      kind.className = 'mask-layer-kind';
      kind.textContent = region.kind === 'subtract' ? '−' : '+';

      const copy = document.createElement('div');
      copy.className = 'mask-layer-copy';
      const title = document.createElement('strong');
      title.textContent = `${region.kind === 'subtract' ? 'Cut' : 'Region'} ${naturalIndex}`;
      const detail = document.createElement('small');
      detail.textContent = region.points && region.points.length ? `${region.points.length} nodes · ${Math.round(region.smoothing || 0)}% smooth` : 'Imported path';
      copy.append(title, detail);

      const visibility = document.createElement('button');
      visibility.className = 'mask-layer-visibility';
      visibility.type = 'button';
      visibility.dataset.visibilityId = region.id;
      visibility.title = region.visible === false ? 'Show region' : 'Hide region';
      visibility.innerHTML = eyeIcon(region.visible !== false);
      row.append(kind, copy, visibility);
      layerList.appendChild(row);
    });
  }

  function renderInspector() {
    const region = selectedRegion();
    const nodeSelection = selectedNodeData();
    const hasRegion = Boolean(region);
    selectionLabel.textContent = nodeSelection
      ? `${region.id.replace(/^region-/, 'Region ')} · Node ${nodeSelection.index + 1}`
      : (region ? region.id.replace(/^region-/, 'Region ') : 'No selection');
    regionKindInput.disabled = !hasRegion;
    smoothingInput.disabled = !hasRegion || !region.points || region.points.length < 3;
    deleteButton.disabled = !hasRegion;
    deleteNodeButton.disabled = !nodeSelection || nodeSelection.region.points.length <= 3;
    deleteNodeButton.title = nodeSelection && nodeSelection.region.points.length <= 3
      ? 'A closed region must keep at least three nodes'
      : 'Delete selected node (Delete/Backspace)';
    duplicateButton.disabled = !hasRegion;
    if (region) {
      regionKindInput.value = region.kind;
      smoothingInput.value = String(Math.round(region.smoothing || 0));
      smoothingValue.textContent = String(Math.round(region.smoothing || 0));
    } else {
      smoothingInput.value = String(state.smoothing);
      smoothingValue.textContent = String(state.smoothing);
    }
  }

  function renderStats() {
    const addCount = state.regions.filter(region => region.kind !== 'subtract' && region.visible !== false).length;
    const subtractCount = state.regions.filter(region => region.kind === 'subtract' && region.visible !== false).length;
    dimensionLabel.textContent = `${state.width} × ${state.height} px`;
    documentWidthInput.value = String(state.width);
    documentHeightInput.value = String(state.height);
    regionSummary.textContent = `${addCount} add · ${subtractCount} cut`;
    documentName.textContent = state.imageName || 'Untitled mask';
    overlayOpacityInput.value = String(state.overlayOpacity);
    overlayOpacityValue.textContent = `${state.overlayOpacity}%`;
    svg.style.setProperty('--mask-overlay-opacity', String(state.overlayOpacity / 100));
    updateZoomLabel();
    updateHistoryButtons();
  }

  function renderAll() {
    renderScene();
    renderLayers();
    renderInspector();
    renderStats();
  }

  function updateViewBox() {
    const value = state.viewBox;
    svg.setAttribute('viewBox', `${value.x} ${value.y} ${value.width} ${value.height}`);
    renderNodes();
    renderDraft();
    updateZoomLabel();
  }

  function updateZoomLabel() {
    const zoom = Math.round(state.width / state.viewBox.width * 100);
    zoomLabel.textContent = `${zoom}%`;
  }

  function fitView() {
    state.viewBox = { x: 0, y: 0, width: state.width, height: state.height };
    updateViewBox();
    setStatus('Image fitted to workspace');
  }

  function clientPoint(event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return {
      x: geometry.clamp(transformed.x, 0, state.width),
      y: geometry.clamp(transformed.y, 0, state.height)
    };
  }

  function zoomAt(factor, event) {
    const anchor = event ? clientPoint(event) : {
      x: state.viewBox.x + state.viewBox.width / 2,
      y: state.viewBox.y + state.viewBox.height / 2
    };
    const minimumWidth = state.width / 24;
    const maximumWidth = state.width * 4;
    const nextWidth = geometry.clamp(state.viewBox.width * factor, minimumWidth, maximumWidth);
    const nextHeight = nextWidth * state.viewBox.height / state.viewBox.width;
    const ratio = nextWidth / state.viewBox.width;
    state.viewBox = {
      x: anchor.x - (anchor.x - state.viewBox.x) * ratio,
      y: anchor.y - (anchor.y - state.viewBox.y) * ratio,
      width: nextWidth,
      height: nextHeight
    };
    updateViewBox();
  }

  function setTool(tool) {
    if (!['select', 'pen', 'freehand', 'pan'].includes(tool)) return;
    if (state.draft.length && tool !== state.tool && !window.confirm('Discard the unfinished contour?')) return;
    if (state.draft.length && tool !== state.tool) cancelDraft();
    state.tool = tool;
    if (tool !== 'select') state.selectedNode = null;
    document.querySelectorAll('[data-tool]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    viewport.dataset.tool = tool;
    const hints = {
      select: 'Drag nodes · double-click or Shift-click a contour to add a node',
      pen: 'Click around the garment · Enter closes the contour',
      freehand: 'Press and trace the garment outline · release to close',
      pan: 'Drag to move the canvas · wheel to zoom'
    };
    workspaceHint.textContent = hints[tool];
    renderScene();
  }

  function setKind(kind) {
    state.kind = kind === 'subtract' ? 'subtract' : 'add';
    document.querySelectorAll('[data-kind]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.kind === state.kind);
    });
    setStatus(state.kind === 'add' ? 'New contours will add white mask area' : 'New contours will cut holes from the mask');
  }

  function setPreview(preview) {
    state.preview = ['overlay', 'mask', 'outline'].includes(preview) ? preview : 'overlay';
    svg.dataset.preview = state.preview;
    baseImage.style.display = state.preview === 'mask' ? 'none' : 'inline';
    blackPreview.style.display = state.preview === 'mask' ? 'inline' : 'none';
    baseImage.style.opacity = state.preview === 'outline' ? '0.42' : '1';
    document.querySelectorAll('[data-preview]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.preview === state.preview);
    });
    setStatus(`${state.preview[0].toUpperCase()}${state.preview.slice(1)} preview`);
  }

  function nextRegionId() {
    const id = `region-${state.idCounter}`;
    state.idCounter += 1;
    return id;
  }

  function selectRegion(id) {
    state.selectedId = state.regions.some(region => region.id === id) ? id : null;
    state.selectedNode = null;
    renderAll();
  }

  function finalizeDraft(points) {
    const source = points || state.draft;
    if (!source || source.length < 3) {
      setStatus('A closed mask region needs at least three points', true);
      return;
    }
    const tolerance = Math.max(0.35, state.viewBox.width / Math.max(1, svg.clientWidth) * (state.tool === 'freehand' ? 1.65 : 0));
    const simplified = state.tool === 'freehand' ? geometry.simplifyPoints(source, tolerance) : source.map(point => ({ ...point }));
    pushHistory();
    const region = {
      id: nextRegionId(),
      kind: state.kind,
      points: simplified,
      d: '',
      smoothing: state.tool === 'freehand' ? Math.max(35, state.smoothing) : state.smoothing,
      visible: true
    };
    state.regions.push(region);
    state.selectedId = region.id;
    state.selectedNode = null;
    state.draft = [];
    state.draftPointer = null;
    state.drawingFreehand = false;
    setTool('select');
    renderAll();
    markDirty();
    setStatus(`${region.kind === 'subtract' ? 'Cut' : 'Mask'} region created · ${simplified.length} nodes`);
  }

  function cancelDraft() {
    state.draft = [];
    state.draftPointer = null;
    state.drawingFreehand = false;
    renderScene();
    updateHistoryButtons();
    setStatus('Unfinished contour cancelled');
  }

  function addPenPoint(point) {
    const threshold = state.viewBox.width / Math.max(1, svg.clientWidth) * 11;
    if (state.draft.length >= 3 && geometry.pointDistance(point, state.draft[0]) <= threshold) {
      finalizeDraft();
      return;
    }
    state.draft.push(point);
    state.draftPointer = point;
    renderScene();
    updateHistoryButtons();
    setStatus(`${state.draft.length} contour point${state.draft.length === 1 ? '' : 's'} · Enter to close`);
  }

  function deleteSelected() {
    const index = state.regions.findIndex(region => region.id === state.selectedId);
    if (index === -1) return;
    pushHistory();
    state.regions.splice(index, 1);
    state.selectedId = null;
    state.selectedNode = null;
    renderAll();
    markDirty();
    setStatus('Region deleted');
  }

  function duplicateSelected() {
    const region = selectedRegion();
    if (!region) return;
    pushHistory();
    const offset = Math.max(3, state.width / 170);
    const duplicate = {
      ...region,
      id: nextRegionId(),
      points: (region.points || []).map(point => ({ x: point.x + offset, y: point.y + offset })),
      d: region.points && region.points.length ? '' : region.d
    };
    state.regions.push(duplicate);
    state.selectedId = duplicate.id;
    state.selectedNode = null;
    renderAll();
    markDirty();
    setStatus('Region duplicated');
  }

  function removeNode(region, nodeIndex) {
    if (!region || !region.points || region.points.length <= 3) {
      setStatus('A closed region must keep at least three nodes', true);
      return;
    }
    pushHistory();
    region.points.splice(nodeIndex, 1);
    if (state.selectedNode?.regionId === region.id) {
      const selectedIndex = Number(state.selectedNode.index);
      if (selectedIndex === nodeIndex) {
        state.selectedNode = { regionId: region.id, index: Math.min(nodeIndex, region.points.length - 1) };
      } else if (selectedIndex > nodeIndex) {
        state.selectedNode = { regionId: region.id, index: selectedIndex - 1 };
      }
    }
    renderAll();
    markDirty();
    setStatus('Node removed');
  }

  function removeSelectedNode() {
    const selection = selectedNodeData();
    if (!selection) {
      setStatus('Select a node before deleting it', true);
      return;
    }
    removeNode(selection.region, selection.index);
  }

  function insertNode(region, point) {
    if (!region || !region.points || region.points.length < 2) return;
    const nearest = geometry.nearestPointOnPath(region.points, point);
    if (!nearest) return;
    const tolerance = state.viewBox.width / Math.max(1, svg.clientWidth) * 18;
    if (nearest.distance > tolerance) {
      setStatus('Double-click closer to the contour, or Shift-click the contour', true);
      return;
    }
    pushHistory();
    const insertedIndex = nearest.index + 1;
    region.points.splice(insertedIndex, 0, nearest.point);
    state.selectedId = region.id;
    state.selectedNode = { regionId: region.id, index: insertedIndex };
    renderAll();
    markDirty();
    setStatus('Node inserted');
  }

  function pointerDown(event) {
    if (event.button === 2) return;
    svg.focus({ preventScroll: true });
    const point = clientPoint(event);
    const panRequested = state.tool === 'pan' || state.spacePressed || event.button === 1;
    if (panRequested) {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      state.drag = {
        type: 'pan',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        viewBox: { ...state.viewBox }
      };
      viewport.classList.add('is-panning');
      return;
    }

    if (state.tool === 'pen') {
      event.preventDefault();
      addPenPoint(point);
      return;
    }

    if (state.tool === 'freehand') {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      state.draft = [point];
      state.draftPointer = point;
      state.drawingFreehand = true;
      state.drag = { type: 'freehand', pointerId: event.pointerId };
      renderScene();
      return;
    }

    const node = event.target.closest('.mask-node');
    if (node) {
      const region = state.regions.find(item => item.id === node.dataset.regionId);
      const nodeIndex = Number(node.dataset.nodeIndex);
      state.selectedId = region.id;
      state.selectedNode = { regionId: region.id, index: nodeIndex };
      if (event.altKey) {
        removeNode(region, nodeIndex);
        return;
      }
      pushHistory();
      svg.setPointerCapture(event.pointerId);
      state.drag = { type: 'node', pointerId: event.pointerId, regionId: region.id, nodeIndex, moved: false };
      renderNodes();
      renderInspector();
      return;
    }

    const path = event.target.closest('.mask-region, .mask-region-hit');
    if (path) {
      const regionId = path.dataset.regionId;
      if (state.selectedId !== regionId || state.selectedNode) {
        state.selectedId = regionId;
        state.selectedNode = null;
        renderAll();
      }
      const region = selectedRegion();
      if (event.shiftKey && region) {
        event.preventDefault();
        insertNode(region, point);
        return;
      }
      setStatus('Region movement is locked · drag individual nodes to edit');
      return;
    }

    if (state.selectedId) {
      state.selectedId = null;
      state.selectedNode = null;
      renderAll();
    }
  }

  function pointerMove(event) {
    const point = clientPoint(event);
    cursorLabel.textContent = `X ${Math.round(point.x)}  Y ${Math.round(point.y)}`;
    if (!state.drag) {
      if (state.tool === 'pen' && state.draft.length) {
        state.draftPointer = point;
        renderDraft();
      }
      return;
    }

    if (state.drag.type === 'pan') {
      const scaleX = state.drag.viewBox.width / Math.max(1, svg.clientWidth);
      const scaleY = state.drag.viewBox.height / Math.max(1, svg.clientHeight);
      state.viewBox.x = state.drag.viewBox.x - (event.clientX - state.drag.clientX) * scaleX;
      state.viewBox.y = state.drag.viewBox.y - (event.clientY - state.drag.clientY) * scaleY;
      updateViewBox();
      return;
    }

    if (state.drag.type === 'freehand') {
      const last = state.draft[state.draft.length - 1];
      const threshold = state.viewBox.width / Math.max(1, svg.clientWidth) * 1.4;
      if (geometry.pointDistance(last, point) >= threshold) {
        state.draft.push(point);
        state.draftPointer = point;
        renderDraft();
      }
      return;
    }

    if (state.drag.type === 'node') {
      const region = state.regions.find(item => item.id === state.drag.regionId);
      if (!region) return;
      region.points[state.drag.nodeIndex] = point;
      state.drag.moved = true;
      renderScene();
      return;
    }

  }

  function pointerUp(event) {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const drag = state.drag;
    state.drag = null;
    viewport.classList.remove('is-panning');
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (drag.type === 'freehand') {
      const points = state.draft.slice();
      state.drawingFreehand = false;
      finalizeDraft(points);
      return;
    }
    if (drag.type === 'node' && drag.moved) {
      renderAll();
      markDirty();
      setStatus('Node moved');
    } else if (drag.type === 'node') {
      state.history.pop();
      updateHistoryButtons();
    }
  }

  function doubleClick(event) {
    const point = clientPoint(event);
    if (state.tool === 'pen' && state.draft.length >= 3) {
      event.preventDefault();
      if (state.draft.length > 3 && geometry.pointDistance(state.draft[state.draft.length - 1], state.draft[state.draft.length - 2]) < handleRadius() * 2) {
        state.draft.pop();
      }
      finalizeDraft();
      return;
    }
    if (state.tool !== 'select') return;
    const path = event.target.closest('.mask-region, .mask-region-hit');
    if (!path) return;
    const region = state.regions.find(item => item.id === path.dataset.regionId);
    insertNode(region, point);
  }

  function wheel(event) {
    event.preventDefault();
    zoomAt(Math.exp(event.deltaY * 0.0012), event);
  }

  function keyDown(event) {
    const target = event.target;
    const isInput = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (quickSwitchPanel.hidden) openQuickSwitcher();
      else closeQuickSwitcher(true);
      return;
    }
    if (!quickSwitchPanel.hidden && event.key === 'Escape') {
      event.preventDefault();
      closeQuickSwitcher(true);
      return;
    }
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (isInput) return;
    if (event.code === 'Space') {
      state.spacePressed = true;
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && state.draft.length >= 3) {
      event.preventDefault();
      finalizeDraft();
      return;
    }
    if (event.key === 'Escape') {
      if (state.draft.length) cancelDraft();
      else selectRegion(null);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && (state.selectedNode || state.selectedId)) {
      event.preventDefault();
      if (state.selectedNode) removeSelectedNode();
      else deleteSelected();
      return;
    }
    if (event.key === '0') {
      fitView();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'v') setTool('select');
    else if (key === 'p') setTool('pen');
    else if (key === 'b') setTool('freehand');
    else if (key === 'h') setTool('pan');
    else if (key === 'a') setKind('add');
    else if (key === 's') setKind('subtract');
    else if (event.key === '+' || event.key === '=') zoomAt(0.82);
    else if (event.key === '-') zoomAt(1.22);
  }

  function keyUp(event) {
    if (event.code === 'Space') state.spacePressed = false;
  }

  function applyDocumentSize(scaleRegions) {
    const previousWidth = Number(svg.dataset.documentWidth) || state.width;
    const previousHeight = Number(svg.dataset.documentHeight) || state.height;
    if (scaleRegions && (previousWidth !== state.width || previousHeight !== state.height)) {
      const scaleX = state.width / previousWidth;
      const scaleY = state.height / previousHeight;
      state.regions.forEach(region => {
        if (region.points && region.points.length) {
          region.points = region.points.map(point => ({ x: point.x * scaleX, y: point.y * scaleY }));
        }
      });
    }
    svg.dataset.documentWidth = String(state.width);
    svg.dataset.documentHeight = String(state.height);
    [canvasBackground, blackPreview, baseImage].forEach(element => {
      element.setAttribute('width', String(state.width));
      element.setAttribute('height', String(state.height));
    });
    state.viewBox = { x: 0, y: 0, width: state.width, height: state.height };
    documentWidthInput.value = String(state.width);
    documentHeightInput.value = String(state.height);
    updateViewBox();
  }

  async function loadImageSource(src, name, options) {
    const settings = options || {};
    if (!settings.skipConfirm && state.regions.length && !window.confirm('Open a new image and clear the current mask regions?')) return;
    setStatus('Loading image…');
    const image = new Image();
    if (/^https?:/.test(src)) image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = src;
    try {
      await image.decode();
    } catch (error) {
      setStatus('Unable to load that image', true);
      return;
    }
    if (state.imageObjectUrl && state.imageObjectUrl !== src) URL.revokeObjectURL(state.imageObjectUrl);
    state.imageSrc = src;
    state.imageName = name || 'reference-image.png';
    state.width = image.naturalWidth || 1024;
    state.height = image.naturalHeight || 1024;
    if (!settings.keepRegions) {
      state.regions = [];
      state.selectedId = null;
      state.selectedNode = null;
      state.history = [];
      state.future = [];
      state.idCounter = 1;
    }
    baseImage.setAttribute('href', src);
    applyDocumentSize(false);
    renderAll();
    markDirty();
    setStatus(`Image ready · ${state.width} × ${state.height}`);
  }

  async function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/') || file.type === 'image/svg+xml') return;
    const objectUrl = URL.createObjectURL(file);
    state.imageObjectUrl = objectUrl;
    await loadImageSource(objectUrl, file.name);
  }

  async function importSvgText(text, name, options) {
    const settings = options || {};
    let documentData;
    try {
      documentData = geometry.parseSvgDocument(text);
    } catch (error) {
      setStatus(error.message || 'Unable to import SVG', true);
      return;
    }
    if (!settings.skipConfirm && state.regions.length && !window.confirm('Replace the current mask regions with the imported SVG?')) return;
    if (!settings.skipHistory) pushHistory();
    state.width = Math.max(1, Math.round(documentData.width));
    state.height = Math.max(1, Math.round(documentData.height));
    state.regions = documentData.regions.map((region, index) => ({
      ...region,
      id: region.id || `region-${index + 1}`,
      visible: true
    }));
    state.idCounter = state.regions.length + 1;
    state.selectedId = state.regions[0]?.id || null;
    state.selectedNode = null;
    state.imageName = name ? name.replace(/\.svg$/i, '') : state.imageName;
    applyDocumentSize(false);
    renderAll();
    markDirty();
    setStatus(`Imported ${state.regions.length} editable SVG region${state.regions.length === 1 ? '' : 's'}`);
  }

  function exportOptions() {
    const baseName = (state.imageName || 'garment')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'garment';
    return {
      width: state.width,
      height: state.height,
      regions: state.regions,
      title: `${baseName} garment mask`,
      fileName: `${baseName}-garment-mask`
    };
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSvg() {
    if (!state.regions.some(region => region.visible !== false && region.kind !== 'subtract')) {
      setStatus('Create at least one Add region before exporting', true);
      return;
    }
    const options = exportOptions();
    const source = geometry.buildSvgDocument(options);
    downloadBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `${options.fileName}.svg`);
    setStatus(`Exported ${options.fileName}.svg`);
  }

  async function saveAndApply() {
    if (!state.regions.some(region => region.visible !== false && region.kind !== 'subtract')) {
      setStatus('Create at least one Add region before applying', true);
      return;
    }
    const label = saveApplyButton.querySelector('span');
    const originalLabel = label.textContent;
    saveApplyButton.disabled = true;
    saveApplyButton.classList.remove('is-applied');
    label.textContent = 'Saving…';
    setStatus('Saving SVG path data to the mask database…');
    try {
      const source = geometry.buildSvgDocument(exportOptions());
      const response = await fetch(`/api/on-model-svg-masks/${encodeURIComponent(root.dataset.maskKey)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'SVGMaskEditor'
        },
        body: JSON.stringify({ svgData: source })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Mask could not be applied.');
      root.dataset.maskRevision = String(result.updatedAt || '');
      saveDraft();
      saveApplyButton.classList.add('is-applied');
      label.textContent = 'Applied ✓';
      setStatus(`Applied database SVG mask · ${result.nodeCount} nodes`);
      window.setTimeout(() => {
        saveApplyButton.classList.remove('is-applied');
        label.textContent = originalLabel;
      }, 2200);
    } catch (error) {
      label.textContent = originalLabel;
      setStatus(error.message || 'Mask could not be applied', true);
    } finally {
      saveApplyButton.disabled = false;
    }
  }

  async function copySvg() {
    if (!state.regions.length) {
      setStatus('There are no regions to copy', true);
      return;
    }
    const source = geometry.buildSvgDocument(exportOptions());
    try {
      await navigator.clipboard.writeText(source);
      setStatus('SVG source copied to clipboard');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = source;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      setStatus('SVG source copied to clipboard');
    }
  }

  async function exportPng() {
    if (!state.regions.some(region => region.visible !== false && region.kind !== 'subtract')) {
      setStatus('Create at least one Add region before exporting', true);
      return;
    }
    if (state.width * state.height > 48_000_000) {
      setStatus('PNG export is limited to 48 megapixels in the browser', true);
      return;
    }
    const options = exportOptions();
    const source = geometry.buildSvgDocument(options);
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = state.width;
      canvas.height = state.height;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, state.width, state.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG encoding failed');
      downloadBlob(blob, `${options.fileName}.png`);
      setStatus(`Exported ${options.fileName}.png`);
    } catch (error) {
      setStatus('PNG export failed in this browser', true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function clearDocument() {
    if (state.regions.length && !window.confirm('Clear every mask region? This can be undone.')) return;
    pushHistory();
    state.regions = [];
    state.selectedId = null;
    state.selectedNode = null;
    state.draft = [];
    renderAll();
    markDirty();
    setStatus('All regions cleared');
  }

  function fileDropped(file) {
    if (!file) return;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      file.text().then(text => importSvgText(text, file.name));
    } else if (file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  }

  document.querySelectorAll('[data-tool]').forEach(button => {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  });
  document.querySelectorAll('[data-kind]').forEach(button => {
    button.addEventListener('click', () => setKind(button.dataset.kind));
  });
  document.querySelectorAll('[data-preview]').forEach(button => {
    button.addEventListener('click', () => setPreview(button.dataset.preview));
  });

  svg.addEventListener('pointerdown', pointerDown);
  svg.addEventListener('pointermove', pointerMove);
  svg.addEventListener('pointerup', pointerUp);
  svg.addEventListener('pointercancel', pointerUp);
  svg.addEventListener('dblclick', doubleClick);
  svg.addEventListener('wheel', wheel, { passive: false });
  svg.addEventListener('contextmenu', event => event.preventDefault());

  viewport.addEventListener('pointerleave', () => {
    if (!state.drag) cursorLabel.textContent = 'X —  Y —';
  });
  viewport.addEventListener('dragenter', event => {
    event.preventDefault();
    dropOverlay.hidden = false;
  });
  viewport.addEventListener('dragover', event => event.preventDefault());
  viewport.addEventListener('dragleave', event => {
    if (!viewport.contains(event.relatedTarget)) dropOverlay.hidden = true;
  });
  viewport.addEventListener('drop', event => {
    event.preventDefault();
    dropOverlay.hidden = true;
    fileDropped(event.dataTransfer.files[0]);
  });

  imageInput.addEventListener('change', () => {
    handleImageFile(imageInput.files[0]);
    imageInput.value = '';
  });
  svgInput.addEventListener('change', async () => {
    const file = svgInput.files[0];
    if (file) await importSvgText(await file.text(), file.name);
    svgInput.value = '';
  });

  document.addEventListener('paste', event => {
    const files = [...(event.clipboardData?.files || [])];
    const image = files.find(file => file.type.startsWith('image/') && file.type !== 'image/svg+xml');
    if (image) {
      event.preventDefault();
      handleImageFile(image);
      setStatus('Pasted image opened');
    }
  });
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);
  window.addEventListener('blur', () => {
    state.spacePressed = false;
    viewport.classList.remove('is-panning');
  });

  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  document.getElementById('maskZoomIn').addEventListener('click', () => zoomAt(0.82));
  document.getElementById('maskZoomOut').addEventListener('click', () => zoomAt(1.22));
  document.getElementById('maskFitView').addEventListener('click', fitView);
  document.getElementById('maskExportSvg').addEventListener('click', exportSvg);
  document.getElementById('maskExportPng').addEventListener('click', exportPng);
  saveApplyButton.addEventListener('click', saveAndApply);
  document.getElementById('maskCopySvg').addEventListener('click', copySvg);
  document.getElementById('maskNewDocument').addEventListener('click', clearDocument);
  document.getElementById('maskAddRegion').addEventListener('click', () => {
    setKind('add');
    setTool('pen');
  });
  deleteButton.addEventListener('click', deleteSelected);
  deleteNodeButton.addEventListener('click', removeSelectedNode);
  duplicateButton.addEventListener('click', duplicateSelected);

  layerList.addEventListener('click', event => {
    const visibility = event.target.closest('[data-visibility-id]');
    if (visibility) {
      event.stopPropagation();
      const region = state.regions.find(item => item.id === visibility.dataset.visibilityId);
      if (!region) return;
      pushHistory();
      region.visible = region.visible === false;
      if (region.visible === false && state.selectedNode?.regionId === region.id) state.selectedNode = null;
      renderAll();
      markDirty();
      return;
    }
    const row = event.target.closest('[data-region-id]');
    if (row) {
      state.selectedId = row.dataset.regionId;
      state.selectedNode = null;
      setTool('select');
      renderAll();
    }
  });

  function openModel(identifier) {
    if (!identifier || identifier === root.dataset.maskKey) return;
    saveDraft();
    const url = new URL(window.location.href);
    url.searchParams.set('mask', identifier);
    window.location.assign(url);
  }

  if (modelSelect) modelSelect.addEventListener('change', () => openModel(modelSelect.value));
  if (previousModelButton) previousModelButton.addEventListener('click', () => openModel(previousModelButton.dataset.maskId));
  if (nextModelButton) nextModelButton.addEventListener('click', () => openModel(nextModelButton.dataset.maskId));
  if (reviewedButton) reviewedButton.addEventListener('click', toggleReviewed);
  if (!/Mac|iPhone|iPad/.test(navigator.userAgent)) quickSwitchTrigger.querySelector('kbd').textContent = 'Ctrl K';
  quickSwitchTrigger.addEventListener('click', () => {
    if (quickSwitchPanel.hidden) openQuickSwitcher();
    else closeQuickSwitcher(true);
  });
  quickSwitchSearch.addEventListener('input', () => renderQuickSwitcher(true));
  quickSwitchSearch.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveQuickSwitchSelection(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      openQuickSwitchSelection();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeQuickSwitcher(true);
    }
  });
  quickSwitchList.addEventListener('pointermove', event => {
    const row = event.target.closest('[data-quick-switch-index]');
    if (!row) return;
    quickSwitchActiveIndex = Number(row.dataset.quickSwitchIndex) || 0;
    updateQuickSwitchSelection(false);
  });
  quickSwitchList.addEventListener('click', event => {
    const row = event.target.closest('[data-mask-id]');
    if (row) openModel(row.dataset.maskId);
  });
  document.addEventListener('pointerdown', event => {
    if (!quickSwitchPanel.hidden && !quickSwitchPanel.contains(event.target) && !quickSwitchTrigger.contains(event.target)) {
      closeQuickSwitcher(false);
    }
  });

  regionKindInput.addEventListener('change', () => {
    const region = selectedRegion();
    if (!region) return;
    pushHistory();
    region.kind = regionKindInput.value === 'subtract' ? 'subtract' : 'add';
    renderAll();
    markDirty();
    setStatus('Region operation changed');
  });

  smoothingInput.addEventListener('input', () => {
    const value = Number(smoothingInput.value);
    const region = selectedRegion();
    if (region) {
      if (!state.smoothingHistoryOpen) {
        pushHistory();
        state.smoothingHistoryOpen = true;
      }
      region.smoothing = value;
    } else {
      state.smoothing = value;
    }
    smoothingValue.textContent = String(value);
    renderScene();
    markDirty();
  });
  smoothingInput.addEventListener('change', () => {
    state.smoothingHistoryOpen = false;
    renderAll();
    setStatus('Curve smoothing updated');
  });

  overlayOpacityInput.addEventListener('input', () => {
    state.overlayOpacity = Number(overlayOpacityInput.value);
    overlayOpacityValue.textContent = `${state.overlayOpacity}%`;
    svg.style.setProperty('--mask-overlay-opacity', String(state.overlayOpacity / 100));
    markDirty();
  });

  previewColorInput.addEventListener('input', () => setPreviewColor(previewColorInput.value));
  colorSwatches.addEventListener('click', event => {
    const swatch = event.target.closest('[data-preview-color]');
    if (swatch) setPreviewColor(swatch.dataset.previewColor);
  });

  document.getElementById('maskApplyDimensions').addEventListener('click', () => {
    const width = geometry.clamp(Math.round(Number(documentWidthInput.value) || state.width), 1, 12000);
    const height = geometry.clamp(Math.round(Number(documentHeightInput.value) || state.height), 1, 12000);
    if (width === state.width && height === state.height) {
      setStatus('Canvas dimensions are unchanged');
      return;
    }
    pushHistory();
    state.width = width;
    state.height = height;
    applyDocumentSize(true);
    renderAll();
    markDirty();
    setStatus(`Canvas resized to ${width} × ${height}`);
  });

  async function start() {
    const initialSvgElement = document.getElementById('maskInitialSvg');
    const initialSvgText = initialSvgElement?.textContent?.trim() || '';
    const restoredImage = restoreDraft();
    const shouldImportInitialSvg = state.regions.length === 0 && initialSvgText;
    const queryImage = new URLSearchParams(window.location.search).get('image');
    const initialImage = queryImage || restoredImage || root.dataset.defaultImage;
    applyDocumentSize(false);
    setPreview('overlay');
    setTool('select');
    setKind('add');
    renderAll();
    if (initialImage) {
      await loadImageSource(initialImage, state.imageName, {
        skipConfirm: true,
        keepRegions: state.regions.length > 0
      });
    }
    if (shouldImportInitialSvg) {
      await importSvgText(initialSvgText, root.dataset.defaultMaskName || 'existing-mask.svg', {
        skipConfirm: true,
        skipHistory: true
      });
    }
    renderQueueProgress();
    fitView();
  }

  start();
})();
