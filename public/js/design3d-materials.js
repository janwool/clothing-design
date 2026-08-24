(function initDesign3DMaterials(global) {
  const rawMaterials = [
    {
      id: 'cotton-jersey',
      name: 'Cotton Jersey',
      family: 'Knit',
      color: '#f4f1ea',
      roughness: 0.86,
      metalness: 0,
      sheen: 0.28,
      weave: 'fine horizontal knit',
      sphere:
        'radial-gradient(circle at 32% 24%, rgba(255,255,255,.96), rgba(255,255,255,.3) 18%, transparent 36%), repeating-linear-gradient(0deg, rgba(39,37,32,.10) 0 1px, transparent 1px 5px), repeating-linear-gradient(90deg, rgba(39,37,32,.05) 0 1px, transparent 1px 9px), #f4f1ea'
    },
    {
      id: 'rib-knit',
      name: 'Rib Knit',
      family: 'Knit',
      color: '#ece7dc',
      roughness: 0.88,
      metalness: 0,
      sheen: 0.22,
      weave: 'raised rib channels',
      sphere:
        'radial-gradient(circle at 31% 23%, rgba(255,255,255,.95), rgba(255,255,255,.25) 20%, transparent 38%), repeating-linear-gradient(90deg, rgba(45,42,35,.18) 0 3px, rgba(255,255,255,.18) 3px 7px, transparent 7px 12px), #ece7dc'
    },
    {
      id: 'french-terry',
      name: 'French Terry',
      family: 'Knit',
      color: '#d7d0c4',
      roughness: 0.91,
      metalness: 0,
      sheen: 0.18,
      weave: 'soft looped cotton',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.9), transparent 34%), radial-gradient(circle at 62% 72%, rgba(70,63,53,.12), transparent 28%), repeating-radial-gradient(circle at 45% 48%, rgba(55,49,42,.10) 0 1px, transparent 1px 5px), #d7d0c4'
    },
    {
      id: 'fleece',
      name: 'Fleece',
      family: 'Warm',
      color: '#efe9df',
      roughness: 0.96,
      metalness: 0,
      sheen: 0.12,
      weave: 'brushed pile',
      sphere:
        'radial-gradient(circle at 32% 23%, rgba(255,255,255,.92), transparent 32%), radial-gradient(circle at 58% 70%, rgba(80,72,63,.12), transparent 30%), repeating-radial-gradient(circle at 50% 50%, rgba(45,40,36,.12) 0 1px, transparent 1px 4px), #efe9df'
    },
    {
      id: 'poplin',
      name: 'Poplin',
      family: 'Woven',
      color: '#f7f3ea',
      roughness: 0.74,
      metalness: 0,
      sheen: 0.18,
      weave: 'crisp plain weave',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.98), transparent 34%), repeating-linear-gradient(0deg, rgba(36,34,30,.08) 0 1px, transparent 1px 7px), repeating-linear-gradient(90deg, rgba(36,34,30,.07) 0 1px, transparent 1px 7px), #f7f3ea'
    },
    {
      id: 'oxford-cloth',
      name: 'Oxford Cloth',
      family: 'Woven',
      color: '#dfe8ee',
      roughness: 0.82,
      metalness: 0,
      sheen: 0.16,
      weave: 'basket weave',
      sphere:
        'radial-gradient(circle at 30% 23%, rgba(255,255,255,.92), transparent 34%), repeating-linear-gradient(45deg, rgba(31,57,73,.14) 0 3px, transparent 3px 9px), repeating-linear-gradient(-45deg, rgba(31,57,73,.10) 0 3px, transparent 3px 9px), #dfe8ee'
    },
    {
      id: 'linen',
      name: 'Linen',
      family: 'Woven',
      color: '#e7ddc8',
      roughness: 0.93,
      metalness: 0,
      sheen: 0.1,
      weave: 'slub woven fiber',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.88), transparent 35%), repeating-linear-gradient(0deg, rgba(82,70,49,.14) 0 1px, transparent 1px 10px), repeating-linear-gradient(92deg, rgba(82,70,49,.10) 0 2px, transparent 2px 14px), #e7ddc8'
    },
    {
      id: 'denim',
      name: 'Denim',
      family: 'Twill',
      color: '#355d84',
      roughness: 0.78,
      metalness: 0,
      sheen: 0.08,
      weave: 'indigo twill',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.42), transparent 35%), repeating-linear-gradient(135deg, rgba(255,255,255,.16) 0 2px, transparent 2px 7px), repeating-linear-gradient(45deg, rgba(5,21,36,.22) 0 2px, transparent 2px 7px), #355d84'
    },
    {
      id: 'twill',
      name: 'Cotton Twill',
      family: 'Twill',
      color: '#b6aa92',
      roughness: 0.81,
      metalness: 0,
      sheen: 0.13,
      weave: 'diagonal utility weave',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.72), transparent 34%), repeating-linear-gradient(135deg, rgba(65,56,41,.18) 0 2px, transparent 2px 8px), #b6aa92'
    },
    {
      id: 'wool-blend',
      name: 'Wool Blend',
      family: 'Tailoring',
      color: '#5f625b',
      roughness: 0.9,
      metalness: 0,
      sheen: 0.2,
      weave: 'melange wool fiber',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.38), transparent 34%), repeating-linear-gradient(20deg, rgba(255,255,255,.08) 0 1px, transparent 1px 6px), repeating-linear-gradient(100deg, rgba(0,0,0,.12) 0 1px, transparent 1px 8px), #5f625b'
    },
    {
      id: 'nylon-ripstop',
      name: 'Nylon Ripstop',
      family: 'Technical',
      color: '#66727c',
      roughness: 0.46,
      metalness: 0,
      sheen: 0.42,
      weave: 'technical grid',
      sphere:
        'radial-gradient(circle at 28% 21%, rgba(255,255,255,.72), rgba(255,255,255,.16) 25%, transparent 42%), repeating-linear-gradient(0deg, rgba(255,255,255,.18) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 1px, transparent 1px 12px), #66727c'
    },
    {
      id: 'leather',
      name: 'Leather',
      family: 'Surface',
      color: '#2d2520',
      roughness: 0.38,
      metalness: 0,
      sheen: 0.58,
      weave: 'subtle grain',
      sphere:
        'radial-gradient(circle at 27% 21%, rgba(255,255,255,.72), rgba(255,255,255,.18) 20%, transparent 42%), radial-gradient(circle at 58% 72%, rgba(0,0,0,.34), transparent 32%), repeating-radial-gradient(circle at 45% 45%, rgba(255,255,255,.08) 0 1px, transparent 1px 7px), #2d2520'
    },
    {
      id: 'satin-silk',
      name: 'Satin Silk',
      family: 'Drape',
      color: '#ded3ca',
      roughness: 0.27,
      metalness: 0,
      sheen: 0.76,
      weave: 'smooth lustre',
      sphere:
        'radial-gradient(ellipse at 24% 18%, rgba(255,255,255,.96), rgba(255,255,255,.36) 20%, transparent 42%), linear-gradient(115deg, rgba(255,255,255,.26), transparent 34%, rgba(0,0,0,.16) 72%, rgba(255,255,255,.20)), #ded3ca'
    },
    {
      id: 'velvet',
      name: 'Velvet',
      family: 'Drape',
      color: '#3d2545',
      roughness: 0.88,
      metalness: 0,
      sheen: 0.64,
      weave: 'soft pile sheen',
      sphere:
        'radial-gradient(circle at 33% 24%, rgba(255,255,255,.42), transparent 32%), radial-gradient(circle at 58% 64%, rgba(255,255,255,.15), transparent 26%), radial-gradient(circle at 60% 78%, rgba(0,0,0,.3), transparent 34%), #3d2545'
    },
    {
      id: 'modal-stretch',
      name: 'Modal Stretch',
      family: 'Knit',
      color: '#ddd8d1',
      roughness: 0.68,
      metalness: 0,
      sheen: 0.36,
      weave: 'smooth stretch knit',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.94), transparent 35%), repeating-linear-gradient(90deg, rgba(60,54,48,.08) 0 1px, transparent 1px 8px), #ddd8d1'
    },
    {
      id: 'wool-felt',
      name: 'Wool Felt',
      family: 'Accessory',
      color: '#766d60',
      roughness: 0.97,
      metalness: 0,
      sheen: 0.08,
      weave: 'dense felted fiber',
      sphere:
        'radial-gradient(circle at 30% 22%, rgba(255,255,255,.35), transparent 34%), repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,.08) 0 1px, transparent 1px 4px), #766d60'
    }
  ];

  const surfaceTuning = {
    'cotton-jersey': { normalScale: 0.32, textureRepeat: 7, sheenRoughness: 0.82, specular: 0.42 },
    'rib-knit': { normalScale: 0.44, textureRepeat: 5.5, sheenRoughness: 0.78, specular: 0.4 },
    'french-terry': { normalScale: 0.4, textureRepeat: 6, sheenRoughness: 0.88, specular: 0.36 },
    fleece: { normalScale: 0.34, textureRepeat: 7, sheenRoughness: 0.94, specular: 0.3 },
    poplin: { normalScale: 0.24, textureRepeat: 8, sheenRoughness: 0.68, specular: 0.48 },
    'oxford-cloth': { normalScale: 0.34, textureRepeat: 7, sheenRoughness: 0.76, specular: 0.42 },
    linen: { normalScale: 0.38, textureRepeat: 6, sheenRoughness: 0.86, specular: 0.34 },
    denim: { normalScale: 0.34, textureRepeat: 6, sheenRoughness: 0.8, specular: 0.38 },
    twill: { normalScale: 0.32, textureRepeat: 7, sheenRoughness: 0.78, specular: 0.4 },
    'wool-blend': { normalScale: 0.32, textureRepeat: 6, sheenRoughness: 0.9, specular: 0.34 },
    'nylon-ripstop': { normalScale: 0.22, textureRepeat: 8, sheenRoughness: 0.44, specular: 0.62 },
    leather: { normalScale: 0.38, textureRepeat: 4, sheenRoughness: 0.42, specular: 0.72 },
    'satin-silk': { normalScale: 0.16, textureRepeat: 5, sheenRoughness: 0.22, specular: 0.86 },
    velvet: { normalScale: 0.28, textureRepeat: 6, sheenRoughness: 0.68, specular: 0.46 },
    'modal-stretch': { normalScale: 0.26, textureRepeat: 8, sheenRoughness: 0.54, specular: 0.56 },
    'wool-felt': { normalScale: 0.34, textureRepeat: 7, sheenRoughness: 0.94, specular: 0.3 }
  };

  const generatedMaterialV2 = new Set([
    'cotton-jersey',
    'rib-knit',
    'french-terry',
    'fleece',
    'poplin',
    'linen',
    'denim',
    'twill',
    'wool-blend',
    'nylon-ripstop',
    'satin-silk',
    'velvet'
  ]);

  // Keep runtime textures same-origin. model-viewer creates WebGL textures through
  // fetch/ImageBitmap, so the public R2 hostname cannot be used without CORS headers.
  const generatedMaterialRoot = '/materials-v2';

  const materials = rawMaterials.map((material) => {
    const materialRoot = generatedMaterialV2.has(material.id) ? generatedMaterialRoot : '/materials';
    return {
      ...material,
      generated: generatedMaterialV2.has(material.id),
      ...(surfaceTuning[material.id] || {}),
      maps: {
        baseColor: `${materialRoot}/${material.id}/basecolor.${generatedMaterialV2.has(material.id) ? 'webp' : 'png'}`,
        normal: `${materialRoot}/${material.id}/normal.${generatedMaterialV2.has(material.id) ? 'webp' : 'png'}`,
        roughness: `${materialRoot}/${material.id}/roughness.png`,
        height: `${materialRoot}/${material.id}/height.png`
      }
    };
  });

  const allowedByCategory = {
    't-shirt': ['cotton-jersey', 'rib-knit', 'french-terry', 'modal-stretch', 'nylon-ripstop'],
    shirt: ['poplin', 'oxford-cloth', 'linen', 'satin-silk', 'cotton-jersey'],
    pants: ['twill', 'denim', 'nylon-ripstop', 'french-terry', 'wool-blend'],
    jacket: ['nylon-ripstop', 'denim', 'leather', 'twill', 'fleece', 'wool-blend'],
    hoodie: ['french-terry', 'fleece', 'cotton-jersey', 'rib-knit', 'nylon-ripstop'],
    dress: ['satin-silk', 'poplin', 'cotton-jersey', 'linen', 'velvet', 'wool-blend'],
    cloak: ['wool-blend', 'twill', 'velvet', 'satin-silk', 'fleece'],
    underwear: ['cotton-jersey', 'rib-knit', 'modal-stretch', 'nylon-ripstop'],
    jumpsuit: ['twill', 'denim', 'cotton-jersey', 'satin-silk', 'nylon-ripstop'],
    skirt: ['twill', 'denim', 'satin-silk', 'wool-blend', 'poplin'],
    blazer: ['wool-blend', 'twill', 'linen', 'velvet', 'leather'],
    coat: ['wool-blend', 'nylon-ripstop', 'fleece', 'twill', 'leather'],
    hat: ['twill', 'denim', 'wool-felt', 'leather', 'nylon-ripstop'],
    top: ['cotton-jersey', 'rib-knit', 'satin-silk', 'poplin', 'french-terry']
  };

  const fallback = ['cotton-jersey', 'twill', 'nylon-ripstop', 'wool-blend'];
  const index = new Map(materials.map(material => [material.id, material]));
  const generatedMaterials = materials.filter(material => material.generated);

  function normalizeCategory(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/mockup/g, '')
      .replace(/s$/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getMaterialsForCategory(category) {
    const key = normalizeCategory(category);
    const ids = allowedByCategory[key] || fallback;
    return ids.map(id => index.get(id)).filter(Boolean);
  }

  global.Design3DMaterials = {
    materials,
    allowedByCategory,
    getMaterialsForCategory,
    getGeneratedMaterials: () => [...generatedMaterials],
    getMaterial: id => index.get(id) || index.get(fallback[0])
  };
})(window);
