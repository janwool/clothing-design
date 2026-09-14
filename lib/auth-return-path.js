function safeReturnPath(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || /[\r\n]/.test(path)) return '';
  return path.slice(0, 1000);
}

function isAuthPath(value) {
  return /^\/auth(?:\/|$|\?)/.test(String(value || ''));
}

function getHeaderLoginUrl(req) {
  const currentPath = safeReturnPath(req.originalUrl || req.url);
  if (!currentPath || isAuthPath(currentPath)) return '/auth/login';
  return `/auth/login?next=${encodeURIComponent(currentPath)}`;
}

function getAuthReturnPath(req) {
  const explicitPath = safeReturnPath(req.body?.next || req.query?.next);
  if (explicitPath && !isAuthPath(explicitPath)) return explicitPath;

  const rawReferer = String(req.get?.('referer') || req.headers?.referer || '').trim();
  const host = String(req.get?.('host') || req.headers?.host || '').trim();
  if (!rawReferer || !host) return '';

  try {
    const referer = new URL(rawReferer, `${req.protocol || 'http'}://${host}`);
    if (referer.host !== host) return '';
    const refererPath = safeReturnPath(`${referer.pathname}${referer.search}${referer.hash}`);
    return refererPath && !isAuthPath(refererPath) ? refererPath : '';
  } catch (error) {
    return '';
  }
}

module.exports = {
  getAuthReturnPath,
  getHeaderLoginUrl,
  isAuthPath,
  safeReturnPath
};
