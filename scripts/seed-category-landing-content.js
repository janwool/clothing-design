require('dotenv').config();

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');

const dryRun = process.argv.includes('--dry-run');

function modelLandingContent({ name, focus, outputs }) {
  return {
    workflow: {
      title: `Create ${name.toLowerCase()} mockups from editable 3D clothing models`,
      description: `Use this category when you need ${focus} without rebuilding a garment scene from scratch.`,
      steps: [
        { title: 'Pick the closest model', body: `Select a ${name.toLowerCase()} base that matches your silhouette, product angle, and artwork placement needs.` },
        { title: 'Apply artwork direction', body: 'Use the browser editor to test color, graphics, material direction, and surface placement.' },
        { title: 'Check presentation angles', body: 'Rotate the model and review front, side, and detail views before export.' },
        { title: 'Download review visuals', body: 'Export transparent product renders for ecommerce drafts, launch decks, and internal approvals.' }
      ]
    },
    output: {
      title: `${name} 3D models for product-ready apparel visuals`,
      cards: outputs
    },
    library: {
      title: `Open an editable ${name.toLowerCase()} model and create apparel mockups in the browser.`,
      buttonLabel: `Browse ${name} 3D Models`,
      buttonHref: '/mockups'
    },
    faq: {
      title: `${name} 3D model questions`,
      items: [
        { question: `What are ${name.toLowerCase()} 3D models best for?`, answer: `They are best for ${focus}, product page drafts, design approvals, and apparel presentation visuals.` },
        { question: 'Can I use these 3D garment models online for free?', answer: `Yes. Open a ${name.toLowerCase()} model in the browser to review the garment, test colors and artwork, and export a mockup preview.` },
        { question: 'Can I customize the model online?', answer: 'Yes. Open a model in the Design 3D editor to preview colors, graphics, artwork scale, and product angles in the browser.' },
        { question: 'Do I need desktop 3D software to use these models?', answer: 'No. These pages support browser-based model viewing, artwork placement, color previews, and mockup exports.' },
        { question: 'Can I export product mockups?', answer: 'Yes. The workflow is designed for transparent apparel renders that can support ecommerce, portfolio, and launch deck visuals.' }
      ]
    }
  };
}

const categoryContent = [
  {
    slug: 't-shirt-mockup',
    resourceType: '3d-models',
    content: modelLandingContent({
      name: 'T-Shirt',
      focus: 'T-shirt mockup generation, print placement previews, apparel colorway testing, and product render export',
      outputs: [
        { title: 'Graphic tee previews', body: 'Place front artwork, chest logos, repeat graphics, and brand marks on an editable T-shirt model.' },
        { title: 'Ecommerce draft renders', body: 'Export consistent transparent visuals before photography or physical samples are ready.' },
        { title: 'Colorway comparison', body: 'Test shirt base colors and artwork contrast in a fast browser workflow.' }
      ]
    })
  },
  {
    slug: 'hoodie-mockup',
    resourceType: '3d-models',
    content: modelLandingContent({
      name: 'Hoodie',
      focus: 'hoodie mockup generation, streetwear graphics, sweatshirt colorway tests, and product presentation',
      outputs: [
        { title: 'Streetwear artwork review', body: 'Preview chest prints, sleeve graphics, back artwork, and trim color on a hoodie base.' },
        { title: 'Launch deck visuals', body: 'Create stronger hoodie references for merch drops, capsule collections, and buyer presentations.' },
        { title: 'Fit-aware mockups', body: 'Use 3D angles to judge hood, sleeve, pocket, and hem proportions while testing graphics.' }
      ]
    })
  },
  {
    slug: 'top',
    resourceType: '3d-models',
    content: modelLandingContent({
      name: 'Top',
      focus: 'top garment mockups, blouse or shirt previews, color testing, and digital apparel presentation',
      outputs: [
        { title: 'Top silhouette previews', body: 'Use editable 3D models to review proportion, surface graphics, and product angles.' },
        { title: 'Design approval assets', body: 'Share browser-generated visuals with design, merchandising, and ecommerce teams.' },
        { title: 'Material direction tests', body: 'Try color and artwork direction before moving into deeper simulation or sample production.' }
      ]
    })
  }
];

async function ensureSchema() {
  await db.run('ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});
}

async function applyContent() {
  await ensureSchema();
  let updated = 0;
  let missing = 0;

  for (const item of categoryContent) {
    const content = JSON.stringify(item.content);
    const existing = await db.get(
      'SELECT id, name FROM categories WHERE slug = ? AND resource_type = ?',
      [item.slug, item.resourceType]
    );

    if (!existing) {
      missing += 1;
      console.warn(`Missing category: ${item.resourceType}/${item.slug}`);
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await db.run(
        'UPDATE categories SET landing_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [content, existing.id]
      );
    }
    console.log(`${dryRun ? 'Would update' : 'Updated'} ${item.resourceType}/${item.slug} (${existing.name})`);
  }

  console.log(`${dryRun ? 'Dry run complete' : 'Done'}: ${updated} categories ${dryRun ? 'matched' : 'updated'}, ${missing} missing.`);
}

applyContent()
  .then(() => {
    if (typeof db.close === 'function') db.close();
  })
  .catch(err => {
    console.error(err);
    if (typeof db.close === 'function') db.close();
    process.exit(1);
  });
