require('dotenv').config();

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

const db = require('../lib/db');

const dryRun = process.argv.includes('--dry-run');

function inferSeries(name) {
  const source = String(name || '');
  const collectionNumberMatch = source.match(/\b0?(\d{1,3})\s+Collection\s+([12])\b/i);
  const pMatch = source.match(/\bP0?(\d{1,3})\b/i);
  const namedSampleMatch = source.match(/\b(?:Pattern|Look|Sample)\s+0?(\d{1,3})\b/i);
  const number = collectionNumberMatch
    ? collectionNumberMatch[1].padStart(2, '0')
    : (pMatch ? pMatch[1].padStart(2, '0') : (namedSampleMatch ? namedSampleMatch[1].padStart(2, '0') : ''));
  const collection = collectionNumberMatch
    ? `Collection ${collectionNumberMatch[2]}`
    : (/vol(?:ume)?\s*2/i.test(source)
    ? 'Vol 2'
    : (/t-shirt zprj sewing pattern/i.test(source) ? 'T-shirt sample series' : ''));
  return [collection, number ? `sample ${number}` : ''].filter(Boolean).join(' ');
}

function categoryGuide(category) {
  const normalized = String(category || '').toLowerCase();
  if (/t-?shirts?/.test(normalized)) {
    return {
      garment: 'T-shirt',
      focus: 'jersey top mockups, print placement tests, ecommerce previews, and fast fit comparison',
      review: 'neckline shape, sleeve balance, hem level, side seam position, and graphic scale'
    };
  }
  if (/hood/.test(normalized)) {
    return {
      garment: 'hoodie',
      focus: 'casualwear sampling, sweatshirt colorway review, hood construction checks, and branded merch presentation',
      review: 'hood volume, cuff tension, pocket placement, rib trim, shoulder drape, and hem proportion'
    };
  }
  if (/outerwear|coat|jacket|blazer/.test(normalized)) {
    return {
      garment: 'outerwear garment',
      focus: 'structured jacket, coat, blazer, and seasonal layer development',
      review: 'collar roll, sleeve pitch, closure placement, layer clearance, fabric weight, and hem balance'
    };
  }
  if (/women shirts?|shirts?/.test(normalized)) {
    return {
      garment: normalized.includes('women') ? 'women shirt' : 'shirt',
      focus: 'blouse and woven top development, collar review, sleeve fit, and digital sample handoff',
      review: 'collar stand, button placket, cuff shape, yoke position, sleeve cap balance, and hem shape'
    };
  }
  if (/dress/.test(normalized)) {
    return {
      garment: 'dress',
      focus: 'one-piece silhouette review, drape testing, and digital dress sample development',
      review: 'bodice balance, waist placement, skirt volume, hem sweep, and fabric fall'
    };
  }
  if (/skirt/.test(normalized)) {
    return {
      garment: 'skirt',
      focus: 'skirt silhouette studies, drape review, and range planning',
      review: 'waistband fit, side seam balance, flare, pleat behavior, and hem level'
    };
  }
  if (/pants/.test(normalized)) {
    return {
      garment: 'pants',
      focus: 'trouser fit checks, technical review, and product page draft visuals',
      review: 'rise, waistband fit, crotch curve, leg opening, pocket placement, and fabric tension'
    };
  }
  if (/bags?|accessor/.test(normalized)) {
    return {
      garment: normalized.includes('bag') ? 'bag accessory' : 'fashion accessory',
      focus: '3D accessory visualization, product concept review, and styling presentation',
      review: 'strap length, body volume, seam placement, handle position, pocket layout, and hardware scale'
    };
  }
  if (/underwear/.test(normalized)) {
    return {
      garment: 'underwear garment',
      focus: 'close-fit garment simulation, stretch material review, and intimate apparel sampling',
      review: 'elastic placement, seam tension, leg opening, waistband behavior, and fit pressure'
    };
  }
  if (/sportswear/.test(normalized)) {
    return {
      garment: 'sportswear garment',
      focus: 'teamwear visualization, active apparel simulation, and movement-ready sample review',
      review: 'panel placement, sleeve mobility, neckline comfort, graphic zones, and fabric stretch'
    };
  }
  return {
    garment: 'apparel garment',
    focus: 'digital fashion prototyping, garment simulation, fit review, and 3D apparel handoff',
    review: 'pattern piece balance, sewing relationships, avatar scale, fabric settings, and garment drape'
  };
}

function buildDescription(pattern) {
  const guide = categoryGuide(pattern.category);
  const series = inferSeries(pattern.name);
  const seriesSentence = series
    ? ` This ${series} file is useful for comparing nearby silhouettes in the same pattern group.`
    : '';
  const previewSentence = pattern.image_url
    ? ' The preview image helps you judge the garment direction before opening desktop 3D software.'
    : ' Use the project file as the primary source when preview imagery is not available.';

  return [
    `${pattern.name} is a preview-guided .zprj ${guide.garment} pattern for CLO 3D and Marvelous Designer.${previewSentence}${seriesSentence}`,
    `Use this file for ${guide.focus}. During review, pay close attention to ${guide.review}.`,
    'Open the ZPRJ project, inspect the 2D pattern pieces and sewing relationships, adjust fabric or colorways, simulate on the target avatar, and export renders or technical references for the next design step.'
  ].join('\n\n');
}

async function refreshDescriptions() {
  const rows = await db.all("SELECT id, name, category, image_url FROM patterns WHERE status = 'active' ORDER BY id");
  let updated = 0;

  for (const row of rows) {
    const description = buildDescription(row);
    updated += 1;
    if (!dryRun) {
      await db.run(
        'UPDATE patterns SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [description, row.id]
      );
    }
  }

  console.log(`${dryRun ? 'Would refresh' : 'Refreshed'} ${updated} active pattern descriptions.`);
}

refreshDescriptions()
  .then(() => {
    if (typeof db.close === 'function') db.close();
  })
  .catch(err => {
    console.error(err);
    if (typeof db.close === 'function') db.close();
    process.exit(1);
  });
