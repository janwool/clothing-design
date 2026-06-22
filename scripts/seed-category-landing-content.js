require('dotenv').config();

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');

const dryRun = process.argv.includes('--dry-run');

function patternLandingContent({ name, focus, review, useCases, related }) {
  return {
    workflow: {
      title: `From ${name} ZPRJ pattern to digital sample review`,
      description: `Use these ${name.toLowerCase()} project files to move from preview selection into CLO 3D or Marvelous Designer simulation with a clearer review focus.`,
      steps: [
        { title: 'Compare previews', body: `Choose a ${name.toLowerCase()} pattern by silhouette, construction details, and the type of sample you need to review.` },
        { title: 'Open the project file', body: 'Load the ZPRJ file in CLO 3D or Marvelous Designer and confirm the 2D pattern, sewing lines, avatar scale, and fabric settings.' },
        { title: 'Inspect the garment', body: `Review ${review} before making fit, material, or construction changes.` },
        { title: 'Export references', body: 'Save renders, screenshots, or updated project files for design review, ecommerce mockups, or production handoff.' }
      ]
    },
    categories: {
      title: `Related ZPRJ pattern categories for ${name.toLowerCase()} workflows`,
      description: 'Switch categories when you need to compare adjacent garment types or build a complete digital outfit workflow.',
      cards: related.map(item => ({ title: item.title, meta: 'ZPRJ patterns', href: item.href }))
    },
    output: {
      title: `${name} patterns for ${focus}`,
      cards: useCases.map(item => ({ title: item.title, body: item.body }))
    },
    library: {
      title: `Start ${name.toLowerCase()} development from simulation-ready ZPRJ files with preview images.`,
      buttonLabel: `Browse ${name} Patterns`,
      buttonHref: '/patterns'
    },
    faq: {
      title: `${name} ZPRJ pattern questions`,
      items: [
        { question: `What are these ${name.toLowerCase()} patterns best used for?`, answer: `They are best used for ${focus}, especially when you need to inspect ${review} in a 3D apparel workflow.` },
        { question: 'Do these files work in CLO 3D?', answer: 'Yes. Download the ZPRJ file, open it as a project in CLO 3D, then review the pattern pieces, garment arrangement, fabric settings, and simulation result.' },
        { question: 'Can I use them in Marvelous Designer?', answer: 'Yes. Marvelous Designer can open ZPRJ project files for pattern inspection, garment simulation, material changes, and revised sample output.' },
        { question: 'Why use preview-guided pattern pages?', answer: 'Preview images help you choose a relevant file before opening desktop software, which reduces low-quality clicks and makes the pattern library easier to scan.' }
      ]
    },
    cta: {
      title: `Choose a ${name.toLowerCase()} pattern and start the simulation review.`,
      description: 'Open a pattern page, download the ZPRJ file, and continue in CLO 3D or Marvelous Designer.',
      primaryLabel: `Browse ${name} Patterns`,
      primaryHref: '/patterns'
    }
  };
}

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
        { question: 'Can I customize the model online?', answer: 'Yes. Open a model in the Design 3D editor to preview colors, graphics, artwork scale, and product angles in the browser.' },
        { question: 'Do I need CLO 3D to use these models?', answer: 'No. These pages support browser-based mockup work. CLO 3D or Marvelous Designer are optional for deeper garment simulation.' },
        { question: 'Can I export product mockups?', answer: 'Yes. The workflow is designed for transparent apparel renders that can support ecommerce, portfolio, and launch deck visuals.' }
      ]
    }
  };
}

const categoryContent = [
  {
    slug: 'patterns-t-shirts',
    resourceType: 'patterns',
    content: patternLandingContent({
      name: 'T-Shirt',
      focus: 'jersey top mockups, print placement tests, ecommerce previews, and fast fit comparison',
      review: 'neckline shape, sleeve balance, hem level, side seam position, and graphic scale',
      related: [
        { title: 'Hoodies', href: '/patterns/patterns-hoodies' },
        { title: 'Women Shirts', href: '/patterns/patterns-women-shirts' },
        { title: 'Outerwear', href: '/patterns/patterns-outerwear' }
      ],
      useCases: [
        { title: 'Print placement checks', body: 'Review logo size, chest graphics, all-over print scale, and sleeve artwork in a garment context.' },
        { title: 'Merch and ecommerce previews', body: 'Prepare clearer product references before photography, sampling, or product page production.' },
        { title: 'Fit and silhouette comparison', body: 'Compare sample numbers in the same T-shirt series to choose the most useful base.' }
      ]
    })
  },
  {
    slug: 'patterns-hoodies',
    resourceType: 'patterns',
    content: patternLandingContent({
      name: 'Hoodie',
      focus: 'casualwear sampling, sweatshirt colorways, hood construction review, and branded merch presentation',
      review: 'hood volume, cuff tension, pocket placement, rib trim, shoulder drape, and hem proportion',
      related: [
        { title: 'T-Shirts', href: '/patterns/patterns-t-shirts' },
        { title: 'Outerwear', href: '/patterns/patterns-outerwear' },
        { title: 'Sportswear', href: '/patterns/patterns-sportswear' }
      ],
      useCases: [
        { title: 'Streetwear sample review', body: 'Evaluate hood shape, relaxed proportion, rib details, and graphic placement before physical sampling.' },
        { title: 'Material and colorway testing', body: 'Use simulation to compare fleece weight, trim color, and print scale across hoodie concepts.' },
        { title: 'Merch deck preparation', body: 'Create stronger references for branded hoodies, team apparel, and casual capsule planning.' }
      ]
    })
  },
  {
    slug: 'patterns-outerwear',
    resourceType: 'patterns',
    content: patternLandingContent({
      name: 'Outerwear',
      focus: 'structured jacket, coat, blazer, and seasonal layer development',
      review: 'collar roll, sleeve pitch, closure placement, layer clearance, fabric weight, and hem balance',
      related: [
        { title: 'Shirts', href: '/patterns/patterns-shirts' },
        { title: 'Vests', href: '/patterns/patterns-vests' },
        { title: 'Pants', href: '/patterns/patterns-pants' }
      ],
      useCases: [
        { title: 'Structured garment review', body: 'Inspect jacket and coat construction details that are harder to judge from flat pattern listings.' },
        { title: 'Seasonal line planning', body: 'Compare silhouettes for coat, blazer, trench, and jacket concepts before choosing a sample path.' },
        { title: 'Technical handoff', body: 'Export visuals that make closure, collar, sleeve, and layering decisions easier to discuss.' }
      ]
    })
  },
  {
    slug: 'patterns-women-shirts',
    resourceType: 'patterns',
    content: patternLandingContent({
      name: 'Women Shirt',
      focus: 'blouse and woven top development, collar review, sleeve fit, and digital sample handoff',
      review: 'collar stand, button placket, cuff shape, yoke position, sleeve cap balance, and hem shape',
      related: [
        { title: 'Shirts', href: '/patterns/patterns-shirts' },
        { title: 'Women Dresses', href: '/patterns/patterns-women-dresses' },
        { title: 'Skirts', href: '/patterns/patterns-skirts' }
      ],
      useCases: [
        { title: 'Blouse silhouette comparison', body: 'Use numbered Vol 2 samples to compare sleeve, collar, and body proportions quickly.' },
        { title: 'Woven fit review', body: 'Check yoke, placket, cuff, and armhole behavior before committing to a production sample.' },
        { title: 'Line sheet preparation', body: 'Create clearer digital references for women shirt concepts and style family planning.' }
      ]
    })
  },
  {
    slug: 'patterns-bags',
    resourceType: 'patterns',
    content: patternLandingContent({
      name: 'Bag',
      focus: '3D accessory visualization, product concept review, and styling presentation',
      review: 'strap length, body volume, seam placement, handle position, pocket layout, and hardware scale',
      related: [
        { title: 'Accessories', href: '/patterns/patterns-accessories' },
        { title: 'Outerwear', href: '/patterns/patterns-outerwear' },
        { title: 'Women Sets', href: '/patterns/patterns-women-sets' }
      ],
      useCases: [
        { title: 'Accessory proportion checks', body: 'Review bag body size, handle position, strap proportion, and seam detail in a 3D context.' },
        { title: 'Product concept presentation', body: 'Use preview-guided ZPRJ files to create references for accessory planning and merchandising.' },
        { title: 'Styling support', body: 'Pair accessory samples with garment mockups when building complete outfit presentations.' }
      ]
    })
  },
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
