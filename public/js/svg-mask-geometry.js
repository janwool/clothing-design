(function initSvgMaskGeometry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SvgMaskGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSvgMaskGeometry() {
  'use strict';

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function pointDistance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function pointSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return pointDistance(point, start);
    const amount = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(point.x - (start.x + dx * amount), point.y - (start.y + dy * amount));
  }

  function nearestPointOnSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return { x: start.x, y: start.y };
    const amount = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return { x: start.x + dx * amount, y: start.y + dy * amount };
  }

  function simplifyOpen(points, tolerance) {
    if (points.length <= 2) return points.slice();
    let greatestDistance = 0;
    let greatestIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];
    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = pointSegmentDistance(points[index], first, last);
      if (distance > greatestDistance) {
        greatestDistance = distance;
        greatestIndex = index;
      }
    }
    if (greatestDistance <= tolerance) return [first, last];
    const left = simplifyOpen(points.slice(0, greatestIndex + 1), tolerance);
    const right = simplifyOpen(points.slice(greatestIndex), tolerance);
    return left.slice(0, -1).concat(right);
  }

  function simplifyPoints(points, tolerance) {
    if (!Array.isArray(points) || points.length < 4 || tolerance <= 0) {
      return (points || []).map(point => ({ x: Number(point.x), y: Number(point.y) }));
    }
    const normalized = points.map(point => ({ x: Number(point.x), y: Number(point.y) }));
    const simplified = simplifyOpen(normalized.concat([normalized[0]]), tolerance);
    simplified.pop();
    return simplified.length >= 3 ? simplified : normalized.slice(0, 3);
  }

  function formatNumber(value) {
    const rounded = Math.round(Number(value) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
  }

  function pathFromPoints(points, smoothing, closed) {
    if (!Array.isArray(points) || points.length === 0) return '';
    const shouldClose = closed !== false;
    if (points.length === 1) return `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`;
    const amount = clamp(Number(smoothing) || 0, 0, 100) / 100;
    let path = `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`;
    if (amount <= 0.001 || points.length < 3) {
      for (let index = 1; index < points.length; index += 1) {
        path += ` L ${formatNumber(points[index].x)} ${formatNumber(points[index].y)}`;
      }
      return shouldClose ? `${path} Z` : path;
    }

    const tension = amount / 6;
    const count = points.length;
    const segmentCount = shouldClose ? count : count - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const point0 = points[shouldClose ? (index - 1 + count) % count : Math.max(0, index - 1)];
      const point1 = points[index];
      const point2 = points[(index + 1) % count];
      const point3 = points[shouldClose ? (index + 2) % count : Math.min(count - 1, index + 2)];
      const control1 = {
        x: point1.x + (point2.x - point0.x) * tension,
        y: point1.y + (point2.y - point0.y) * tension
      };
      const control2 = {
        x: point2.x - (point3.x - point1.x) * tension,
        y: point2.y - (point3.y - point1.y) * tension
      };
      path += ` C ${formatNumber(control1.x)} ${formatNumber(control1.y)} ${formatNumber(control2.x)} ${formatNumber(control2.y)} ${formatNumber(point2.x)} ${formatNumber(point2.y)}`;
    }
    return shouldClose ? `${path} Z` : path;
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function serializePoints(points) {
    return points.map(point => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(' ');
  }

  function parsePoints(value) {
    return String(value || '')
      .trim()
      .split(/\s+/)
      .map(pair => pair.split(','))
      .filter(pair => pair.length === 2 && Number.isFinite(Number(pair[0])) && Number.isFinite(Number(pair[1])))
      .map(pair => ({ x: Number(pair[0]), y: Number(pair[1]) }));
  }

  function regionPathMarkup(region) {
    const path = region.d || pathFromPoints(region.points, region.smoothing, true);
    const points = Array.isArray(region.points) ? serializePoints(region.points) : '';
    return `    <path id="${escapeAttribute(region.id || '')}" data-mask-kind="${region.kind === 'subtract' ? 'subtract' : 'add'}" data-mask-smoothing="${formatNumber(region.smoothing || 0)}" data-mask-points="${escapeAttribute(points)}" d="${escapeAttribute(path)}"/>`;
  }

  function buildSvgDocument(options) {
    const width = Math.max(1, Math.round(Number(options.width) || 1));
    const height = Math.max(1, Math.round(Number(options.height) || 1));
    const regions = (options.regions || []).filter(region => region.visible !== false);
    const add = regions.filter(region => region.kind !== 'subtract');
    const subtract = regions.filter(region => region.kind === 'subtract');
    const title = escapeAttribute(options.title || 'Garment mask');
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">`,
      `  <title>${title}</title>`,
      `  <rect width="${width}" height="${height}" fill="#000000"/>`,
      '  <g id="mask-add" fill="#ffffff" shape-rendering="geometricPrecision">',
      ...add.map(regionPathMarkup),
      '  </g>',
      '  <g id="mask-subtract" fill="#000000" shape-rendering="geometricPrecision">',
      ...subtract.map(regionPathMarkup),
      '  </g>',
      '</svg>',
      ''
    ];
    return lines.join('\n');
  }

  function parseAttributes(source) {
    const attributes = {};
    String(source || '').replace(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g, (_, name, quote, value) => {
      attributes[name] = value
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      return '';
    });
    return attributes;
  }

  function parseSvgDocument(source) {
    const svgMatch = String(source || '').match(/<svg\b([^>]*)>/i);
    if (!svgMatch) throw new Error('The file does not contain an SVG root element.');
    const svgAttributes = parseAttributes(svgMatch[1]);
    const viewBox = String(svgAttributes.viewBox || '').trim().split(/[\s,]+/).map(Number);
    const width = viewBox.length === 4 && Number.isFinite(viewBox[2])
      ? viewBox[2]
      : Number.parseFloat(svgAttributes.width) || 1024;
    const height = viewBox.length === 4 && Number.isFinite(viewBox[3])
      ? viewBox[3]
      : Number.parseFloat(svgAttributes.height) || 1024;
    const regions = [];
    const pathPattern = /<path\b([^>]*)\/?\s*>/gi;
    let match;
    while ((match = pathPattern.exec(source))) {
      const attributes = parseAttributes(match[1]);
      if (!attributes['data-mask-kind']) continue;
      const points = parsePoints(attributes['data-mask-points']);
      regions.push({
        id: attributes.id || `region-${regions.length + 1}`,
        kind: attributes['data-mask-kind'] === 'subtract' ? 'subtract' : 'add',
        smoothing: clamp(Number(attributes['data-mask-smoothing']) || 0, 0, 100),
        points,
        d: points.length >= 3 ? '' : (attributes.d || ''),
        visible: true
      });
    }
    return { width, height, regions };
  }

  function nearestSegmentIndex(points, point) {
    if (!Array.isArray(points) || points.length < 2) return -1;
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const distance = pointSegmentDistance(point, points[index], points[(index + 1) % points.length]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function nearestPointOnPath(points, point) {
    if (!Array.isArray(points) || points.length < 2) return null;
    let result = null;
    for (let index = 0; index < points.length; index += 1) {
      const projected = nearestPointOnSegment(point, points[index], points[(index + 1) % points.length]);
      const distance = pointDistance(point, projected);
      if (!result || distance < result.distance) result = { index, point: projected, distance };
    }
    return result;
  }

  return {
    buildSvgDocument,
    clamp,
    nearestSegmentIndex,
    nearestPointOnPath,
    parseSvgDocument,
    pathFromPoints,
    pointDistance,
    pointSegmentDistance,
    simplifyPoints
  };
});
