const { getPublicSiteOrigin } = require('./url-policy');

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(value) {
  const origin = getPublicSiteOrigin();
  try {
    return new URL(value, `${origin}/`).href;
  } catch (_) {
    return origin;
  }
}

function toRssDate(value) {
  const date = new Date(`${value || ''}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

function buildRssFeed(articles = []) {
  const siteUrl = getPublicSiteOrigin();
  const feedUrl = `${siteUrl}/feed.xml`;
  const items = articles.map(article => {
    const articleUrl = `${siteUrl}/blog/${encodeURIComponent(article.slug)}`;
    return [
      '    <item>',
      `      <title>${escapeXml(article.title)}</title>`,
      `      <link>${escapeXml(articleUrl)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(articleUrl)}</guid>`,
      `      <description>${escapeXml(article.description || article.dek)}</description>`,
      `      <pubDate>${toRssDate(article.updatedAt || article.publishedAt)}</pubDate>`,
      `      <category>${escapeXml(article.category)}</category>`,
      `      <media:content url="${escapeXml(absoluteUrl(article.image))}" medium="image" />`,
      '    </item>'
    ].join('\n');
  }).join('\n');

  const latestDate = articles.reduce((latest, article) => {
    const value = article.updatedAt || article.publishedAt || '';
    return value > latest ? value : latest;
  }, '');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    '    <title>ClothingDesign Apparel Mockup Guides</title>',
    `    <link>${escapeXml(`${siteUrl}/blog`)}</link>`,
    '    <description>Practical apparel mockup, 3D clothing design, print placement, ecommerce, and print-on-demand guides.</description>',
    '    <language>en</language>',
    `    <lastBuildDate>${toRssDate(latestDate)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

module.exports = {
  absoluteUrl,
  buildRssFeed,
  escapeXml,
  toRssDate
};
