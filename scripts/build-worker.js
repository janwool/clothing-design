const path = require('path');
const esbuild = require('esbuild');

require('./generate-worker-assets');

const rootDir = path.join(__dirname, '..');
const outputFile = path.join(rootDir, 'dist', 'worker.mjs');
const iconvLiteShim = path.join(rootDir, 'src', 'shims', 'iconv-lite-node-extension.cjs');

const iconvLiteNodeExtensionShim = {
  name: 'iconv-lite-node-extension-shim',
  setup(build) {
    build.onResolve({ filter: /^\.\/(streams|extend-node)$/ }, args => {
      const iconvLiteIndex = `${path.sep}iconv-lite${path.sep}lib${path.sep}index.js`;
      if (args.importer.endsWith(iconvLiteIndex)) {
        return { path: iconvLiteShim };
      }
      return null;
    });
  }
};

async function buildWorker() {
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'worker.mjs')],
    outfile: outputFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['cloudflare:node', 'cloudflare:workers'],
    plugins: [iconvLiteNodeExtensionShim],
    logLevel: 'info'
  });

  console.log(`Generated ${path.relative(rootDir, outputFile)}`);
}

buildWorker().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
