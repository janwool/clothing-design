const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

require('./generate-worker-assets');
require('./generate-worker-templates');

const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'dist');
const iconvLiteShim = path.join(rootDir, 'src', 'shims', 'iconv-lite-node-extension.cjs');
const depdShim = path.join(rootDir, 'src', 'shims', 'depd.cjs');
const bodyParserShim = path.join(rootDir, 'src', 'shims', 'body-parser.cjs');

const workerCompatibilityShims = {
  name: 'worker-compatibility-shims',
  setup(build) {
    build.onResolve({ filter: /^body-parser$/ }, () => ({ path: bodyParserShim }));
    build.onResolve({ filter: /^depd$/ }, () => ({ path: depdShim }));

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
  fs.rmSync(outputDir, { recursive: true, force: true });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'worker.mjs')],
    outdir: outputDir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    splitting: true,
    entryNames: 'worker',
    chunkNames: 'chunks/[name]-[hash]',
    outExtension: { '.js': '.mjs' },
    external: ['cloudflare:node', 'cloudflare:workers'],
    plugins: [workerCompatibilityShims],
    logLevel: 'info'
  });

  console.log(`Generated ${path.relative(rootDir, path.join(outputDir, 'worker.mjs'))}`);
}

buildWorker().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
