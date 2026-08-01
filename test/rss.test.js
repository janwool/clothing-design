const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRssFeed, escapeXml } = require('../lib/rss');

test('escapes XML-sensitive feed content', () => {
  assert.equal(escapeXml('Mockups & <Models>'), 'Mockups &amp; &lt;Models&gt;');
});

test('builds a discoverable RSS feed with canonical article URLs', () => {
  const xml = buildRssFeed([{
    slug: 't-shirt-size-guide',
    title: 'T-Shirt Size & Placement Guide',
    description: 'Measure <before> printing.',
    category: 'Apparel Production',
    image: '/images/guide.webp',
    publishedAt: '2026-07-23',
    updatedAt: '2026-07-24'
  }]);

  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<atom:link href="https:\/\/www\.cloz-design\.com\/feed\.xml"/);
  assert.match(xml, /T-Shirt Size &amp; Placement Guide/);
  assert.match(xml, /https:\/\/www\.cloz-design\.com\/blog\/t-shirt-size-guide/);
  assert.match(xml, /https:\/\/www\.cloz-design\.com\/images\/guide\.webp/);
  assert.doesNotMatch(xml, /<before>/);
});
