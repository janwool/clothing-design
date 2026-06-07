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
  const categorySlugs = String(model.category_slugs || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const categoryNames = String(model.category_names || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const primaryCategorySlug = model.category_slug || categorySlugs[0] || fallbackCategorySlug || generateSlug(model.category, '3d-models');
  return {
    ...model,
    slug: getModelSlug(model),
    category_slug: primaryCategorySlug,
    category_slugs: categorySlugs,
    category_names: categoryNames,
    category_label: categoryNames.length > 0 ? categoryNames.join(', ') : model.category
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
