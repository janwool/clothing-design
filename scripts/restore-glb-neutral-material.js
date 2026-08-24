#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseGlb(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) {
    throw new Error('Expected a GLB 2.0 file');
  }
  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length;
  }
  const jsonChunk = chunks.find(chunk => chunk.type === 0x4e4f534a);
  if (!jsonChunk) throw new Error('GLB has no JSON chunk');
  return {
    document: JSON.parse(jsonChunk.data.toString('utf8').trimEnd()),
    chunks,
  };
}

function encodeGlb(document, chunks) {
  let json = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = (4 - (json.length % 4)) % 4;
  if (jsonPadding) json = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const outputChunks = chunks.map(chunk => (
    chunk.type === 0x4e4f534a ? { ...chunk, data: json } : chunk
  ));
  const totalLength = 12 + outputChunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of outputChunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

function restoreNeutralMaterial(reference, target) {
  const referenceMaterials = reference.materials || [];
  const targetMaterials = target.materials || [];
  if (referenceMaterials.length !== targetMaterials.length) {
    throw new Error(`Material count changed: ${referenceMaterials.length} != ${targetMaterials.length}`);
  }
  let restoredSheen = 0;
  referenceMaterials.forEach((source, index) => {
    const destination = targetMaterials[index];
    const sourcePbr = source.pbrMetallicRoughness || {};
    destination.pbrMetallicRoughness ||= {};
    if (sourcePbr.baseColorFactor) {
      destination.pbrMetallicRoughness.baseColorFactor = [...sourcePbr.baseColorFactor];
    }
    const sheen = source.extensions?.KHR_materials_sheen;
    if (sheen) {
      destination.extensions ||= {};
      destination.extensions.KHR_materials_sheen = JSON.parse(JSON.stringify(sheen));
      restoredSheen += 1;
    }
  });
  if (restoredSheen) {
    target.extensionsUsed = [...new Set([...(target.extensionsUsed || []), 'KHR_materials_sheen'])];
  }
  return { materials: targetMaterials.length, restoredSheen };
}

function main() {
  const [referencePath, targetPath] = process.argv.slice(2);
  if (!referencePath || !targetPath) {
    throw new Error('Usage: restore-glb-neutral-material.js <reference.glb> <target.glb>');
  }
  const reference = parseGlb(fs.readFileSync(referencePath));
  const targetBuffer = fs.readFileSync(targetPath);
  const target = parseGlb(targetBuffer);
  const result = restoreNeutralMaterial(reference.document, target.document);
  const output = encodeGlb(target.document, target.chunks);
  fs.writeFileSync(targetPath, output);
  const verified = parseGlb(fs.readFileSync(targetPath));
  if (result.restoredSheen > 0 && !verified.document.extensionsUsed?.includes('KHR_materials_sheen')) {
    throw new Error('KHR_materials_sheen was not restored');
  }
  console.log(JSON.stringify({
    reference: path.resolve(referencePath),
    target: path.resolve(targetPath),
    bytesBefore: targetBuffer.length,
    bytesAfter: output.length,
    ...result,
  }, null, 2));
}

if (require.main === module) main();

module.exports = { encodeGlb, parseGlb, restoreNeutralMaterial };
