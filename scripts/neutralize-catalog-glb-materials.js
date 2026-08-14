#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');

const projectRoot = path.resolve(__dirname, '..');
const databasePath = path.join(projectRoot, 'database.sqlite');
const outputDir = path.join(projectRoot, 'artifacts', 'deployments', 'catalog-20260814-neutral-glb-v1');
const manifestPath = path.join(outputDir, 'manifest.json');
const sqlPath = path.join(outputDir, 'apply-local.sql');
const version = '20260814-neutral1';

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    database.all(sql, params, (error, rows) => {
      database.close();
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Not a GLB file');
  }
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.toString('ascii', 16, 20);
  if (version !== 2 || declaredLength !== buffer.length || jsonType !== 'JSON') {
    throw new Error(`Unsupported GLB header (version=${version}, declared=${declaredLength}, actual=${buffer.length}, chunk=${jsonType})`);
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const document = JSON.parse(buffer.subarray(jsonStart, jsonEnd).toString('utf8').trimEnd());
  return { document, jsonStart, jsonEnd, jsonLength };
}

function neutralizeMaterialDocument(document) {
  let materialCount = 0;
  let removedBaseColorTextures = 0;
  let neutralizedFactors = 0;
  for (const material of document.materials || []) {
    materialCount += 1;
    material.pbrMetallicRoughness ||= {};
    const pbr = material.pbrMetallicRoughness;
    if (pbr.baseColorTexture) {
      delete pbr.baseColorTexture;
      removedBaseColorTextures += 1;
    }
    const alpha = Array.isArray(pbr.baseColorFactor) && Number.isFinite(pbr.baseColorFactor[3])
      ? pbr.baseColorFactor[3]
      : 1;
    if (!Array.isArray(pbr.baseColorFactor) || pbr.baseColorFactor.some((value, index) => value !== [1, 1, 1, alpha][index])) {
      neutralizedFactors += 1;
    }
    pbr.baseColorFactor = [1, 1, 1, alpha];
  }
  return { materialCount, removedBaseColorTextures, neutralizedFactors };
}

function patchGlb(buffer) {
  const parsed = parseGlb(buffer);
  const binaryBefore = buffer.subarray(parsed.jsonEnd);
  const changes = neutralizeMaterialDocument(parsed.document);
  const json = Buffer.from(JSON.stringify(parsed.document), 'utf8');
  if (json.length > parsed.jsonLength) {
    throw new Error(`Neutral JSON grew beyond existing chunk (${json.length} > ${parsed.jsonLength})`);
  }
  const output = Buffer.from(buffer);
  output.fill(0x20, parsed.jsonStart, parsed.jsonEnd);
  json.copy(output, parsed.jsonStart);
  const reparsed = parseGlb(output);
  const binaryAfter = output.subarray(reparsed.jsonEnd);
  if (sha256(binaryAfter) !== sha256(binaryBefore)) {
    throw new Error('Binary GLB chunks changed unexpectedly');
  }
  for (const material of reparsed.document.materials || []) {
    const pbr = material.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture || JSON.stringify(pbr.baseColorFactor) !== '[1,1,1,1]') {
      throw new Error('Neutral material validation failed');
    }
  }
  return { output, changes, binarySha256: sha256(binaryAfter) };
}

function localPathFromUrl(url) {
  const pathname = new URL(url, 'https://local.invalid').pathname;
  if (!pathname.startsWith('/uploads/glb/')) throw new Error(`Unexpected GLB URL: ${url}`);
  return path.join(projectRoot, 'public', pathname);
}

function neutralOutputPath(source) {
  return source.replace(/\.glb$/i, '-neutral-v1.glb');
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const rows = await query(
    `SELECT id,slug,file_url FROM models_3d WHERE id BETWEEN 2 AND 107 ORDER BY id`
  );
  if (rows.length !== 106) throw new Error(`Expected 106 models, found ${rows.length}`);
  await fs.mkdir(outputDir, { recursive: true });

  const models = [];
  for (const row of rows) {
    const source = localPathFromUrl(row.file_url);
    const destination = neutralOutputPath(source);
    const input = await fs.readFile(source);
    const patched = patchGlb(input);
    await fs.writeFile(destination, patched.output);
    const publicUrl = `/uploads/glb/${path.basename(destination)}?v=${version}`;
    models.push({
      id: row.id,
      slug: row.slug,
      oldFileUrl: row.file_url,
      fileUrl: publicUrl,
      source,
      destination,
      bytes: patched.output.length,
      inputSha256: sha256(input),
      outputSha256: sha256(patched.output),
      binarySha256: patched.binarySha256,
      ...patched.changes,
    });
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    modelCount: models.length,
    totalBytes: models.reduce((sum, model) => sum + model.bytes, 0),
    totals: {
      materials: models.reduce((sum, model) => sum + model.materialCount, 0),
      removedBaseColorTextures: models.reduce((sum, model) => sum + model.removedBaseColorTextures, 0),
      neutralizedFactors: models.reduce((sum, model) => sum + model.neutralizedFactors, 0),
    },
    models,
  };
  const statements = [
    'BEGIN TRANSACTION;',
    ...models.map(model =>
      `UPDATE models_3d SET file_url=${sqlString(model.fileUrl)}, updated_at=CURRENT_TIMESTAMP WHERE id=${model.id};`
    ),
    'COMMIT;',
  ];
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(sqlPath, `${statements.join('\n')}\n`);
  console.log(JSON.stringify({
    manifestPath,
    sqlPath,
    modelCount: manifest.modelCount,
    totalMiB: Number((manifest.totalBytes / 1024 / 1024).toFixed(2)),
    totals: manifest.totals,
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  parseGlb,
  neutralizeMaterialDocument,
  patchGlb,
  sha256,
};
