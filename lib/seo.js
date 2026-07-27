const DEFAULT_SITE_IMAGE_PATH = 'https://cdn.cloz-design.com/site/icon.png';
const { getPublicSiteOrigin } = require('./url-policy');

function getRequestOrigin(req) {
  return getPublicSiteOrigin();
}

function toAbsoluteUrl(req, value) {
  if (!value) return undefined;
  try {
    return new URL(value).href;
  } catch (err) {
    const origin = getRequestOrigin(req);
    return origin ? new URL(value, origin).href : value;
  }
}

function firstImage(req, candidates = []) {
  const value = candidates.find(Boolean) || DEFAULT_SITE_IMAGE_PATH;
  return toAbsoluteUrl(req, value);
}

function imageObject(req, value) {
  const url = firstImage(req, [value]);
  return {
    '@type': 'ImageObject',
    url,
    contentUrl: url
  };
}

function breadcrumbList(req, items = []) {
  const list = items.filter(item => item && item.name).map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url ? toAbsoluteUrl(req, item.url) : undefined
  }));

  if (!list.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list
  };
}

function itemList(req, name, items = [], getUrl = item => item.url, getImage = item => item.image_url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.filter(Boolean).map((item, index) => {
      const url = getUrl(item);
      const image = getImage(item);
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: item.name || item.title,
        url: url ? toAbsoluteUrl(req, url) : undefined,
        image: image ? toAbsoluteUrl(req, image) : undefined
      };
    })
  };
}

function webPage(req, options = {}) {
  const url = toAbsoluteUrl(req, options.path || req.originalUrl || req.path || '/');
  const image = firstImage(req, Array.isArray(options.image) ? options.image : [options.image]);
  const page = {
    '@context': 'https://schema.org',
    '@type': options.type || 'WebPage',
    name: options.name,
    description: options.description,
    url,
    image,
    primaryImageOfPage: imageObject(req, image),
    mainEntity: options.mainEntity
  };

  if (options.extra && typeof options.extra === 'object') {
    Object.assign(page, options.extra);
  }

  return page;
}

function pageStructuredData(req, options = {}) {
  return [
    webPage(req, options),
    breadcrumbList(req, options.breadcrumbs)
  ].filter(Boolean);
}

module.exports = {
  DEFAULT_SITE_IMAGE_PATH,
  getRequestOrigin,
  toAbsoluteUrl,
  firstImage,
  imageObject,
  breadcrumbList,
  itemList,
  webPage,
  pageStructuredData
};
