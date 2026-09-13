const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = require.resolve('@google/model-viewer/dist/model-viewer.min.js');
const meshoptSource = require.resolve('three/examples/jsm/libs/meshopt_decoder.module.js');
const destinationDirectory = path.join(root, 'public', 'vendor', 'model-viewer');
const destination = path.join(destinationDirectory, 'model-viewer.min.js');
const meshoptDestination = path.join(destinationDirectory, 'meshopt_decoder.js');

fs.mkdirSync(destinationDirectory, { recursive: true });
fs.copyFileSync(source, destination);
const meshoptModule = fs.readFileSync(meshoptSource, 'utf8');
const meshoptClassicScript = meshoptModule.replace(
  /export\s*\{\s*MeshoptDecoder\s*\};?\s*$/,
  'self.MeshoptDecoder = MeshoptDecoder;\n'
);
if (meshoptClassicScript === meshoptModule) {
  throw new Error('Could not convert the Three.js Meshopt decoder to a classic browser script');
}
fs.writeFileSync(meshoptDestination, meshoptClassicScript);

console.log('Synced public/vendor/model-viewer/model-viewer.min.js');
console.log('Synced public/vendor/model-viewer/meshopt_decoder.js');
