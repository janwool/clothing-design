(function exposeEditorTransforms(root, factory) {
  const transforms = factory();
  if (typeof module === 'object' && module.exports) module.exports = transforms;
  if (root) root.ModelDesignerTransforms = transforms;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEditorTransforms() {
  'use strict';

  function rotateVector(x, y, angle) {
    const radians = angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return {
      x: x * cosine - y * sine,
      y: x * sine + y * cosine
    };
  }

  function localVector(dx, dy, angle) {
    return rotateVector(dx, dy, -angle);
  }

  function anchorRatios(handle) {
    return {
      x: handle.includes('e') ? 0 : handle.includes('w') ? 1 : 0.5,
      y: handle.includes('s') ? 0 : handle.includes('n') ? 1 : 0.5
    };
  }

  function elementPointToSvg(data, localX, localY) {
    const centerX = data.width / 2;
    const centerY = data.height / 2;
    const offset = rotateVector(localX - centerX, localY - centerY, data.rotate || 0);
    return {
      x: data.x + centerX + offset.x,
      y: data.y + centerY + offset.y
    };
  }

  function placeRectAtFixedAnchor(data, handle, width, height) {
    const anchor = anchorRatios(handle);
    const fixedPoint = elementPointToSvg(
      data,
      data.width * anchor.x,
      data.height * anchor.y
    );
    const centerX = width / 2;
    const centerY = height / 2;
    const nextAnchorOffset = rotateVector(
      width * anchor.x - centerX,
      height * anchor.y - centerY,
      data.rotate || 0
    );
    return {
      x: fixedPoint.x - centerX - nextAnchorOffset.x,
      y: fixedPoint.y - centerY - nextAnchorOffset.y,
      width,
      height,
      rotate: data.rotate || 0
    };
  }

  function resizeFromPointer(data, handle, dx, dy, options = {}) {
    const minimum = Math.max(1, Number(options.minSize) || 1);
    const local = localVector(dx, dy, data.rotate || 0);
    let width = data.width;
    let height = data.height;

    if (handle.includes('e')) width = data.width + local.x;
    if (handle.includes('w')) width = data.width - local.x;
    if (handle.includes('s')) height = data.height + local.y;
    if (handle.includes('n')) height = data.height - local.y;

    width = Math.max(minimum, width);
    height = Math.max(minimum, height);

    if (options.lockAspect) {
      const minimumScale = Math.max(minimum / data.width, minimum / data.height);
      let scale;
      if (handle === 'e' || handle === 'w') {
        scale = width / data.width;
      } else if (handle === 'n' || handle === 's') {
        scale = height / data.height;
      } else {
        const widthScale = width / data.width;
        const heightScale = height / data.height;
        scale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
          ? widthScale
          : heightScale;
      }
      scale = Math.max(minimumScale, scale);
      width = data.width * scale;
      height = data.height * scale;
    }

    return {
      ...placeRectAtFixedAnchor(data, handle, width, height),
      scale: width / data.width
    };
  }

  function resizeCursor(handle, angle) {
    const baseAngle = handle === 'e' || handle === 'w'
      ? 0
      : handle === 'n' || handle === 's'
        ? 90
        : handle === 'nw' || handle === 'se'
          ? 45
          : -45;
    const normalized = ((baseAngle + (angle || 0)) % 180 + 180) % 180;
    const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
    return cursors[Math.round(normalized / 45) % cursors.length];
  }

  function clampRectToBounds(data, bounds) {
    const width = Math.max(0, Number(data.width) || 0);
    const height = Math.max(0, Number(data.height) || 0);
    const angle = (Number(data.rotate) || 0) * Math.PI / 180;
    const rotatedWidth = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
    const rotatedHeight = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle));
    const boundsX = Number(bounds?.x) || 0;
    const boundsY = Number(bounds?.y) || 0;
    const boundsWidth = Math.max(0, Number(bounds?.width) || 0);
    const boundsHeight = Math.max(0, Number(bounds?.height) || 0);
    const halfRotatedWidth = rotatedWidth / 2;
    const halfRotatedHeight = rotatedHeight / 2;
    const minCenterX = boundsX + halfRotatedWidth;
    const maxCenterX = boundsX + boundsWidth - halfRotatedWidth;
    const minCenterY = boundsY + halfRotatedHeight;
    const maxCenterY = boundsY + boundsHeight - halfRotatedHeight;
    const requestedCenterX = (Number(data.x) || 0) + width / 2;
    const requestedCenterY = (Number(data.y) || 0) + height / 2;
    const centerX = minCenterX > maxCenterX
      ? boundsX + boundsWidth / 2
      : Math.max(minCenterX, Math.min(maxCenterX, requestedCenterX));
    const centerY = minCenterY > maxCenterY
      ? boundsY + boundsHeight / 2
      : Math.max(minCenterY, Math.min(maxCenterY, requestedCenterY));

    return {
      ...data,
      x: centerX - width / 2,
      y: centerY - height / 2
    };
  }

  return {
    anchorRatios,
    clampRectToBounds,
    elementPointToSvg,
    localVector,
    placeRectAtFixedAnchor,
    resizeCursor,
    resizeFromPointer,
    rotateVector
  };
});
