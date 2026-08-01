const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCampaignUrl, normalizeCampaignToken } = require('../lib/campaign-url');

test('normalizes campaign labels consistently', () => {
  assert.equal(normalizeCampaignToken(' August / T-Shirt Launch '), 'august-t-shirt-launch');
});

test('builds an attributed organic social URL', () => {
  assert.equal(
    buildCampaignUrl({
      url: '/tools/t-shirt-mockup-generator',
      source: 'Pinterest',
      campaign: 'August T-Shirt',
      content: 'Pin 01'
    }),
    'https://www.cloz-design.com/tools/t-shirt-mockup-generator?utm_source=pinterest&utm_medium=organic-social&utm_campaign=august-t-shirt&utm_content=pin-01'
  );
});

test('requires a source and campaign name', () => {
  assert.throws(() => buildCampaignUrl({ url: '/' }), /source is required/i);
});
