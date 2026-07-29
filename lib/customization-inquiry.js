function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, maxLength);
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateInquiryPayload(body = {}) {
  const contact = body.contact && typeof body.contact === 'object' ? body.contact : {};
  const snapshots = body.snapshots && typeof body.snapshots === 'object' ? body.snapshots : {};
  const quantity = Number.parseInt(body.quantity, 10);
  const normalized = {
    modelId: Number.isInteger(Number(body.modelId)) && Number(body.modelId) > 0 ? Number(body.modelId) : null,
    modelSlug: cleanText(body.modelSlug, 180),
    modelName: cleanText(body.modelName, 180),
    name: cleanText(contact.name, 100),
    email: cleanText(contact.email, 180).toLowerCase(),
    quantity,
    notes: cleanMultiline(body.notes, 3000),
    sourceUrl: cleanText(body.sourceUrl, 500),
    website: cleanText(body.website, 200),
    snapshot3d: snapshots.threeD,
    snapshot2d: snapshots.twoD
  };

  const errors = [];
  if (normalized.name.length < 2) errors.push('Please enter your name.');
  if (!validateEmail(normalized.email)) errors.push('Please enter a valid email address.');
  if (!Number.isInteger(normalized.quantity) || normalized.quantity < 1 || normalized.quantity > 1000000) {
    errors.push('Customization quantity must be between 1 and 1,000,000.');
  }
  if (!normalized.modelSlug && !normalized.modelName) errors.push('The selected 3D model is missing.');
  if (!normalized.snapshot3d) errors.push('The 3D design screenshot is missing.');
  if (!normalized.snapshot2d) errors.push('The 2D design screenshot is missing.');

  return { valid: errors.length === 0, errors, value: normalized };
}

module.exports = {
  validateEmail,
  validateInquiryPayload
};
