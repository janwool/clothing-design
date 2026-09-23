const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLayoutGlb } = require('../public/js/model-export-scene.js');

function makeGlb(json, binary = new Uint8Array([1, 2, 3, 4])) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = (encoded.length + 3) & ~3;
  const output = new Uint8Array(20 + jsonLength + 8 + binary.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546C67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4E4F534A, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(encoded, 20);
  view.setUint32(20 + jsonLength, binary.length, true);
  view.setUint32(24 + jsonLength, 0x004E4942, true);
  output.set(binary, 28 + jsonLength);
  return new Blob([output], { type: 'model/gltf-binary' });
}

test('builds one GLB scene with independent angled instances and shared geometry', async () => {
  const source = makeGlb({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ children: [1] }, { mesh: 0, skin: 0 }],
    meshes: [{ primitives: [] }],
    skins: [{ joints: [0], skeleton: 0 }],
    animations: [{ channels: [], samplers: [] }]
  });
  const result = await buildLayoutGlb(source, 'four', { x: 1, y: 2, z: 0.5 });
  const bytes = new Uint8Array(await result.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const jsonLength = view.getUint32(12, true);
  const scene = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const roots = scene.scenes[0].nodes;

  assert.equal(view.getUint32(8, true), bytes.length);
  assert.equal(roots.length, 4);
  assert.equal(scene.meshes.length, 1);
  assert.equal(scene.skins.length, 5);
  assert.equal(scene.animations, undefined);
  assert.deepEqual([...bytes.subarray(bytes.length - 4)], [1, 2, 3, 4]);
  for (let i = 0; i < roots.length; i++) {
    const wrapper = scene.nodes[roots[i]];
    const root = scene.nodes[wrapper.children[0]];
    const mesh = scene.nodes[root.children[0]];
    assert.equal(mesh.mesh, 0);
    assert.equal(mesh.skin, i + 1);
    assert.deepEqual(scene.skins[mesh.skin].joints, [wrapper.children[0]]);
    assert.ok(Math.abs(wrapper.rotation.reduce((sum, component) => sum + component * component, 0) - 1) < 1e-6);
  }
});
