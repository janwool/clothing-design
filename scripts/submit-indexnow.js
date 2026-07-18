require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const DEFAULT_KEY = '4f87c4d6ad844f9e8a40c866f170d6cf';
const siteUrl = (process.env.SITEMAP_BASE_URL || 'https://www.cloz-design.com').replace(/\/+$/, '');
const key = process.env.INDEXNOW_KEY || DEFAULT_KEY;
const keyLocation = `${siteUrl}/${key}.txt`;
const sitemapPath = path.resolve(__dirname, '..', 'public', 'sitemap.xml');

async function main() {
  const sitemap = await fs.readFile(sitemapPath, 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);

  if (process.env.INDEXNOW_DRY_RUN === 'true') {
    console.log(JSON.stringify({ endpoint: INDEXNOW_ENDPOINT, keyLocation, urlCount: urls.length }, null, 2));
    return;
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(siteUrl).hostname,
      key,
      keyLocation,
      urlList: urls
    })
  });

  if (!response.ok) {
    throw new Error(`IndexNow submission failed with HTTP ${response.status}: ${await response.text()}`);
  }

  console.log(JSON.stringify({ submitted: urls.length, status: response.status }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
