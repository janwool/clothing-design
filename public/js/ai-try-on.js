(() => {
  const root = document.getElementById('aiTryOnApp');
  if (!root) return;

  const resultImage = document.getElementById('tryOnResultImage');
  const loading = document.getElementById('tryOnLoading');
  const toast = document.getElementById('tryOnToast');
  const timeHint = document.getElementById('tryOnTimeHint');
  const designStatusText = root.querySelector('.ai-tryon__status span');
  const viewer = document.getElementById('tryOnGarmentViewer');
  const viewerPanel = document.getElementById('tryOnViewerPanel');
  const previewToggle = root.querySelector('.tryon-result__toggle');
  const afterResultControls = [...root.querySelectorAll('[data-after-result]')];
  const downloadButton = document.getElementById('downloadTryOn');
  const modelCards = [...root.querySelectorAll('[data-model-card]')];
  const generateButtons = [...root.querySelectorAll('[data-generate]')];
  const previewButtons = [...root.querySelectorAll('[data-preview-state]')];
  let selectedModel = modelCards[0] || null;
  let personImageUrl = selectedModel?.dataset.modelImage || resultImage.src;
  let generatedImageUrl = '';
  let generating = false;
  let toastTimer;
  let designLoadPromise = Promise.resolve(false);
  let savedProjectPreviewUrl = '';
  const tryOnDesignTransferKey = 'clozdesign_tryon_design_v1';

  function trackTryOn(eventName, parameters = {}) {
    window.trackEvent?.(eventName, {
      item_id: String(root.dataset.modelId || root.dataset.modelSlug || ''),
      item_category: 'ai_try_on',
      model_slug: root.dataset.modelSlug || undefined,
      person_model_id: selectedModel?.dataset?.modelId || undefined,
      ...parameters
    });
  }

  function generationFailureContext(error, stage) {
    const status = Number(error?.status) || undefined;
    let failureReason = 'unknown';
    if (status === 401) failureReason = 'session_expired';
    else if (status === 403) failureReason = 'credits_or_plan_limit';
    else if (status === 400) failureReason = 'validation_failed';
    else if (status >= 500) failureReason = 'generation_service_error';
    else if (/timed out|timeout/i.test(String(error?.message || ''))) failureReason = 'timeout';
    else if (!status) failureReason = stage === 'prepare_inputs' ? 'input_preparation_failed' : 'network_or_client_error';
    return { failure_reason: failureReason, generation_stage: stage, error_status: status };
  }

  function sanitizeTextureTransform(value) {
    const scale = value?.scale;
    const offset = value?.offset;
    if (![scale?.u, scale?.v, offset?.u, offset?.v].every(Number.isFinite)) return null;
    return {
      scale: { u: scale.u, v: scale.v },
      offset: { u: offset.u, v: offset.v }
    };
  }

  function projectMatchesCurrentModel(project) {
    const sourceId = String(project?.sourceId || '');
    if (!sourceId) return true;
    return [String(root.dataset.modelId || ''), String(root.dataset.modelSlug || '')].includes(sourceId);
  }

  function readTransferredDesign() {
    try {
      const storedTransfer = sessionStorage.getItem(tryOnDesignTransferKey);
      root.dataset.designTransfer = storedTransfer ? 'found' : 'missing';
      const transfer = JSON.parse(storedTransfer || 'null');
      const matchesModel = transfer && (
        String(transfer.modelId || '') === String(root.dataset.modelId || '') ||
        String(transfer.modelSlug || '') === String(root.dataset.modelSlug || '')
      );
      const isFresh = Date.now() - Number(transfer?.createdAt || 0) < 60 * 60 * 1000;
      if (!matchesModel || !isFresh || (!transfer.textureUrl && !transfer.appearance)) {
        root.dataset.designTransfer = matchesModel ? 'stale-or-empty' : 'model-mismatch';
        return null;
      }
      root.dataset.designTransfer = 'matched';
      return {
        textureUrl: transfer.textureUrl || '',
        appearance: transfer.appearance || null,
        textureTransform: sanitizeTextureTransform(transfer.textureTransform)
      };
    } catch (error) {
      return null;
    }
  }

  async function resolveCurrentDesign() {
    const projectId = new URLSearchParams(window.location.search).get('project');
    if (projectId && window.UserProjects) {
      try {
        const project = await window.UserProjects.loadProjectFromUrl('3d');
        if (!projectMatchesCurrentModel(project)) throw new Error('This design belongs to another 3D model.');
        if (project?.designData) {
          // Same-tab handoff retains the full-resolution in-memory design.
          const transfer = readTransferredDesign();
          if (!project.designData.textureUrl && transfer?.textureUrl) {
            const pending = JSON.parse(sessionStorage.getItem(tryOnDesignTransferKey) || 'null');
            if (pending?.projectId === project.id) return transfer;
          }
          return {
            previewImageUrl: project.designData.textureUrl ? '' : project.previewImageUrl,
            textureUrl: project.designData.textureUrl || '',
            appearance: project.designData,
            textureTransform: sanitizeTextureTransform(project.designData.textureTransform)
          };
        }
      } catch (error) {
        const transfer = readTransferredDesign();
        if (transfer) return transfer;
        throw error;
      }
    }
    return readTransferredDesign();
  }

  async function waitForViewerModel(timeoutMs = 20000) {
    if (!viewer) throw new Error('The 3D garment viewer is unavailable.');
    await customElements.whenDefined('model-viewer');
    await viewer.updateComplete;
    if (viewer.model) return viewer.model;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        viewer.removeEventListener('load', handleLoad);
        viewer.removeEventListener('error', handleError);
      };
      const handleLoad = () => { cleanup(); resolve(); };
      const handleError = () => { cleanup(); reject(new Error('The 3D garment could not be loaded.')); };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('The 3D garment timed out while loading.'));
      }, timeoutMs);
      viewer.addEventListener('load', handleLoad, { once: true });
      viewer.addEventListener('error', handleError, { once: true });
    });
    await viewer.updateComplete;
    if (!viewer.model) throw new Error('The 3D garment is not ready.');
    return viewer.model;
  }

  function loadTextureImage(sourceUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The saved design texture could not be decoded.'));
      image.src = sourceUrl;
    });
  }

  async function createDesignTexture(sourceUrl) {
    if (/^data:image\//i.test(sourceUrl) && typeof viewer.createCanvasTexture === 'function') {
      const image = await loadTextureImage(sourceUrl);
      const texture = viewer.createCanvasTexture();
      const canvas = texture?.source?.element;
      const context = canvas?.getContext?.('2d');
      if (canvas && context) {
        canvas.width = Math.max(1, image.naturalWidth || image.width);
        canvas.height = Math.max(1, image.naturalHeight || image.height);
        context.translate(0, canvas.height);
        context.scale(1, -1);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        texture.source.update?.();
        return texture;
      }
    }
    return viewer.createTexture(sourceUrl);
  }

  async function loadTextureTemplateTransform() {
    const textureTemplateUrl = root.dataset.textureTemplateUrl;
    if (!textureTemplateUrl) return null;
    try {
      const response = await fetch(`/api/texture-svg?url=${encodeURIComponent(textureTemplateUrl)}`);
      if (!response.ok) return null;
      const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      const sourceSvg = parsed.documentElement;
      if (sourceSvg.getAttribute('data-layout') !== 'packed' || !sourceSvg.hasAttribute('data-source')) return null;
      const parts = String(sourceSvg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      if (parts.length < 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) return null;
      return {
        scale: { u: 1 / parts[2], v: -1 / parts[3] },
        offset: { u: -parts[0] / parts[2], v: -parts[1] / parts[3] }
      };
    } catch (error) {
      return null;
    }
  }

  function colorToRgba(value) {
    const safe = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).slice(1) : '';
    if (!safe) return null;
    const color = Number.parseInt(safe, 16);
    return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, 1];
  }

  async function applyCurrentDesign(design) {
    if (!design) return false;
    if (!design.textureUrl && design.previewImageUrl) {
      const previewUrl = window.UserProjects.textureUrl(design.previewImageUrl);
      const image = await loadTextureImage(previewUrl);
      image.alt = 'Saved 3D design';
      const panel = document.getElementById('tryOnViewerPanel');
      panel.querySelectorAll('model-viewer, img, .tryon-viewer__controls, .tryon-viewer__hint').forEach(node => { node.hidden = true; node.style.display = 'none'; });
      panel.appendChild(image);
      savedProjectPreviewUrl = previewUrl;
      return true;
    }
    if (!viewer) return false;
    const model = await waitForViewerModel();
    let texture = null;
    let textureTransform = design.textureTransform;
    if (design.textureUrl) {
      const sourceUrl = /^https:\/\//i.test(design.textureUrl)
        ? `/api/project-texture?url=${encodeURIComponent(design.textureUrl)}`
        : design.textureUrl;
      [texture, textureTransform] = await Promise.all([
        createDesignTexture(sourceUrl),
        textureTransform ? Promise.resolve(textureTransform) : loadTextureTemplateTransform()
      ]);
    }
    const baseColor = colorToRgba(design.appearance?.baseColor);
    const accentColor = colorToRgba(design.appearance?.accentColor) || baseColor;
    const roughness = Number(design.appearance?.roughness);
    const metalness = Number(design.appearance?.metalness);
    let appliedMaterialCount = 0;
    (model.materials || []).forEach((material, index) => {
      try {
        const pbr = material.pbrMetallicRoughness;
        if (texture) {
          pbr?.setBaseColorFactor?.([1, 1, 1, 1]);
          const baseColorTexture = pbr?.baseColorTexture;
          if (baseColorTexture?.setTexture) baseColorTexture.setTexture(texture);
          else if (pbr?.setBaseColorTexture) pbr.setBaseColorTexture(texture);
          else return;
          const sampler = pbr?.baseColorTexture?.texture?.sampler;
          sampler?.setRotation?.(null);
          sampler?.setScale?.(textureTransform?.scale || null);
          sampler?.setOffset?.(textureTransform?.offset || null);
          appliedMaterialCount += 1;
        } else if (baseColor) {
          pbr?.setBaseColorFactor?.(index === 0 ? baseColor : accentColor);
          if (Number.isFinite(roughness)) pbr?.setRoughnessFactor?.(roughness);
          if (Number.isFinite(metalness)) pbr?.setMetallicFactor?.(metalness);
          appliedMaterialCount += 1;
        }
      } catch (error) {
        console.warn('Skipped an incompatible Try-on material:', error);
      }
    });
    if (!appliedMaterialCount) throw new Error('The current design could not be applied to this 3D garment.');
    viewer.requestUpdate?.();
    await viewer.updateComplete;
    viewer.dismissPoster?.();
    return true;
  }

  async function loadCurrentDesign() {
    try {
      const design = await resolveCurrentDesign();
      if (!design) {
        trackTryOn('ai_tryon_design_missing');
        return false;
      }
      if (designStatusText) designStatusText.textContent = 'Loading current design…';
      await applyCurrentDesign(design);
      root.dataset.designLoaded = 'true';
      if (designStatusText) designStatusText.textContent = 'Current design loaded';
      trackTryOn('ai_tryon_design_load_success', {
        design_source: new URLSearchParams(window.location.search).has('project') ? 'project' : 'session_transfer'
      });
      return true;
    } catch (error) {
      console.error(error);
      if (designStatusText) designStatusText.textContent = 'Original garment loaded';
      showToast(error.message || 'The current design could not be restored.', true);
      trackTryOn('ai_tryon_design_load_error', { failure_reason: 'design_restore_failed' });
      return false;
    }
  }

  function refreshGenerateLabels() {
    const idleLabel = `${generatedImageUrl ? 'Regenerate' : 'Generate try-on'} · ${Number(root.dataset.creditCost) || 10} credits`;
    generateButtons.forEach(button => {
      const label = button.querySelector('span');
      if (label) label.textContent = generating ? 'Generating…' : idleLabel;
      else button.textContent = generating ? 'Generating…' : idleLabel;
    });
  }

  function setResultAvailability(hasResult) {
    afterResultControls.forEach(control => { control.hidden = !hasResult; });
    previewToggle?.classList.toggle('has-result', hasResult);
    if (downloadButton) {
      downloadButton.disabled = !hasResult;
      downloadButton.setAttribute('aria-disabled', String(!hasResult));
    }
    refreshGenerateLabels();
  }

  function selectModel(card) {
    if (!card || card === selectedModel || generating) return;
    modelCards.forEach(item => {
      const isSelected = item === card;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-selected', String(isSelected));
    });
    selectedModel = card;
    personImageUrl = card.dataset.modelImage;
    generatedImageUrl = '';
    trackTryOn('ai_tryon_person_model_select', {
      person_model_id: card.dataset.modelId,
      model_style: card.dataset.modelStyle || undefined,
      selection_source: card.dataset.modelId === 'upload' ? 'upload' : 'library'
    });
    setResultAvailability(false);
    resultImage.classList.add('is-updating');
    window.setTimeout(() => {
      resultImage.src = personImageUrl;
      resultImage.alt = `${card.dataset.modelName}, selected model for ${root.dataset.modelName}`;
      resultImage.classList.remove('is-updating', 'is-before');
      setPreviewState('before');
    }, 170);
  }

  function setPreviewState(state) {
    if (state === 'after' && !generatedImageUrl) state = 'before';
    previewButtons.forEach(button => {
      button.classList.toggle('is-active', button.dataset.previewState === state);
    });
    resultImage.src = state === 'after' && generatedImageUrl ? generatedImageUrl : personImageUrl;
    resultImage.classList.toggle('is-before', state === 'before');
  }

  function showToast(message = 'Try-on ready', isError = false) {
    window.clearTimeout(toastTimer);
    toast.lastChild.textContent = ` ${message}`;
    toast.classList.toggle('is-error', isError);
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, isError ? 4600 : 2400);
  }

  function setGenerating(isGenerating) {
    generating = isGenerating;
    root.setAttribute('aria-busy', String(isGenerating));
    loading.hidden = !isGenerating;
    resultImage.classList.toggle('is-updating', isGenerating);
    generateButtons.forEach(button => {
      button.disabled = isGenerating;
    });
    refreshGenerateLabels();
    timeHint.textContent = isGenerating ? 'Generating…' : '';
    document.getElementById('tryOnPhoto').disabled = isGenerating;
    document.getElementById('tryOnUploadButton').disabled = isGenerating;
    document.getElementById('tryOnStyleFilter').disabled = isGenerating;
  }

  async function imageUrlToDataUri(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load the selected model photo.');
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const maxEdge = 1536;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#efefec';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  async function captureGarmentImage() {
    await designLoadPromise;
    if (savedProjectPreviewUrl) return imageUrlToDataUri(savedProjectPreviewUrl);
    const fallbackImage = root.dataset.garmentFallback;
    if (!viewer?.toDataURL) {
      if (fallbackImage) return imageUrlToDataUri(fallbackImage);
      throw new Error('The 3D garment is not ready yet.');
    }
    if (!viewer.model) {
      try {
        await waitForViewerModel(6000);
      } catch (error) {
        if (fallbackImage) return imageUrlToDataUri(fallbackImage);
        throw new Error('The 3D garment could not be loaded.');
      }
    }

    const autoRotate = viewer.autoRotate;
    viewer.autoRotate = false;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const image = viewer.toDataURL('image/png');
    viewer.autoRotate = autoRotate;
    return image;
  }

  async function generateTryOn() {
    if (generating || !selectedModel) return;
    const isRegeneration = Boolean(generatedImageUrl);
    const startedAt = performance.now();
    let generationStage = 'access_check';
    trackTryOn('ai_tryon_generate_click', {
      credit_cost: Number(root.dataset.creditCost) || 10,
      is_regeneration: isRegeneration
    });
    setGenerating(true);
    try {
      if (!(await window.UpgradeModal.requireTryOnAccess())) {
        trackTryOn('ai_tryon_generate_access_blocked', {
          credit_cost: Number(root.dataset.creditCost) || 10
        });
        setGenerating(false);
        return;
      }
      generationStage = 'prepare_inputs';
      const [personImage, garmentImage] = await Promise.all([
        imageUrlToDataUri(personImageUrl),
        captureGarmentImage()
      ]);
      generationStage = 'request_generation';
      trackTryOn('ai_tryon_generate_begin', {
        credit_cost: Number(root.dataset.creditCost) || 10,
        is_regeneration: isRegeneration
      });
      const response = await fetch('/api/ai-try-on', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          personImage,
          garmentImage,
          modelId: root.dataset.modelId,
          modelSlug: root.dataset.modelSlug,
          modelName: root.dataset.modelName,
          projectId: new URLSearchParams(window.location.search).get('project'),
          personModelId: selectedModel.dataset.modelId,
          personModelName: selectedModel.dataset.modelName
        })
      });
      const payload = await response.json().catch(() => ({}));
      generationStage = 'handle_response';
      if (!response.ok || !payload.success || !payload.image) {
        if (response.status === 401) {
          trackTryOn('ai_tryon_generate_error', {
            ...generationFailureContext({ status: 401 }, generationStage),
            duration_ms: Math.round(performance.now() - startedAt)
          });
          window.location.href = `/auth/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        if (window.UpgradeModal?.handleLimit(payload)) {
          trackTryOn('ai_tryon_generate_access_blocked', {
            failure_reason: 'credits_or_plan_limit',
            error_status: response.status,
            limit_resource: payload.resource
          });
          setGenerating(false);
          return;
        }
        const requestError = new Error(payload.error || `Try-on failed (${response.status}).`);
        requestError.status = response.status;
        throw requestError;
      }

      generatedImageUrl = payload.image;
      resultImage.alt = `${selectedModel.dataset.modelName} wearing ${root.dataset.modelName}, generated by AI`;
      setGenerating(false);
      setResultAvailability(true);
      setPreviewState('after');
      showToast('Try-on ready');
      trackTryOn('ai_tryon_generate_success', {
        duration_ms: Math.round(performance.now() - startedAt),
        credit_cost: Number(root.dataset.creditCost) || 10,
        credits_remaining: payload.usage?.tryOnCreditsRemaining,
        ai_model: payload.model || undefined,
        is_regeneration: isRegeneration
      });
    } catch (error) {
      console.error(error);
      setGenerating(false);
      setResultAvailability(false);
      setPreviewState('before');
      showToast(error.message || 'AI try-on failed. Please try again.', true);
      trackTryOn('ai_tryon_generate_error', {
        ...generationFailureContext(error, generationStage),
        duration_ms: Math.round(performance.now() - startedAt),
        is_regeneration: isRegeneration
      });
    }
  }

  modelCards.forEach(card => card.addEventListener('click', () => selectModel(card)));
  document.getElementById('tryOnStyleFilter')?.addEventListener('change', event => {
    modelCards.forEach(card => { card.hidden = Boolean(event.target.value && card.dataset.modelStyle !== event.target.value); });
    trackTryOn('ai_tryon_model_filter_change', { model_style: event.target.value || 'all' });
  });
  let uploadedPhotoUrl = '';
  document.getElementById('tryOnUploadButton')?.addEventListener('click', () => {
    trackTryOn('ai_tryon_photo_upload_click');
    document.getElementById('tryOnPhoto').click();
  });
  document.getElementById('tryOnPhoto')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || generating) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      trackTryOn('ai_tryon_photo_upload_invalid', {
        file_type: file.type || 'unknown',
        file_size: file.size
      });
      showToast('Choose a PNG, JPEG or WebP photo under 10 MB.', true);
      event.target.value = '';
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = nextUrl;
      await image.decode();
      if (uploadedPhotoUrl) URL.revokeObjectURL(uploadedPhotoUrl);
      uploadedPhotoUrl = nextUrl;
      selectModel({ dataset: { modelId: 'upload', modelName: 'Your photo', modelImage: nextUrl } });
      trackTryOn('ai_tryon_photo_upload_success', { file_type: file.type, file_size: file.size });
    } catch {
      URL.revokeObjectURL(nextUrl);
      showToast('This photo could not be opened.', true);
      trackTryOn('ai_tryon_photo_upload_error', { failure_reason: 'image_decode_failed' });
    }
    event.target.value = '';
  });
  function closeEditor(event) {
    if (window.parent === window) return;
    event?.preventDefault();
    window.parent.postMessage({ type: 'tryon:close' }, location.origin);
  }
  root.querySelector('.ai-tryon__close')?.addEventListener('click', closeEditor);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeEditor(event); });
  previewButtons.forEach(button => button.addEventListener('click', () => {
    setPreviewState(button.dataset.previewState);
    trackTryOn('ai_tryon_preview_toggle', { preview_state: button.dataset.previewState });
  }));
  generateButtons.forEach(button => button.addEventListener('click', generateTryOn));

  document.getElementById('resetTryOnViewer')?.addEventListener('click', () => {
    if (!viewer) return;
    viewer.cameraOrbit = '28deg 74deg 108%';
    viewer.cameraTarget = 'auto auto auto';
    viewer.fieldOfView = 'auto';
    viewer.autoRotate = false;
  });

  document.getElementById('fullscreenTryOnViewer')?.addEventListener('click', async () => {
    if (!viewerPanel?.requestFullscreen) return;
    try {
      await viewerPanel.requestFullscreen();
    } catch (error) {
      console.warn('Fullscreen preview is unavailable:', error);
    }
  });

  const fitViewButton = document.getElementById('fitViewButton');
  fitViewButton?.addEventListener('click', () => {
    const isContained = resultImage.dataset.fit === 'contain';
    resultImage.dataset.fit = isContained ? 'cover' : 'contain';
    resultImage.style.objectFit = isContained ? 'cover' : 'contain';
    resultImage.style.background = isContained ? '' : '#d9d8d4';
    fitViewButton.querySelector('span').textContent = isContained ? 'Fit view' : 'Fill view';
  });

  downloadButton?.addEventListener('click', () => {
    if (!generatedImageUrl) return;
    trackTryOn('ai_tryon_result_download');
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `${selectedModel?.dataset.modelName || 'model'}-${root.dataset.modelName || 'garment'}-try-on.png`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-');
    link.click();
  });

  document.querySelector('.tryon-step__view-all')?.addEventListener('click', event => {
    const picker = document.querySelector('.model-picker');
    picker?.classList.toggle('is-expanded');
    event.currentTarget.textContent = picker?.classList.contains('is-expanded') ? 'Collapse' : 'View all';
  });

  setResultAvailability(false);
  setPreviewState('before');
  trackTryOn('ai_tryon_editor_view', {
    has_project: new URLSearchParams(window.location.search).has('project'),
    initial_person_model_id: selectedModel?.dataset?.modelId
  });
  designLoadPromise = loadCurrentDesign();
})();
