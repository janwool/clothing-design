const assert = require('node:assert/strict');
const test = require('node:test');

const workerTemplates = require('../src/worker-templates.cjs');

const sharedLocals = {
  title: 'White Mockups',
  page: 'white-mockups',
  user: null,
  pageStyles: [],
  structuredData: null,
  t: key => key
};

test('renders the white mockup library with the Worker template runtime', () => {
  const html = workerTemplates.render('white-mockups', {
    ...sharedLocals,
    assets: [],
    assetSummary: { total: 0, mappedModels: 0, counts: {} },
    activeType: '',
    activeCategory: null,
    categories: [],
    pagination: { page: 1, pageCount: 1, total: 0, start: 0, end: 0, pages: [1] }
  });

  assert.match(html, /On-model white library/);
  assert.match(html, /No white mockups found/);
  assert.match(html, /<body class="category-catalog-page white-mockup-library-page">/);
});

test('renders a white mockup detail page with the Worker template runtime', () => {
  const html = workerTemplates.render('white-mockup-detail', {
    ...sharedLocals,
    asset: {
      asset_name: 'crewneck-tee-male-front',
      garment_type: 'upper',
      base_image_url: 'https://cdn.cloz-design.com/image/mockups/on-model/generated/crewneck-tee-male-front-base.png',
      mask_image_url: 'https://cdn.cloz-design.com/image/mockups/on-model/generated/crewneck-tee-male-front-mask.png',
      depth_image_url: 'https://cdn.cloz-design.com/image/mockups/on-model/generated/crewneck-tee-male-front-depth.png',
      canvas_width: 1024,
      canvas_height: 1536,
      artwork_center_x: 512,
      artwork_center_y: 735,
      artwork_base_width: 620,
      artwork_max_height: 650,
      render_left: 205,
      render_top: 405,
      render_right: 820,
      render_bottom: 1210,
      default_scale: 54,
      default_warp: 42
    },
    displayTitle: 'Crew-neck T-shirt',
    typeLabel: 'Tops',
    typeName: 'top',
    relatedAssets: [],
    whiteFaqItems: []
  });

  assert.match(html, /Crew-neck T-shirt White Mockup/);
  assert.match(html, /whiteMockupCanvas/);
  assert.match(html, /<body class="category-catalog-page white-mockup-detail-page">/);
});

test('compiles model detail locals needed by the Worker-only render path', () => {
  const generatedSource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'worker-templates.cjs'),
    'utf8'
  );

  assert.match(generatedSource, /bodyClass = __locals\.bodyClass/);
  assert.match(generatedSource, /onModelMockupProfile = __locals\.onModelMockupProfile/);
});
