const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');
const { mainStudio, workflows, workflowPaths, selectAudienceStarters } = require('../lib/tshirt-workflows');
const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'views/tshirt-generator-landing.ejs'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const starter = { title: 'Basic short-sleeve T-shirt', href: '/3d-models/t-shirt-mockup/real-blank', image: '/blank.webp', modelSrc: '/blank.glb' };
const renderInclude = (name, locals) => {
  if (name === 'tshirt-blank-gallery') name = `partials/${name}`;
  return name.startsWith('partials/tshirt-')
    ? ejs.render(fs.readFileSync(path.join(root, 'views', `${name}.ejs`), 'utf8'), { ...locals, include: renderInclude })
    : '';
};
const render = (studio, slug, models = [starter], blankModels = models) => ejs.render(template, {
  include: renderInclude,
  toolPage: { ...studio, slug, tshirtStudio: studio, tshirtWorkflows: workflows, modelStarters: models, blankModels, faq: studio.faq }
});

test('hub automatically loads 3D with only a spinner, truthful pricing and workflow links', () => {
  const html = render(mainStudio, 't-shirt-mockup-generator');
  assert.match(html, /T-shirt mockup<br>generator\./);
  assert.doesNotMatch(html, /tmg-model-poster|Preparing preview/);
  assert.match(html, /data-tmg-loading role="status" aria-label="Loading T-shirt"/);
  assert.match(html, /src="\/blank.glb"[\s\S]*?loading="eager"/);
  assert.match(html, /Finished design exports and watermark removal require Pro/);
  assert.match(html, /data-tmg-retry/);
  assert.doesNotMatch(html, /Load interactive 3D|Free during beta/);
  assert.doesNotMatch(html, /Canva|canva-t-shirt-mockup/);
  workflowPaths.forEach(url => assert.ok(html.includes(`href="${url}"`)));
});

test('every scene page has its own product layout, FAQs and reciprocal links', () => {
  assert.equal(workflows.length, 7);
  assert.equal(new Set(workflows.map(item => item.heading)).size, 7);
  workflows.forEach(studio => {
    const html = render(studio, studio.slug);
    assert.ok(html.includes(`tmg-scene-${studio.slug}`));
    assert.doesNotMatch(html, /tmg-check-section|tmg-workflow-copy|tmg-step-list/);
    studio.faq.forEach(item => assert.ok(html.includes(ejs.escapeXML(item.answer))));
    assert.ok(html.includes('href="/tools/t-shirt-mockup-generator"'));
    assert.ok(!html.includes(`href="/tools/${studio.slug}"`));
    assert.ok(fs.existsSync(path.join(root, 'public', studio.workflowImage)));
    assert.ok(sitemap.includes(`<loc>https://www.cloz-design.com/tools/${studio.slug}</loc>`));
  });
});

test('empty model state provides a useful destination without dead editor links', () => {
  const html = render(mainStudio, 't-shirt-mockup-generator', []);
  assert.match(html, /No garment preview available/);
  assert.match(html, /href="\/mockups\/t-shirt-mockup"/);
  assert.doesNotMatch(html, /undefined#design|<model-viewer/);
  assert.doesNotMatch(html, /data-tmg-blank-gallery/);
});

test('blank gallery includes the catalog beyond the four interactive hero styles', () => {
  const catalog = Array.from({ length: 24 }, (_, index) => ({
    ...starter, title: `Catalog T-shirt ${index + 1}`, href: `/3d-models/t-shirt-mockup/blank-${index + 1}`
  }));
  const html = render(mainStudio, 't-shirt-mockup-generator', catalog.slice(0, 4), catalog);
  assert.equal((html.match(/<model-viewer/g) || []).length, 4);
  assert.equal((html.match(/class="tmg-fit-card"/g) || []).length, 24);
  assert.match(html, /href="\/3d-models\/t-shirt-mockup\/blank-24#design"/);
  assert.match(html, /data-tmg-blank-track[\s\S]*?tabindex="0"/);
});

test('black and white pages have different automatic preview colors', () => {
  const black = workflows.find(item => item.slug === 'black-t-shirt-mockup');
  const white = workflows.find(item => item.slug === 'white-t-shirt-mockup');
  assert.match(render(black, black.slug), /data-color="#171717"/);
  assert.match(render(white, white.slug), /data-color="#f5f3ed"/);
});

test('audience collections prioritize available silhouettes and keep real editor destinations', () => {
  const models = ['Crewneck Straight-Cut Short-Sleeve T-Shirt', 'Relaxed Crewneck Drop-Shoulder Elbow-Sleeve T-Shirt', 'High-Neck Straight-Cut Long-Sleeve T-Shirt', 'V-Neck Fitted Short-Sleeve T-Shirt', 'Fitted Crewneck Long-Sleeve Crop T-Shirt', 'Ruffle-Trim Crewneck Short-Sleeve T-Shirt'].map((title, index) => ({ ...starter, title, href: `/actual-model-${index}` }));
  const women = selectAudienceStarters(models, 'women');
  const men = selectAudienceStarters(models, 'men');
  assert.equal(women[0], models[3]);
  assert.equal(women[1], models[4]);
  assert.equal(women[2], models[5]);
  assert.deepEqual(men.slice(0, 3), models.slice(0, 3));
  assert.equal(new Set(women).size, women.length);
  assert.deepEqual(selectAudienceStarters([], 'women'), []);
  assert.deepEqual(selectAudienceStarters([models[0]], 'women'), [models[0]]);
});
