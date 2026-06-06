function generateSlug(value, fallback = 'item') {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function getModelSlug(model) {
  if (model && model.slug && String(model.slug).trim()) {
    return String(model.slug).trim();
  }
  return generateSlug(model && (model.name || `model-${model.id}`), 'model');
}

function normalize3dModel(model, fallbackCategorySlug) {
  if (!model) return model;
  return {
    ...model,
    slug: getModelSlug(model),
    category_slug: model.category_slug || fallbackCategorySlug || generateSlug(model.category, '3d-models')
  };
}

function normalize3dModels(models, fallbackCategorySlug) {
  return (models || []).map(model => normalize3dModel(model, fallbackCategorySlug));
}

module.exports = {
  generateSlug,
  getModelSlug,
  normalize3dModel,
  normalize3dModels
};
