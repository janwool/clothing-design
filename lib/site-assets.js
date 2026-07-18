const CDN_BASE_URL = 'https://cdn.cloz-design.com';
const SITE_ASSET_VERSION = '20260719';
const MODEL_COVER_VERSION = '20260621';

function siteImage(relativePath) {
  const normalized = String(relativePath || '').replace(/^\/+/, '');
  return `${CDN_BASE_URL}/image/${normalized}?v=${SITE_ASSET_VERSION}`;
}

function modelCover(filename) {
  const normalized = String(filename || '').replace(/^\/+/, '');
  return `${CDN_BASE_URL}/image/design3d-covers/${normalized}?v=cover-${MODEL_COVER_VERSION}`;
}

module.exports = {
  CDN_BASE_URL,
  MODEL_COVER_VERSION,
  SITE_ASSET_VERSION,
  modelCover,
  siteImage
};
