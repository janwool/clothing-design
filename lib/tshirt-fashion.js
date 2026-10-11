const blackPosters = require('../public/config/tshirt-fashion-posters.json');
// Curated styles from the live Fashion Mockup catalog; unavailable assets are omitted.
const styles = [
  ['young-western-female-tee-v4', 'women', 'Crewneck T-shirt'],
  ['crewneck-tee-male-front', 'men', 'Classic crewneck T-shirt'],
  ['model-010-longline-short-sleeve-top-from3d-v2-female', 'women', 'Longline T-shirt'],
  ['model-023-classic-v-neck-tshirt-from3d-v2-male', 'men', 'V-neck T-shirt'],
  ['young-western-female-henley-v7', 'women', 'Henley T-shirt'],
  ['panel-tee-european-male-candid', 'men', 'Panel T-shirt'],
  ['young-western-female-polo-v5', 'women', 'Polo shirt'],
  ['long-sleeve-crewneck-male-front', 'men', 'Long-sleeve T-shirt']
];
function selectTshirtFashion(assets, { audience, black = false } = {}) {
  return styles.filter(([, gender]) => !audience || gender === audience).flatMap(([name, gender, title]) => {
    const asset = assets.find(item => item.asset_name === name);
    if (!asset?.base_image_url || (black && !blackPosters[name])) return [];
    return [{ title, audience: gender, image: black ? blackPosters[name] : asset.base_image_url,
      color: black ? '#171717' : '',
      href: `/white-mockups/${encodeURIComponent(name)}${black ? '?color=171717' : ''}` }];
  });
}
module.exports = { selectTshirtFashion };
