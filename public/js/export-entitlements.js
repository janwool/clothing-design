(function initializeExportEntitlements() {
  'use strict';

  const WATERMARK_TILE_URL = '/images/watermarks/clozdesign-watermark-tile-v1.png';
  let entitlementPromise;
  let watermarkTilePromise;
  const watermarkedMaterials = new WeakSet();

  async function getEntitlements() {
    if (!entitlementPromise) {
      entitlementPromise = fetch('/api/account/entitlements', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      })
        .then(async response => {
          const payload = await response.json().catch(() => ({}));
          return response.ok ? payload.entitlements : null;
        })
        .catch(() => null);
    }
    return entitlementPromise;
  }

  let accessDialog;
  function showAccessDialog(message, upgrade = false) {
    if (upgrade && window.UpgradeModal) {
      window.UpgradeModal.open({ resource: 'exports' });
      return;
    }
    if (!accessDialog) {
      accessDialog = document.createElement('dialog');
      accessDialog.className = 'export-access-dialog';
      accessDialog.setAttribute('aria-labelledby', 'exportAccessTitle');
      accessDialog.setAttribute('aria-describedby', 'exportAccessMessage');
      accessDialog.innerHTML = `<form method="dialog"><button class="export-access-close" aria-label="Close">×</button>
        <span class="export-access-eyebrow">CLOZDESIGN · EXPORT</span>
        <h2 id="exportAccessTitle"></h2><p id="exportAccessMessage"></p>
        <div class="export-access-actions"><button>Keep editing</button><a href="/pricing" target="_blank" rel="noopener">View plans ↗</a></div></form>`;
      document.body.appendChild(accessDialog);
      accessDialog.addEventListener('click', event => { if (event.target === accessDialog) accessDialog.close(); });
    }
    accessDialog.querySelector('h2').textContent = upgrade ? 'Make it yours. Export with Pro.' : 'Unable to verify export access';
    accessDialog.querySelector('p').textContent = message;
    accessDialog.querySelector('a').hidden = !upgrade;
    if (!accessDialog.open) accessDialog.showModal();
  }

  // Always revalidate: an editor may remain open across an upgrade or expiry.
  async function requireExportAccess() {
    try {
      const response = await fetch('/api/account/exports/authorize', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      if (response.ok && payload.success === true) {
        entitlementPromise = undefined;
        return true;
      }
      if (response.status === 401 || (response.status === 403 && payload.code === 'EXPORT_UPGRADE_REQUIRED')) {
        showAccessDialog('Image, video, 3D model exports and share links are included with Pro and Business. Your design stays here while you choose a plan.', true);
      } else {
        showAccessDialog('We could not check your subscription. Please try exporting again in a moment.');
      }
    } catch (error) {
      showAccessDialog('We could not check your subscription. Check your connection and try again.');
    }
    return false;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Export image could not be prepared.'));
      image.src = source;
    });
  }

  function loadWatermarkTile() {
    if (!watermarkTilePromise) {
      watermarkTilePromise = loadImage(WATERMARK_TILE_URL).catch((error) => {
        watermarkTilePromise = null;
        throw error;
      });
    }
    return watermarkTilePromise;
  }

  async function requiresWatermark() {
    const entitlements = await getEntitlements();
    return !entitlements?.features?.removeWatermarks;
  }

  function drawFallbackWatermark(context, canvas, options = {}) {
    const shortestEdge = Math.min(canvas.width, canvas.height);
    const fontSize = Math.max(18, Math.round(shortestEdge * 0.032));
    const horizontalStep = Math.max(260, Math.round(fontSize * 10));
    const verticalStep = Math.max(180, Math.round(fontSize * 6.5));

    context.save();
    context.globalAlpha = options.opacity ?? 0.22;
    context.globalCompositeOperation = options.compositeOperation || 'source-over';
    context.fillStyle = options.color || '#c5c7c4';
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (let y = -verticalStep; y < canvas.height + verticalStep; y += verticalStep) {
      for (let x = -horizontalStep; x < canvas.width + horizontalStep; x += horizontalStep) {
        context.save();
        context.translate(x, y);
        context.rotate(-Math.PI / 6);
        context.fillText('CLOZDESIGN', 0, 0);
        context.restore();
      }
    }
    context.restore();
  }

  async function drawTiledWatermark(context, canvas, options = {}) {
    let tile;
    try {
      tile = await loadWatermarkTile();
    } catch (error) {
      drawFallbackWatermark(context, canvas, options);
      return;
    }

    const shortestEdge = Math.min(canvas.width, canvas.height);
    const markWidth = Math.max(96, Math.min(220, Math.round(shortestEdge * (options.tileScale ?? 0.12))));
    const markHeight = Math.round(markWidth * 0.58);
    const horizontalStep = Math.round(markWidth * 0.9);
    const verticalStep = Math.round(markHeight * 0.92);
    const sourceCrop = { x: 300, y: 390, width: 650, height: 480 };
    const markCanvas = document.createElement('canvas');
    markCanvas.width = sourceCrop.width;
    markCanvas.height = sourceCrop.height;
    const markContext = markCanvas.getContext('2d');
    markContext.drawImage(
      tile,
      sourceCrop.x,
      sourceCrop.y,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      sourceCrop.width,
      sourceCrop.height
    );
    const markPixels = markContext.getImageData(0, 0, markCanvas.width, markCanvas.height);
    for (let index = 3; index < markPixels.data.length; index += 4) {
      markPixels.data[index] = Math.min(255, markPixels.data[index] * 3);
    }
    markContext.putImageData(markPixels, 0, 0);
    markContext.globalCompositeOperation = 'source-in';
    markContext.fillStyle = options.color || '#c5c7c4';
    markContext.fillRect(0, 0, markCanvas.width, markCanvas.height);

    context.save();
    context.globalAlpha = options.opacity ?? 0.3;
    context.globalCompositeOperation = options.compositeOperation || 'source-over';
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    let row = 0;
    for (let y = -verticalStep; y < canvas.height + verticalStep; y += verticalStep) {
      const rowOffset = row % 2 ? -horizontalStep / 2 : 0;
      for (let x = -horizontalStep; x < canvas.width + horizontalStep; x += horizontalStep) {
        context.drawImage(
          markCanvas,
          0,
          0,
          markCanvas.width,
          markCanvas.height,
          x + rowOffset,
          y,
          markWidth,
          markHeight
        );
      }
      row += 1;
    }
    context.restore();
  }

  async function prepareTexture(source, options = {}) {
    if (!await requiresWatermark()) return source;

    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    await drawTiledWatermark(context, canvas, {
      opacity: options.opacity ?? 0.62,
      tileScale: options.tileScale ?? 0.12,
      compositeOperation: 'source-over',
      color: '#c5c7c4'
    });
    return canvas.toDataURL('image/png');
  }

  async function applyModelViewerWatermark(viewer, options = {}) {
    if (!viewer || !await requiresWatermark()) return false;
    await viewer.updateComplete;
    const materials = viewer.model?.materials || [];
    if (!materials.length || typeof viewer.createCanvasTexture !== 'function') return false;
    await Promise.all(materials.map(material => material.ensureLoaded?.()));

    const tile = await loadWatermarkTile().catch(() => null);
    let appliedCount = 0;

    for (const material of materials) {
      if (!options.force && watermarkedMaterials.has(material)) continue;
      const pbr = material.pbrMetallicRoughness;
      if (!pbr) continue;
      const textureInfo = pbr.baseColorTexture;
      const previousSampler = textureInfo?.texture?.sampler;
      const samplerState = {
        rotation: previousSampler?.rotation ?? null,
        scale: previousSampler?.scale && Number.isFinite(previousSampler.scale.u) && Number.isFinite(previousSampler.scale.v)
          ? { u: previousSampler.scale.u, v: previousSampler.scale.v }
          : null,
        offset: previousSampler?.offset && Number.isFinite(previousSampler.offset.u) && Number.isFinite(previousSampler.offset.v)
          ? { u: previousSampler.offset.u, v: previousSampler.offset.v }
          : null
      };
      const sourceElement = textureInfo?.texture?.source?.element || null;
      const width = Math.max(1, sourceElement?.naturalWidth || sourceElement?.videoWidth || sourceElement?.width || 1024);
      const height = Math.max(1, sourceElement?.naturalHeight || sourceElement?.videoHeight || sourceElement?.height || 1024);
      const composition = document.createElement('canvas');
      composition.width = width;
      composition.height = height;
      const compositionContext = composition.getContext('2d');
      compositionContext.fillStyle = '#ffffff';
      compositionContext.fillRect(0, 0, width, height);
      if (sourceElement) {
        try {
          compositionContext.drawImage(sourceElement, 0, 0, width, height);
        } catch (error) {
          console.warn('The original garment texture could not be copied; using its base color.', error);
        }
      }
      if (tile) {
        await drawTiledWatermark(compositionContext, composition, {
          opacity: 0.62,
          tileScale: 0.12,
          compositeOperation: 'source-over',
          color: '#c5c7c4'
        });
      } else {
        drawFallbackWatermark(compositionContext, composition, {
          opacity: 0.62,
          compositeOperation: 'source-over',
          color: '#c5c7c4'
        });
      }

      const viewerTexture = viewer.createCanvasTexture();
      const target = viewerTexture?.source?.element;
      const targetContext = target?.getContext?.('2d');
      if (!target || !targetContext) continue;
      target.width = width;
      target.height = height;
      targetContext.clearRect(0, 0, width, height);
      // model-viewer's CanvasTexture path flips Y while glTF image textures do
      // not, so pre-flip the composed map to preserve the original UV layout.
      targetContext.save();
      targetContext.translate(0, height);
      targetContext.scale(1, -1);
      targetContext.drawImage(composition, 0, 0, width, height);
      targetContext.restore();
      viewerTexture.source.update?.();

      if (textureInfo?.setTexture) textureInfo.setTexture(viewerTexture);
      else if (pbr.setBaseColorTexture) pbr.setBaseColorTexture(viewerTexture);
      else continue;
      const nextSampler = pbr.baseColorTexture?.texture?.sampler;
      nextSampler?.setRotation?.(samplerState.rotation);
      nextSampler?.setScale?.(samplerState.scale);
      nextSampler?.setOffset?.(samplerState.offset);
      watermarkedMaterials.add(material);
      appliedCount += 1;
    }

    if (appliedCount) {
      viewer.requestUpdate?.();
      await viewer.updateComplete;
    }
    return appliedCount > 0;
  }

  function prepareExport(source) {
    return prepareTexture(source, { opacity: 0.62, tileScale: 0.13 });
  }

  window.ExportEntitlements = Object.freeze({
    requireExportAccess,
    applyModelViewerWatermark,
    drawTiledWatermark,
    getEntitlements,
    prepareTexture,
    prepareExport
  });
}());
