const { Buffer } = require('node:buffer');

const PROJECT_TYPES = new Set(['3d', 'white_mockup']);
const MAX_PROJECT_DATA_BYTES = 300 * 1024;

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isStoredImageUrl(value) {
  if (!value) return true;
  return /^(?:https:\/\/|\/)[^\s]+$/i.test(String(value)) && !String(value).startsWith('//');
}

function containsEmbeddedImage(value) {
  if (typeof value === 'string') return /(?:data:image\/|blob:)/i.test(value);
  if (Array.isArray(value)) return value.some(containsEmbeddedImage);
  if (value && typeof value === 'object') return Object.values(value).some(containsEmbeddedImage);
  return false;
}

function containsUnsafeMarkup(value) {
  if (typeof value === 'string') {
    return /<\s*script\b|<[^>]+\son[a-z]+\s*=|(?:href|src)\s*=\s*["']?\s*javascript\s*:/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsUnsafeMarkup);
  if (value && typeof value === 'object') return Object.values(value).some(containsUnsafeMarkup);
  return false;
}

function safeSourceUrl(value, projectType) {
  const sourceUrl = String(value || '').trim();
  const validPrefix = projectType === '3d' ? '/3d-models/' : '/white-mockups/';
  if (!sourceUrl.startsWith(validPrefix) || sourceUrl.startsWith('//') || /[\r\n]/.test(sourceUrl)) return '';
  return sourceUrl.slice(0, 500);
}

function validateProjectPayload(payload = {}) {
  const projectType = cleanText(payload.projectType, 32);
  const name = cleanText(payload.name, 120);
  const sourceId = cleanText(payload.sourceId, 160);
  const sourceUrl = safeSourceUrl(payload.sourceUrl, projectType);
  const previewImageUrl = String(payload.previewImageUrl || '').trim().slice(0, 1200);
  const designData = payload.designData && typeof payload.designData === 'object' && !Array.isArray(payload.designData)
    ? payload.designData
    : null;

  if (!PROJECT_TYPES.has(projectType)) return { valid: false, error: 'Unsupported project type.' };
  if (!name) return { valid: false, error: 'Project name is required.' };
  if (!sourceUrl) return { valid: false, error: 'Project source is invalid.' };
  if (!isStoredImageUrl(previewImageUrl)) return { valid: false, error: 'Preview image must be a stored image URL.' };
  if (!designData) return { valid: false, error: 'Project design data is required.' };
  if (containsEmbeddedImage(designData)) {
    return { valid: false, error: 'Project images must be saved as image URLs.' };
  }
  if (containsUnsafeMarkup(designData)) return { valid: false, error: 'Project design data contains unsafe markup.' };

  const serialized = JSON.stringify(designData);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_DATA_BYTES) {
    return { valid: false, error: 'Project design data is too large.' };
  }

  return {
    valid: true,
    value: { projectType, name, sourceId: sourceId || null, sourceUrl, previewImageUrl: previewImageUrl || null, designData, serialized }
  };
}

function parseProjectRow(row, includeDesignData = true) {
  if (!row) return null;
  const project = {
    id: row.id,
    projectType: row.project_type,
    name: row.name,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    previewImageUrl: row.preview_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includeDesignData) {
    try {
      project.designData = JSON.parse(row.design_data || '{}');
    } catch (error) {
      project.designData = {};
    }
  }
  return project;
}

module.exports = {
  MAX_PROJECT_DATA_BYTES,
  containsEmbeddedImage,
  containsUnsafeMarkup,
  parseProjectRow,
  validateProjectPayload
};
