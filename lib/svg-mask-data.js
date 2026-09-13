const geometry = require('../public/js/svg-mask-geometry');

const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_REGIONS = 200;
const MAX_NODES = 50000;

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateSvgMaskData(value) {
  const svgData = String(value || '').trim();
  if (!svgData) throw validationError('SVG mask data is required.');
  if (Buffer.byteLength(svgData, 'utf8') > MAX_SVG_BYTES) {
    throw validationError('SVG mask data is too large.');
  }
  if (!/<svg\b/i.test(svgData) || !/<\/svg>\s*$/i.test(svgData)) {
    throw validationError('SVG mask data is incomplete.');
  }
  if (/<(?:script|foreignObject|iframe|image|use|style)\b/i.test(svgData)
    || /<!DOCTYPE|<!ENTITY/i.test(svgData)
    || /\son[a-z]+\s*=/i.test(svgData)
    || /\s(?:href|xlink:href)\s*=/i.test(svgData)) {
    throw validationError('SVG mask contains unsupported active content.');
  }

  let parsed;
  try {
    parsed = geometry.parseSvgDocument(svgData);
  } catch (error) {
    throw validationError(error.message || 'SVG mask could not be parsed.');
  }
  const width = Math.round(Number(parsed.width));
  const height = Math.round(Number(parsed.height));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000) {
    throw validationError('SVG mask dimensions are invalid.');
  }
  if (!parsed.regions.length || parsed.regions.length > MAX_REGIONS) {
    throw validationError('SVG mask must contain between 1 and 200 editable regions.');
  }
  if (!parsed.regions.some(region => region.kind !== 'subtract')) {
    throw validationError('SVG mask must contain at least one Add region.');
  }

  let nodeCount = 0;
  for (const region of parsed.regions) {
    if (!Array.isArray(region.points) || region.points.length < 3) {
      throw validationError('Every SVG mask region must contain editable point data.');
    }
    nodeCount += region.points.length;
    for (const point of region.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
        || point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
        throw validationError('SVG mask points must stay inside the document bounds.');
      }
    }
  }
  if (nodeCount > MAX_NODES) throw validationError('SVG mask contains too many editable nodes.');

  return {
    svgData,
    width,
    height,
    regionCount: parsed.regions.length,
    nodeCount
  };
}

module.exports = {
  MAX_SVG_BYTES,
  validateSvgMaskData
};
