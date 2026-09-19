const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workerTemplates = require('../src/worker-templates.cjs');

test('lists every public tool destination only once', () => {
  const html = workerTemplates.render('tools', {
    title: 'Design Tools',
    page: 'tools',
    user: null,
    pageStyles: [],
    structuredData: null,
    t: key => key
  });
  const content = html.match(/<section class="content-section">([\s\S]*?)<\/section>/)?.[1] || '';
  const toolHrefs = [...content.matchAll(/href="(\/tools\/[^\"]+)"/g)].map(match => match[1]);

  assert.equal(toolHrefs.length, 12);
  assert.equal(new Set(toolHrefs).size, toolHrefs.length);
  assert.equal(content.includes('/tools/2d-mockup'), false);
});

test('keeps the Tools navigation menu free of duplicate destinations', () => {
  const header = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'header.ejs'), 'utf8');
  const menu = header.match(/<div class="dropdown-menu tools-mega-menu">([\s\S]*?)<!-- Right Side -->/)?.[1] || '';
  const toolHrefs = [...menu.matchAll(/href="(\/tools\/[^\"]+)"/g)].map(match => match[1]);

  assert.equal(toolHrefs.length, 12);
  assert.equal(new Set(toolHrefs).size, toolHrefs.length);
  assert.equal(menu.includes('/tools/2d-mockup'), false);
});
