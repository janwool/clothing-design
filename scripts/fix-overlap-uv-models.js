#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const blender = '/Applications/Blender.app/Contents/MacOS/Blender';
const manifestPath = process.argv[2] || '/tmp/uv-fix-manifest.json';
const workDir = '/tmp/uv-overlap-fix';
const rows = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

fs.mkdirSync(workDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

function filterSvg(svgPath, minArea = 50) {
  const text = fs.readFileSync(svgPath, 'utf8');
  const pathMatches = [...text.matchAll(/(<path[^>]* d="([^"]+)"[^>]*\/>)/g)];
  const all = [];
  for (const match of pathMatches) {
    const raw = match[1];
    const d = match[2];
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => Number(item[0]));
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    let area = 0;
    if (pts.length >= 3) {
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        area += x1 * y2 - x2 * y1;
      }
      area = Math.abs(area) / 2;
    }
    all.push({ area, raw });
  }
  const maxArea = all.length ? Math.max(...all.map((item) => item.area)) : 0;
  const effectiveMinArea = maxArea > minArea ? minArea : Math.max(0.25, maxArea * 0.01);
  const kept = all.filter((item) => item.area > effectiveMinArea);
  const removed = all.filter((item) => item.area <= effectiveMinArea);
  if (!kept.length && all.length) {
    kept.push(...all.filter((item) => item.area > 0));
  }
  kept.sort((a, b) => b.area - a.area);
  const body = [
    '<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">',
    '  <g fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">',
    ...kept.map((item) => `    ${item.raw}`),
    '  </g>',
    '</svg>',
    '',
  ];
  fs.writeFileSync(svgPath, body.join('\n'));
  return {
    kept: kept.length,
    removed: removed.length,
    effectiveMinArea,
    minKept: kept.length ? Math.min(...kept.map((item) => item.area)) : 0,
    maxRemoved: removed.length ? Math.max(...removed.map((item) => item.area)) : 0,
  };
}

function copyBackup(file) {
  if (!fs.existsSync(file)) return null;
  const backup = file.replace(/(\.[^.]+)$/, '.before-uv-overlap-fix$1');
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  return backup;
}

const results = [];

for (const row of rows) {
  const slug = row.slug;
  const input = row.input_path;
  const currentGlb = row.current_glb;
  const currentSvg = row.svg_path;
  const base = path.basename(currentGlb, '.glb');
  const repackedGlb = path.join(workDir, `${base}.repacked.glb`);
  const repackedSvg = path.join(workDir, `${base}.repacked.svg`);
  const scaledGlb = path.join(workDir, `${base}.scaled.glb`);
  const scaledSvg = path.join(workDir, `${base}.scaled.svg`);

  console.log(`\n=== ${slug} ===`);
  console.log(`input=${input}`);

  run(blender, [
    '--background',
    '--python',
    'scripts/repack-glb-uv-and-export-svg.py',
    '--',
    input,
    repackedGlb,
    repackedSvg,
    '--margin',
    '0.014',
    '--min-svg-area',
    '3',
    '--thickness',
    '0.012',
    '--min-face-area',
    '1e-12',
  ]);

  const filter = filterSvg(repackedSvg, 50);
  console.log(`filter=${JSON.stringify(filter)}`);

  run(blender, [
    '--background',
    '--python',
    'scripts/scale-glb-uv-and-svg.py',
    '--',
    repackedGlb,
    repackedSvg,
    scaledGlb,
    scaledSvg,
    '--margin',
    '32',
  ]);

  const glbBackup = copyBackup(currentGlb);
  const svgBackup = copyBackup(currentSvg);
  fs.copyFileSync(scaledGlb, currentGlb);
  fs.copyFileSync(scaledSvg, currentSvg);

  const output = {
    slug,
    currentGlb,
    currentSvg,
    glbSize: fs.statSync(currentGlb).size,
    svgSize: fs.statSync(currentSvg).size,
    filter,
    glbBackup,
    svgBackup,
  };
  results.push(output);
  console.log(`output=${JSON.stringify(output)}`);
}

fs.writeFileSync('/tmp/uv-overlap-fix-results.json', JSON.stringify(results, null, 2));
console.log('\nDONE');
console.log(JSON.stringify(results, null, 2));
