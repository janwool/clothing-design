const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://www.cloz-design.com';

function getPublicSiteOrigin() {
  const configured = String(process.env.PUBLIC_SITE_ORIGIN || DEFAULT_PUBLIC_SITE_ORIGIN).trim();
  try {
    return new URL(configured).origin;
  } catch (err) {
    return DEFAULT_PUBLIC_SITE_ORIGIN;
  }
}

function normalizePathname(pathname) {
  const value = String(pathname || '/');
  if (value === '/') return '/';
  return value.replace(/\/+$/, '') || '/';
}

function requestProtocol(req) {
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return forwarded || req.protocol || 'http';
}

function requestHost(req) {
  return String(req.get('x-forwarded-host') || req.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

function isLocalRequest(req) {
  const hostname = requestHost(req).replace(/:\d+$/, '');
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function canonicalUrl(pathname = '/') {
  const url = new URL(normalizePathname(pathname), `${getPublicSiteOrigin()}/`);
  url.search = '';
  url.hash = '';
  return url.href;
}

function getCanonicalRedirect(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;

  const publicOrigin = new URL(getPublicSiteOrigin());
  const localRequest = isLocalRequest(req);
  const currentPath = req.path || '/';
  const normalizedPath = normalizePathname(currentPath);
  const needsPathRedirect = normalizedPath !== currentPath;
  const needsOriginRedirect = !localRequest && (
    requestProtocol(req) !== publicOrigin.protocol.replace(':', '') ||
    requestHost(req) !== publicOrigin.host.toLowerCase()
  );

  if (!needsPathRedirect && !needsOriginRedirect) return null;

  const localOrigin = `${requestProtocol(req)}://${requestHost(req)}`;
  const target = new URL(
    req.originalUrl || currentPath,
    localRequest ? `${localOrigin}/` : `${getPublicSiteOrigin()}/`
  );
  if (!localRequest) {
    target.protocol = publicOrigin.protocol;
    target.host = publicOrigin.host;
  }
  target.pathname = normalizedPath;
  return target.href;
}

module.exports = {
  DEFAULT_PUBLIC_SITE_ORIGIN,
  canonicalUrl,
  getCanonicalRedirect,
  getPublicSiteOrigin,
  isLocalRequest,
  normalizePathname,
  requestHost,
  requestProtocol
};
