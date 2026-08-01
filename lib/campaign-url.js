const { getPublicSiteOrigin } = require('./url-policy');

function normalizeCampaignToken(value, fallback = '') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || fallback;
}

function buildCampaignUrl(options = {}) {
  const url = new URL(options.url || '/', `${getPublicSiteOrigin()}/`);
  const source = normalizeCampaignToken(options.source);
  const campaign = normalizeCampaignToken(options.campaign);
  if (!source) throw new Error('Campaign source is required');
  if (!campaign) throw new Error('Campaign name is required');

  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', normalizeCampaignToken(options.medium, 'organic-social'));
  url.searchParams.set('utm_campaign', campaign);
  const content = normalizeCampaignToken(options.content);
  if (content) url.searchParams.set('utm_content', content);
  return url.href;
}

module.exports = {
  buildCampaignUrl,
  normalizeCampaignToken
};
