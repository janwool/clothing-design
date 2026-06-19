const crypto = require('crypto');
require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const downloadsRoot = path.join(os.homedir(), 'Downloads');
const publicRoot = path.resolve(__dirname, '..', 'public');
const dbPath = path.resolve(__dirname, '..', 'database.sqlite');
const patternUploadDir = path.join(publicRoot, 'uploads', 'patterns');
const previewUploadDir = path.join(publicRoot, 'uploads', 'pattern-previews');
const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const minPreviewScore = 100;
const targetDb = (
  process.argv.find(arg => arg.startsWith('--db='))?.split('=')[1] ||
  process.env.PATTERN_IMPORT_DB ||
  'sqlite'
).toLowerCase();
const scanRootArgs = process.argv
  .slice(2)
  .filter(arg => !arg.startsWith('--db='))
  .flatMap(arg => {
    if (arg.startsWith('--root=')) return [arg.slice('--root='.length)];
    if (arg.startsWith('--')) return [];
    return [arg];
  });
const scanRoots = (scanRootArgs.length > 0 ? scanRootArgs : [downloadsRoot])
  .map(resolveRoot)
  .filter((root, index, roots) => roots.indexOf(root) === index);

const manualPreviewByRelativePath = new Map([
  [
    '145-女性背T桖套装/zprj/zprj/PROJECT.ZPrj',
    '145-女性背T桖套装/145-女性背T桖套装.jpg'
  ]
]);

const skipRelativePaths = new Set([
  // This root-level file has no matching preview beside it and duplicates the
  // 6588/1 ZPRJ byte size, so importing it would create a low-confidence card.
  '1780408567264-260105648.zprj'
]);

const categoryDefinitions = [
  {
    name: 'T-Shirts',
    slug: 'patterns-t-shirts',
    sort_order: 10,
    description: 'Downloadable ZPRJ T-shirt sewing patterns for CLO 3D, Marvelous Designer, virtual apparel sampling, and ecommerce mockup workflows.',
    meta_title: 'CLO 3D T-Shirt ZPRJ Sewing Patterns',
    meta_description: 'Browse T-shirt ZPRJ sewing patterns with preview images for CLO 3D and Marvelous Designer garment simulation.'
  },
  {
    name: 'Shirts',
    slug: 'patterns-shirts',
    sort_order: 20,
    description: 'Button shirt and menswear ZPRJ sewing patterns for digital apparel development, fit review, and 3D clothing production.',
    meta_title: 'Shirt ZPRJ Sewing Patterns for CLO 3D',
    meta_description: 'Download shirt and menswear ZPRJ patterns for CLO 3D, Marvelous Designer, and virtual fashion workflows.'
  },
  {
    name: 'Hoodies',
    slug: 'patterns-hoodies',
    sort_order: 25,
    description: 'Hoodie and sweatshirt ZPRJ patterns for casual apparel mockups, 3D garment simulation, and digital sample review.',
    meta_title: 'Hoodie ZPRJ Sewing Patterns for CLO 3D',
    meta_description: 'Download hoodie and sweatshirt ZPRJ patterns for CLO 3D and Marvelous Designer virtual apparel workflows.'
  },
  {
    name: 'Women Shirts',
    slug: 'patterns-women-shirts',
    sort_order: 30,
    description: 'Women shirt and blouse ZPRJ patterns with preview-guided SEO descriptions for digital fashion sampling and garment simulation.',
    meta_title: 'Women Shirt ZPRJ Patterns for CLO 3D',
    meta_description: 'Explore women shirt and blouse ZPRJ sewing patterns for CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Women Sets',
    slug: 'patterns-women-sets',
    sort_order: 40,
    description: 'Women outfit and set ZPRJ patterns for coordinated virtual samples, fitting, and product visualization.',
    meta_title: 'Women Outfit ZPRJ Sewing Patterns',
    meta_description: 'Download women set and outfit ZPRJ patterns for CLO 3D and Marvelous Designer design workflows.'
  },
  {
    name: 'Women Dresses',
    slug: 'patterns-women-dresses',
    sort_order: 45,
    description: 'Dress and one-piece garment ZPRJ patterns for fashion visualization, fit review, and digital apparel sampling.',
    meta_title: 'Dress ZPRJ Sewing Patterns for CLO 3D',
    meta_description: 'Browse dress and one-piece ZPRJ sewing patterns for CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Skirts',
    slug: 'patterns-skirts',
    sort_order: 50,
    description: 'Skirt ZPRJ sewing patterns for draping studies, fashion sampling, and Marvelous Designer garment simulation.',
    meta_title: 'Skirt ZPRJ Sewing Patterns',
    meta_description: 'Preview and download skirt ZPRJ sewing patterns for CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Pants',
    slug: 'patterns-pants',
    sort_order: 55,
    description: 'Pants and trouser ZPRJ patterns for fit testing, digital apparel sampling, and virtual product mockups.',
    meta_title: 'Pants ZPRJ Sewing Patterns for CLO 3D',
    meta_description: 'Download pants and trouser ZPRJ sewing patterns for CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Vests',
    slug: 'patterns-vests',
    sort_order: 56,
    description: 'Vest and sleeveless garment ZPRJ patterns for layered outfit sampling and 3D fashion prototyping.',
    meta_title: 'Vest ZPRJ Sewing Patterns',
    meta_description: 'Preview and download vest ZPRJ sewing patterns for CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Outerwear',
    slug: 'patterns-outerwear',
    sort_order: 60,
    description: 'Coat, jacket, and outerwear ZPRJ patterns for structured digital garment development and seasonal apparel previews.',
    meta_title: 'Outerwear ZPRJ Patterns for CLO 3D',
    meta_description: 'Download coat and jacket ZPRJ patterns for CLO 3D, Marvelous Designer, and virtual apparel prototyping.'
  },
  {
    name: 'Bags',
    slug: 'patterns-bags',
    sort_order: 65,
    description: 'Bag, backpack, and pouch ZPRJ project files for accessory visualization and 3D fashion product sampling.',
    meta_title: 'Bag ZPRJ Patterns for 3D Accessory Design',
    meta_description: 'Download bag, backpack, and pouch ZPRJ patterns for CLO 3D and Marvelous Designer accessory workflows.'
  },
  {
    name: 'Sportswear',
    slug: 'patterns-sportswear',
    sort_order: 70,
    description: 'Sportswear ZPRJ patterns including soccer kits and active apparel for teamwear visualization and garment simulation.',
    meta_title: 'Sportswear ZPRJ Patterns for Teamwear Design',
    meta_description: 'Browse sportswear and soccer outfit ZPRJ sewing patterns for CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Protective Clothing',
    slug: 'patterns-protective-clothing',
    sort_order: 80,
    description: 'Protective garment ZPRJ patterns for coverall visualization, technical apparel review, and digital sample workflows.',
    meta_title: 'Protective Clothing ZPRJ Sewing Patterns',
    meta_description: 'Download protective coverall ZPRJ patterns for CLO 3D and Marvelous Designer simulation.'
  },
  {
    name: 'Underwear',
    slug: 'patterns-underwear',
    sort_order: 85,
    description: 'Underwear ZPRJ garment patterns for close-fit apparel simulation, material review, and virtual sample development.',
    meta_title: 'Underwear ZPRJ Sewing Patterns',
    meta_description: 'Browse underwear ZPRJ sewing patterns for CLO 3D and Marvelous Designer garment simulation.'
  },
  {
    name: 'Digital Costumes',
    slug: 'patterns-digital-costumes',
    sort_order: 90,
    description: 'Character costume and stylized fashion ZPRJ patterns for digital fashion, cosplay concepts, and virtual fitting.',
    meta_title: 'Digital Costume ZPRJ Sewing Patterns',
    meta_description: 'Browse stylized costume ZPRJ sewing patterns for CLO 3D, Marvelous Designer, and digital fashion design.'
  },
  {
    name: 'Avatar Fit Samples',
    slug: 'patterns-avatar-fit-samples',
    sort_order: 100,
    description: 'Avatar fit and matching ZPRJ garment samples for validating scale, proportion, and simulation setup.',
    meta_title: 'Avatar Fit Sample ZPRJ Patterns',
    meta_description: 'Use avatar fit sample ZPRJ patterns to test garment matching in CLO 3D and Marvelous Designer.'
  },
  {
    name: 'Accessories',
    slug: 'patterns-accessories',
    sort_order: 110,
    description: 'Hat, glove, tie, and small accessory ZPRJ files for fashion styling, product visualization, and 3D sample workflows.',
    meta_title: 'Accessory ZPRJ Patterns for CLO 3D',
    meta_description: 'Download hat, glove, tie, and accessory ZPRJ patterns for CLO 3D and Marvelous Designer.'
  }
];

function walk(dir, predicate, output = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return output;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, output);
    } else if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function resolveRoot(rootValue) {
  const expanded = String(rootValue || '').replace(/^~(?=$|\/)/, os.homedir());
  return path.resolve(expanded);
}

function toSlash(filePath) {
  return filePath.split(path.sep).join('/');
}

function findScanRoot(filePath) {
  const absolutePath = path.resolve(filePath);
  return scanRoots
    .slice()
    .sort((a, b) => b.length - a.length)
    .find(root => absolutePath === root || absolutePath.startsWith(root + path.sep)) || scanRoots[0];
}

function relativeToImportRoot(filePath) {
  const root = findScanRoot(filePath);
  const relativePath = toSlash(path.relative(root, filePath));
  if (root === downloadsRoot) {
    return relativePath;
  }
  return `${path.basename(root)}/${relativePath}`;
}

function isInSameScanRoot(aPath, bPath) {
  return findScanRoot(aPath) === findScanRoot(bPath);
}

function isPatternSheetImage(imagePath) {
  return /^(pattern|texture|uv|attach|attach\d*|normal|roughness|opacity|diffuse|metallic|displacement|basecolor|ambient|ao)([-_.\s]|$)/i
    .test(path.basename(imagePath));
}

function folderNumber(folderName) {
  const match = String(folderName || '').match(/(\d+)$/);
  return match ? String(Number(match[1])).padStart(2, '0') : '';
}

function collectionLabel(relativePath) {
  if (relativePath.startsWith('3D模型2/')) return 'Collection 2';
  if (relativePath.startsWith('3D模型/')) return 'Collection 1';
  return '';
}

function normalizeComparable(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[\s_+()-]+/g, '')
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
}

function commonPrefixLength(a, b) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function scorePreview(zprjPath, imagePath) {
  const zprjDir = path.dirname(zprjPath);
  const imageDir = path.dirname(imagePath);
  const zprjStem = normalizeComparable(path.basename(zprjPath));
  const imageStem = normalizeComparable(path.basename(imagePath));
  let score = 0;

  if (imageDir === zprjDir) score += 70;
  if (imageDir.startsWith(zprjDir + path.sep)) score += 40;
  if (zprjDir.startsWith(imageDir + path.sep)) score += 35;

  const zprjParts = zprjDir.split(path.sep);
  const imageParts = imageDir.split(path.sep);
  let sharedParts = 0;
  for (let index = 0; index < Math.min(zprjParts.length, imageParts.length); index += 1) {
    if (zprjParts[index] !== imageParts[index]) break;
    sharedParts += 1;
  }
  score += sharedParts * 2;

  if (imageStem === zprjStem) score += 100;
  if (zprjStem && imageStem.includes(zprjStem)) score += 60;
  if (imageStem && zprjStem.includes(imageStem)) score += 20;
  score += Math.min(commonPrefixLength(zprjStem, imageStem), 12) * 2;

  if (/preview|render|front|white|效果|预览/i.test(path.basename(imagePath))) {
    score += 60;
  }
  if (isPatternSheetImage(imagePath)) {
    score -= 90;
  }

  return score;
}

function findPreview(zprjPath, imagePaths) {
  const relativePath = relativeToImportRoot(zprjPath);
  const manualRelative = manualPreviewByRelativePath.get(relativePath);
  if (manualRelative) {
    const manualPath = path.join(downloadsRoot, manualRelative);
    if (fs.existsSync(manualPath)) {
      return { path: manualPath, score: 999, source: 'manual' };
    }
  }

  const candidates = imagePaths.filter(imagePath => isInSameScanRoot(zprjPath, imagePath));
  const sameDirImages = candidates.filter(imagePath => path.dirname(imagePath) === path.dirname(zprjPath));
  const preferredSameDir = sameDirImages
    .filter(imagePath => /^preview(?:-\d+)?\.[^.]+$/i.test(path.basename(imagePath)))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))[0];

  if (preferredSameDir) {
    return { path: preferredSameDir, score: 1000, source: 'same-dir-preview' };
  }

  const nonPatternSameDir = sameDirImages
    .filter(imagePath => !isPatternSheetImage(imagePath))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))[0];

  if (nonPatternSameDir) {
    return { path: nonPatternSameDir, score: 900, source: 'same-dir-image' };
  }

  const best = candidates
    .map(imagePath => ({ path: imagePath, score: scorePreview(zprjPath, imagePath), source: 'scored' }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < minPreviewScore) {
    return null;
  }
  return best;
}

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug.slice(0, 80);
}

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function hashForPath(filePath) {
  return crypto.createHash('sha1').update(relativeToImportRoot(filePath)).digest('hex').slice(0, 8);
}

function numberedMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? String(Number(match[1])).padStart(2, '0') : '';
}

function catalogTitle(baseTitle, folderName, relativePath) {
  const number = folderNumber(folderName);
  const collection = collectionLabel(relativePath);
  return [
    baseTitle,
    number,
    collection,
    'ZPRJ Sewing Pattern'
  ].filter(Boolean).join(' ');
}

function catalogMetadata({ category, garment, baseTitle, folderName, relativePath, visual, query }) {
  const number = folderNumber(folderName);
  const collection = collectionLabel(relativePath);
  return {
    category,
    garment,
    number,
    collection,
    title: catalogTitle(baseTitle, folderName, relativePath),
    visual,
    query
  };
}

function classifyPattern(zprjPath) {
  const relativePath = relativeToImportRoot(zprjPath);
  const lowerPath = relativePath.toLowerCase();
  const basename = path.basename(zprjPath, path.extname(zprjPath));
  const folderName = path.basename(path.dirname(zprjPath));

  if (lowerPath.includes('3d模型/') || lowerPath.includes('3d模型2/')) {
    if (/bao\d+|\/包\d+|背包|腰包|\/包1\//i.test(relativePath)) {
      const baseTitle = /背包/.test(relativePath)
        ? 'Backpack'
        : /腰包/.test(relativePath)
          ? 'Waist Bag'
          : 'Bag';
      const garment = /背包/.test(relativePath)
        ? 'backpack accessory'
        : /腰包/.test(relativePath)
          ? 'waist bag accessory'
          : 'bag accessory';
      return catalogMetadata({
        category: 'Bags',
        garment,
        baseTitle,
        folderName,
        relativePath,
        visual: `a ${garment} preview for 3D fashion accessory sampling and product mockup preparation`,
        query: `${garment} ZPRJ pattern for CLO 3D and Marvelous Designer`
      });
    }

    if (/帽子/.test(relativePath)) {
      return catalogMetadata({
        category: 'Accessories',
        garment: 'hat accessory',
        baseTitle: 'Hat',
        folderName,
        relativePath,
        visual: 'a hat accessory preview for styling, accessory rendering, and digital fashion presentation',
        query: 'hat accessory ZPRJ pattern for CLO 3D'
      });
    }

    if (/手套/.test(relativePath)) {
      return catalogMetadata({
        category: 'Accessories',
        garment: 'glove accessory',
        baseTitle: 'Glove',
        folderName,
        relativePath,
        visual: 'a glove accessory preview for close-up apparel styling and virtual product visualization',
        query: 'glove ZPRJ accessory pattern for Marvelous Designer'
      });
    }

    if (/领带/.test(relativePath)) {
      return catalogMetadata({
        category: 'Accessories',
        garment: 'tie accessory',
        baseTitle: 'Tie',
        folderName,
        relativePath,
        visual: 'a tie accessory preview for formalwear styling and 3D apparel presentation',
        query: 'tie ZPRJ accessory pattern for CLO 3D'
      });
    }

    if (/内衣/.test(relativePath)) {
      return catalogMetadata({
        category: 'Underwear',
        garment: 'underwear garment',
        baseTitle: 'Underwear',
        folderName,
        relativePath,
        visual: 'an underwear garment preview for close-fit apparel simulation and digital sample review',
        query: 'underwear ZPRJ sewing pattern for Marvelous Designer'
      });
    }

    if (/连衣裙/.test(relativePath)) {
      return catalogMetadata({
        category: 'Women Dresses',
        garment: 'dress',
        baseTitle: 'Dress',
        folderName,
        relativePath,
        visual: 'a dress garment preview for one-piece fashion sampling, fit review, and ecommerce mockups',
        query: 'dress ZPRJ sewing pattern for CLO 3D'
      });
    }

    if (/裙子/.test(relativePath)) {
      return catalogMetadata({
        category: 'Skirts',
        garment: 'skirt',
        baseTitle: 'Skirt',
        folderName,
        relativePath,
        visual: 'a skirt garment preview for silhouette exploration, drape review, and digital fashion sampling',
        query: 'skirt ZPRJ sewing pattern for Marvelous Designer'
      });
    }

    if (/裤子/.test(relativePath)) {
      return catalogMetadata({
        category: 'Pants',
        garment: 'pants',
        baseTitle: 'Pants',
        folderName,
        relativePath,
        visual: 'a pants garment preview for trouser fit testing, apparel mockups, and virtual sampling',
        query: 'pants ZPRJ sewing pattern for CLO 3D'
      });
    }

    if (/背心/.test(relativePath)) {
      return catalogMetadata({
        category: 'Vests',
        garment: 'vest',
        baseTitle: 'Vest',
        folderName,
        relativePath,
        visual: 'a vest garment preview for sleeveless layering, styling, and 3D apparel prototyping',
        query: 'vest ZPRJ sewing pattern for Marvelous Designer'
      });
    }

    if (/hoodie|卫衣|带毛卫衣/i.test(relativePath)) {
      return catalogMetadata({
        category: 'Hoodies',
        garment: 'hoodie',
        baseTitle: 'Hoodie',
        folderName,
        relativePath,
        visual: 'a hoodie or sweatshirt preview for casualwear mockups, hood construction review, and garment simulation',
        query: 'hoodie ZPRJ sewing pattern for CLO 3D'
      });
    }

    if (/t-?shirt|tshirt|t恤|上衣/i.test(relativePath)) {
      const isLayered = /外套tshirt/i.test(relativePath);
      return catalogMetadata({
        category: isLayered ? 'Outerwear' : 'T-Shirts',
        garment: isLayered ? 'layered T-shirt jacket' : 'top garment',
        baseTitle: isLayered ? 'Layered T-Shirt Jacket' : 'Top',
        folderName,
        relativePath,
        visual: isLayered
          ? 'a layered T-shirt and jacket preview for casual outerwear design and virtual fitting'
          : 'a top garment preview for everyday apparel sampling and 3D product mockups',
        query: isLayered
          ? 'layered T-shirt jacket ZPRJ pattern for CLO 3D'
          : 'top garment ZPRJ sewing pattern for Marvelous Designer'
      });
    }

    if (/衬衣|称衣|衬衫/.test(relativePath)) {
      return catalogMetadata({
        category: 'Shirts',
        garment: 'shirt',
        baseTitle: 'Shirt',
        folderName,
        relativePath,
        visual: 'a shirt garment preview for sleeve, collar, and fit review in a digital apparel workflow',
        query: 'shirt ZPRJ sewing pattern for CLO 3D'
      });
    }

    if (/blazer|西服|长西服|外衣|外套|大衣|夹克|皮衣|风衣|羽绒服|女士长风衣|jeff men/i.test(relativePath)) {
      let baseTitle = 'Outerwear';
      let garment = 'outerwear garment';
      if (/blazer|西服|长西服/i.test(relativePath)) {
        baseTitle = 'Blazer';
        garment = 'blazer jacket';
      } else if (/大衣/.test(relativePath)) {
        baseTitle = 'Coat';
        garment = 'coat';
      } else if (/夹克|皮衣|jeff men/i.test(relativePath)) {
        baseTitle = 'Jacket';
        garment = 'jacket';
      } else if (/风衣|女士长风衣/.test(relativePath)) {
        baseTitle = 'Trench Coat';
        garment = 'trench coat';
      } else if (/羽绒服/.test(relativePath)) {
        baseTitle = 'Puffer Jacket';
        garment = 'puffer jacket';
      }
      return catalogMetadata({
        category: 'Outerwear',
        garment,
        baseTitle,
        folderName,
        relativePath,
        visual: `a ${garment} preview for structured apparel sampling, layering, and 3D outerwear visualization`,
        query: `${garment} ZPRJ sewing pattern for CLO 3D`
      });
    }

    if (/布衣/.test(relativePath)) {
      return catalogMetadata({
        category: 'Shirts',
        garment: 'woven top',
        baseTitle: 'Woven Top',
        folderName,
        relativePath,
        visual: 'a woven top preview for everyday garment simulation and digital apparel sample review',
        query: 'woven top ZPRJ sewing pattern for Marvelous Designer'
      });
    }
  }

  if (lowerPath.includes('women shirts-vol2-p')) {
    const number = numberedMatch(lowerPath, /women shirts-vol2-p(\d+)/);
    return {
      category: 'Women Shirts',
      garment: 'women shirt',
      number,
      collection: 'Vol 2',
      title: `Women Shirt Vol 2 P${number} ZPRJ Sewing Pattern`,
      visual: 'a women shirt or blouse sample with a clean apparel preview for digital garment development',
      query: 'women shirt ZPRJ pattern for CLO 3D and Marvelous Designer'
    };
  }

  if (/6588\/\d+\//.test(lowerPath)) {
    const number = numberedMatch(lowerPath, /6588\/(\d+)\//);
    return {
      category: 'T-Shirts',
      garment: 'T-shirt',
      number,
      collection: 'T-shirt sample series',
      title: `T-Shirt ZPRJ Sewing Pattern ${number}`,
      visual: 'a T-shirt garment preview suitable for apparel mockups, fit testing, and virtual sampling',
      query: 'T-shirt ZPRJ sewing pattern for CLO 3D mockups'
    };
  }

  if (lowerPath.includes('足球') || lowerPath.includes('soccer outfit')) {
    const number = numberedMatch(lowerPath, /soccer outfit (\d+)/);
    return {
      category: 'Sportswear',
      garment: 'soccer outfit',
      title: `Soccer Outfit ZPRJ Sewing Pattern ${number}`,
      visual: 'a soccer uniform set with teamwear proportions for sports apparel visualization',
      query: 'soccer outfit ZPRJ pattern for teamwear design'
    };
  }

  if (lowerPath.includes('女装套装基础版型')) {
    const number = numberedMatch(lowerPath, /zprj\+fbx\+obj\/(\d+)\//);
    return {
      category: 'Women Sets',
      garment: 'women outfit set',
      title: `Women Outfit Basic Block ZPRJ Pattern ${number}`,
      visual: 'a coordinated women outfit block preview for reusable fit and style exploration',
      query: 'women outfit ZPRJ basic block for CLO 3D'
    };
  }

  if (lowerPath.includes('t恤裤子')) {
    return {
      category: 'T-Shirts',
      garment: 'T-shirt and pants set',
      title: 'Men T-Shirt and Pants ZPRJ Sewing Pattern',
      visual: 'a casual T-shirt and pants combination for menswear virtual sampling',
      query: 'men T-shirt pants ZPRJ pattern for Marvelous Designer'
    };
  }

  if (lowerPath.includes('衬衫')) {
    return {
      category: 'Shirts',
      garment: 'shirt',
      title: 'Men Shirt ZPRJ Sewing Pattern',
      visual: 'a structured shirt preview for menswear pattern review and fit simulation',
      query: 'men shirt ZPRJ sewing pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('womens-')) {
    const number = numberedMatch(lowerPath, /womens-(\d+)/);
    return {
      category: 'Women Sets',
      garment: 'modern womenswear outfit',
      title: `Modern Womenswear ZPRJ Pattern ${number}`,
      visual: 'a modern womenswear garment preview for outfit sampling and virtual fitting',
      query: 'womenswear ZPRJ pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('mens-1')) {
    return {
      category: 'Shirts',
      garment: 'modern menswear outfit',
      title: 'Modern Menswear ZPRJ Pattern 01',
      visual: 'a modern menswear garment preview for digital apparel development',
      query: 'modern menswear ZPRJ pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('mens-2')) {
    return {
      category: 'Shirts',
      garment: 'modern menswear outfit',
      title: 'Modern Menswear ZPRJ Pattern 02',
      visual: 'a modern menswear garment preview for fit review and 3D sampling',
      query: 'menswear ZPRJ pattern for Marvelous Designer'
    };
  }

  if (lowerPath.includes('2103 双面呢')) {
    return {
      category: 'Outerwear',
      garment: 'double-faced wool coat',
      title: 'Double-Faced Wool Coat ZPRJ Sewing Pattern',
      visual: 'a double-faced wool outerwear preview with a structured coat silhouette',
      query: 'double faced wool coat ZPRJ pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('防护服')) {
    return {
      category: 'Protective Clothing',
      garment: 'protective coverall',
      title: 'Protective Coverall ZPRJ Sewing Pattern',
      visual: 'a protective coverall garment preview for technical clothing simulation',
      query: 'protective coverall ZPRJ pattern for Marvelous Designer'
    };
  }

  if (lowerPath.includes('匹配')) {
    return {
      category: 'Avatar Fit Samples',
      garment: 'avatar fit sample garment',
      title: 'Avatar Fit Matching Garment ZPRJ Pattern',
      visual: 'a fit-matching garment preview used to check avatar scale, proportion, and simulation setup',
      query: 'avatar fit matching ZPRJ garment sample'
    };
  }

  if (lowerPath.includes('女性背t桖套装')) {
    return {
      category: 'Women Sets',
      garment: 'women T-shirt overall set',
      title: 'Women Back T-Shirt Overall Set ZPRJ Pattern',
      visual: 'a women set preview with a T-shirt and overall-style fashion silhouette',
      query: 'women T-shirt overall set ZPRJ pattern'
    };
  }

  if (lowerPath.includes('立体裁剪小裙子')) {
    return {
      category: 'Skirts',
      garment: 'draped mini skirt',
      title: 'Draped Mini Skirt ZPRJ Sewing Pattern',
      visual: 'a draped mini skirt preview for fashion sampling and skirt pattern development',
      query: 'mini skirt ZPRJ sewing pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('丝袜')) {
    return {
      category: 'Digital Costumes',
      garment: 'stocking costume outfit',
      title: 'Stocking Outfit ZPRJ Costume Pattern',
      visual: 'a stylized stocking outfit preview for digital costume and virtual fashion workflows',
      query: 'stocking outfit ZPRJ costume pattern'
    };
  }

  if (lowerPath.includes('碧蓝航线急速之鹤')) {
    return {
      category: 'Digital Costumes',
      garment: 'stylized character costume',
      title: 'Azur Lane Speedy Crane Costume ZPRJ Pattern',
      visual: 'a stylized character costume preview for cosplay-inspired digital fashion design',
      query: 'character costume ZPRJ pattern for Marvelous Designer'
    };
  }

  if (lowerPath.includes('艾米莉亚')) {
    return {
      category: 'Digital Costumes',
      garment: 'Emilia costume',
      title: 'Emilia Digital Costume ZPRJ Pattern',
      visual: 'a character costume preview with a fantasy fashion silhouette for virtual fitting',
      query: 'Emilia costume ZPRJ pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('莫斯提马')) {
    return {
      category: 'Digital Costumes',
      garment: 'Mostima costume',
      title: 'Mostima Digital Costume ZPRJ Pattern',
      visual: 'a stylized character outfit preview for costume visualization and digital fashion',
      query: 'Mostima costume ZPRJ pattern'
    };
  }

  if (lowerPath.includes('清流')) {
    return {
      category: 'Digital Costumes',
      garment: 'Qingliu costume',
      title: 'Qingliu Digital Costume ZPRJ Pattern',
      visual: 'a stylized outfit preview for character fashion, costume development, and 3D simulation',
      query: 'Qingliu costume ZPRJ pattern'
    };
  }

  if (lowerPath.includes('煌_by') || lowerPath.includes('/煌.')) {
    return {
      category: 'Digital Costumes',
      garment: 'Huang costume',
      title: 'Huang Digital Costume ZPRJ Pattern',
      visual: 'a stylized costume preview for digital fashion sampling and cosplay-style garment work',
      query: 'Huang costume ZPRJ pattern'
    };
  }

  if (lowerPath.includes('jeff men basic')) {
    return {
      category: 'Outerwear',
      garment: 'men basic outfit',
      title: 'Jeff Men Basic Outfit ZPRJ Pattern',
      visual: 'a men basic outfit preview for jacket, top, and apparel fit visualization',
      query: 'men basic outfit ZPRJ pattern for CLO 3D'
    };
  }

  if (lowerPath.includes('women basic9')) {
    return {
      category: 'Women Sets',
      garment: 'women basic outfit',
      title: 'Women Basic Outfit ZPRJ Pattern 86',
      visual: 'a women basic garment preview for reusable fit and digital sample development',
      query: 'women basic outfit ZPRJ pattern for Marvelous Designer'
    };
  }

  if (lowerPath.includes('/111.zprj')) {
    return {
      category: 'Digital Costumes',
      garment: 'women fashion costume',
      title: 'Women Fashion Look 111 ZPRJ Pattern',
      visual: 'a women fashion look preview for costume, silhouette, and digital apparel exploration',
      query: 'women fashion costume ZPRJ pattern'
    };
  }

  const readableName = titleCase(slugify(basename) || basename || 'Sew Pattern');
  return {
    category: 'Women Sets',
    garment: 'apparel garment',
    title: `${readableName} ZPRJ Sewing Pattern`,
    visual: 'an apparel preview for CLO 3D and Marvelous Designer garment simulation',
    query: `${readableName} ZPRJ sewing pattern`
  };
}

function patternDescriptionGuide(metadata) {
  const category = String(metadata.category || '').toLowerCase();
  if (/t-?shirts?/.test(category)) {
    return {
      focus: 'neckline shape, sleeve balance, hem level, side seam position, and print scale',
      workflow: 'jersey top mockups, merch concepts, ecommerce previews, and fast fit comparisons'
    };
  }
  if (/hood/.test(category)) {
    return {
      focus: 'hood volume, cuff tension, pocket placement, rib trim, and relaxed shoulder drape',
      workflow: 'streetwear sampling, casualwear colorways, and branded sweatshirt presentations'
    };
  }
  if (/outerwear|coat|jacket/.test(category)) {
    return {
      focus: 'collar roll, sleeve pitch, closure placement, layer clearance, and fabric weight',
      workflow: 'seasonal outerwear sampling, buyer previews, and structured garment handoff'
    };
  }
  if (/women shirts?|shirts?/.test(category)) {
    return {
      focus: 'collar stand, placket shape, cuff construction, yoke placement, and sleeve cap balance',
      workflow: 'woven top development, blouse fit review, and production-ready shirt references'
    };
  }
  if (/dress/.test(category)) {
    return {
      focus: 'bodice balance, waist placement, skirt volume, hem sweep, and fabric fall',
      workflow: 'one-piece silhouette review, fashion line planning, and digital dress sample iteration'
    };
  }
  if (/skirt/.test(category)) {
    return {
      focus: 'waistband fit, side seam balance, flare, pleat behavior, and hem level',
      workflow: 'skirt silhouette studies, drape review, and range planning'
    };
  }
  if (/pants/.test(category)) {
    return {
      focus: 'rise, waistband fit, crotch curve, leg opening, pocket placement, and fabric tension',
      workflow: 'trouser fit checks, technical review, and product page draft visuals'
    };
  }
  if (/bags?|accessor/.test(category)) {
    return {
      focus: 'strap length, body volume, seam placement, handle position, and hardware scale',
      workflow: 'accessory visualization, product concept review, and styling presentation'
    };
  }
  return {
    focus: 'pattern piece balance, sewing relationships, avatar scale, fabric settings, and garment drape',
    workflow: 'digital fashion prototyping, garment simulation, fit review, and 3D apparel handoff'
  };
}

function buildDescription(metadata) {
  const guide = patternDescriptionGuide(metadata);
  const seriesNote = [metadata.collection, metadata.number ? `sample ${metadata.number}` : '']
    .filter(Boolean)
    .join(' ');
  const comparisonNote = seriesNote
    ? ` This ${seriesNote} file is useful when comparing nearby silhouettes in the same pattern group.`
    : '';

  return [
    `${metadata.title} is a preview-guided .zprj sewing pattern for CLO 3D and Marvelous Designer. The preview image shows ${metadata.visual}, so designers can judge the garment direction before opening the project file.${comparisonNote}`,
    `Use this ${metadata.garment} pattern for ${guide.workflow}. During review, pay close attention to ${guide.focus}.`,
    `The package is organized for a practical virtual clothing workflow: open the ZPRJ file, inspect the 2D pattern pieces and sewing relationships, adjust fabric or colorways, simulate on the target avatar, and export renders or technical references for the next design step. It supports search needs such as "${metadata.query}", "download CLO 3D ZPRJ pattern", and "Marvelous Designer sewing pattern project file".`
  ].join('\n\n');
}

function buildTags(metadata) {
  return Array.from(new Set([
    'ZPRJ',
    'CLO 3D',
    'Marvelous Designer',
    'sewing pattern',
    '3D apparel',
    'garment simulation',
    'digital fashion',
    metadata.category,
    metadata.garment,
    'virtual sample'
  ])).join(', ');
}

function buildAssetName(metadata, sourcePath, extension) {
  const base = slugify(metadata.title) || 'pattern';
  return `${base}-${hashForPath(sourcePath)}${extension.toLowerCase()}`;
}

function openDb() {
  return new sqlite3.Database(dbPath);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close(err => (err ? reject(err) : resolve()));
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(label, operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const message = String(err && err.message ? err.message : err);
      const retryable = /fetch failed|ECONNRESET|ETIMEDOUT|EPIPE|network|timeout/i.test(message);
      if (!retryable || attempt === attempts) {
        throw err;
      }
      await sleep(750 * attempt);
    }
  }
  throw lastError;
}

function createDbAdapter() {
  if (targetDb === 'd1') {
    process.env.DB_TYPE = 'd1';
    const d1Db = require('../lib/db');
    return {
      name: 'd1',
      supportsTransaction: false,
      run: (sql, params = []) => withRetry('d1 run', () => d1Db.run(sql, params)),
      get: (sql, params = []) => withRetry('d1 get', () => d1Db.get(sql, params)),
      all: (sql, params = []) => withRetry('d1 all', () => d1Db.all(sql, params)),
      close: async () => {}
    };
  }

  if (targetDb !== 'sqlite') {
    throw new Error(`Unsupported database target "${targetDb}". Use --db=sqlite or --db=d1.`);
  }

  const sqlite = openDb();
  return {
    name: 'sqlite',
    supportsTransaction: true,
    run: (sql, params = []) => run(sqlite, sql, params),
    get: (sql, params = []) => get(sqlite, sql, params),
    all: (sql, params = []) => all(sqlite, sql, params),
    close: () => closeDb(sqlite)
  };
}

async function ensureSchema(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    resource_type TEXT NOT NULL,
    description TEXT,
    meta_title TEXT,
    meta_description TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run('ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});

  await db.run(`CREATE TABLE IF NOT EXISTS patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    tags TEXT,
    image_url TEXT,
    file_url TEXT,
    format TEXT DEFAULT 'zprj',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function ensureDirectories() {
  await fsp.mkdir(patternUploadDir, { recursive: true });
  await fsp.mkdir(previewUploadDir, { recursive: true });
}

async function upsertCategory(db, category) {
  const existingByName = await db.get(
    'SELECT id FROM categories WHERE name = ? AND resource_type = ?',
    [category.name, 'patterns']
  );
  const existingBySlug = await db.get(
    'SELECT id, resource_type FROM categories WHERE slug = ?',
    [category.slug]
  );
  const slug = existingBySlug && existingBySlug.resource_type !== 'patterns'
    ? `patterns-${category.slug}`
    : category.slug;

  const params = [
    category.name,
    slug,
    'patterns',
    category.description,
    category.meta_title,
    category.meta_description,
    category.sort_order,
    'active'
  ];

  if (existingByName) {
    await db.run(
      `UPDATE categories
       SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existingByName.id]
    );
    return;
  }

  await db.run(
    `INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, sort_order, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
}

async function copyAsset(sourcePath, targetDir, targetName) {
  const targetPath = path.join(targetDir, targetName);
  const [sourceStat, targetStat] = await Promise.all([
    fsp.stat(sourcePath),
    fsp.stat(targetPath).catch(() => null)
  ]);
  if (targetStat && targetStat.size === sourceStat.size) {
    return `/uploads/${path.basename(targetDir)}/${targetName}`;
  }
  await fsp.copyFile(sourcePath, targetPath);
  return `/uploads/${path.basename(targetDir)}/${targetName}`;
}

async function unlinkUploadedAsset(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;

  const absolutePath = path.resolve(publicRoot, publicUrl.replace(/^\//, ''));
  if (!absolutePath.startsWith(publicRoot + path.sep)) return;

  await fsp.unlink(absolutePath).catch(() => {});
}

async function upsertPattern(db, item) {
  const existing = await db.get(
    'SELECT id, file_url, image_url FROM patterns WHERE file_url = ? OR file_url LIKE ?',
    [item.file_url, `%-${item.source_hash}.zprj`]
  );
  const params = [
    item.name,
    item.category,
    item.description,
    item.tags,
    item.image_url,
    item.file_url,
    'zprj',
    'active'
  ];

  if (existing) {
    if (existing.file_url && existing.file_url !== item.file_url) {
      await unlinkUploadedAsset(existing.file_url);
    }
    if (existing.image_url && existing.image_url !== item.image_url) {
      await unlinkUploadedAsset(existing.image_url);
    }

    await db.run(
      `UPDATE patterns
       SET name = ?, category = ?, description = ?, tags = ?, image_url = ?, file_url = ?, format = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...params, existing.id]
    );
    return 'updated';
  }

  await db.run(
    `INSERT INTO patterns (name, category, description, tags, image_url, file_url, format, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return 'inserted';
}

async function main() {
  const missingRoots = scanRoots.filter(root => !fs.existsSync(root));
  if (missingRoots.length > 0) {
    throw new Error(`Scan directory not found: ${missingRoots.join(', ')}`);
  }

  const zprjPaths = scanRoots
    .flatMap(root => walk(root, filePath => filePath.toLowerCase().endsWith('.zprj')))
    .sort();
  const imagePaths = scanRoots
    .flatMap(root => walk(root, filePath => imageExts.has(path.extname(filePath).toLowerCase())));
  const db = createDbAdapter();
  const report = {
    scanned: zprjPaths.length,
    inserted: 0,
    updated: 0,
    skipped: []
  };

  try {
    await ensureSchema(db);
    await ensureDirectories();
    if (db.supportsTransaction) {
      await db.run('BEGIN TRANSACTION');
    }

    for (const category of categoryDefinitions) {
      await upsertCategory(db, category);
    }

    for (const zprjPath of zprjPaths) {
      const relativePath = relativeToImportRoot(zprjPath);
      if (skipRelativePaths.has(relativePath)) {
        report.skipped.push({ file: relativePath, reason: 'No reliable preview image; appears to duplicate an imported source.' });
        continue;
      }

      const preview = findPreview(zprjPath, imagePaths);
      if (!preview) {
        report.skipped.push({ file: relativePath, reason: 'No preview image above confidence threshold.' });
        continue;
      }

      const metadata = classifyPattern(zprjPath);
      const patternFileName = buildAssetName(metadata, zprjPath, '.zprj');
      const previewFileName = buildAssetName(metadata, preview.path, path.extname(preview.path));
      const fileUrl = await copyAsset(zprjPath, patternUploadDir, patternFileName);
      const imageUrl = await copyAsset(preview.path, previewUploadDir, previewFileName);
      const result = await upsertPattern(db, {
        name: metadata.title,
        category: metadata.category,
        description: buildDescription(metadata),
        tags: buildTags(metadata),
        image_url: imageUrl,
        file_url: fileUrl,
        source_hash: hashForPath(zprjPath)
      });

      report[result] += 1;
    }

    if (db.supportsTransaction) {
      await db.run('COMMIT');
    }

    const categoryCounts = await db.all(
      'SELECT category, COUNT(*) AS count FROM patterns GROUP BY category ORDER BY count DESC, category ASC'
    );

    console.log(`Database target: ${db.name}`);
    console.log(`Scan roots: ${scanRoots.map(root => path.relative(os.homedir(), root) || root).join(', ')}`);
    console.log(`Scanned ${report.scanned} .zprj files`);
    console.log(`Inserted ${report.inserted}, updated ${report.updated}, skipped ${report.skipped.length}`);
    if (report.skipped.length) {
      console.log('Skipped files:');
      for (const item of report.skipped) {
        console.log(`- ${item.file}: ${item.reason}`);
      }
    }
    console.log('Pattern counts by category:');
    for (const row of categoryCounts) {
      console.log(`- ${row.category}: ${row.count}`);
    }
  } catch (err) {
    if (db.supportsTransaction) {
      await db.run('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    await db.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
