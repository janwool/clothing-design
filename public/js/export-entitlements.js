(function initializeExportEntitlements() {
  'use strict';

  let entitlementPromise;

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

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Export image could not be prepared.'));
      image.src = source;
    });
  }

  async function prepareExport(source) {
    const entitlements = await getEntitlements();
    if (entitlements?.features?.removeWatermarks) return source;

    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const base = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
    const label = 'CLOZDESIGN · FREE';
    context.font = `600 ${base}px Arial, sans-serif`;
    context.textBaseline = 'middle';
    const textWidth = context.measureText(label).width;
    const horizontalPadding = Math.round(base * 0.85);
    const verticalPadding = Math.round(base * 0.58);
    const boxWidth = Math.round(textWidth + horizontalPadding * 2);
    const boxHeight = Math.round(base + verticalPadding * 2);
    const margin = Math.max(12, Math.round(base * 0.8));
    const x = Math.max(0, canvas.width - boxWidth - margin);
    const y = Math.max(0, canvas.height - boxHeight - margin);

    context.fillStyle = 'rgba(20, 20, 22, 0.72)';
    context.fillRect(x, y, boxWidth, boxHeight);
    context.fillStyle = '#ffffff';
    context.fillText(label, x + horizontalPadding, y + boxHeight / 2);
    return canvas.toDataURL('image/png');
  }

  window.ExportEntitlements = Object.freeze({ getEntitlements, prepareExport });
}());
