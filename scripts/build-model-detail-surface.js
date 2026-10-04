const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/model-detail-surface.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: 'public/js/model-detail-surface.bundle.js'
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
