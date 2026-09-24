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

async function layoutNodes(layout, dimensions, center) {
  const source = makeGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [] }] });
  const blob = await buildLayoutGlb(source, layout, dimensions, center);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const jsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const scene = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  return scene.scenes[0].nodes.map(index => scene.nodes[index]);
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

test('keeps a consistent visible gap for wide and deep garments', async () => {
  const cameraCos = Math.cos(0);
  for (const dimensions of [{ x: 1.8, y: 1.4, z: 0.18 }, { x: 0.65, y: 1.4, z: 0.9 }]) {
    const nodes = await layoutNodes('three', dimensions);
    const extents = nodes.map(node => {
      const angle = 2 * Math.atan2(node.rotation[1], node.rotation[3]);
      const width = Math.abs(Math.cos(angle)) * dimensions.x + Math.abs(Math.sin(angle)) * dimensions.z;
      const x = node.translation[0] * cameraCos;
      return { left: x - width / 2, right: x + width / 2 };
    });
    const gaps = [extents[1].left - extents[0].right, extents[2].left - extents[1].right];
    assert.ok(gaps.every(gap => gap > dimensions.x * 0.1 && gap < dimensions.x * 0.23));
    assert.ok(Math.abs(gaps[0] - gaps[1]) < 1e-6);
  }
});

test('centers offset model bounds before arranging rotated instances', async () => {
  const center = { x: 0.35, y: 0.9, z: -0.2 };
  const nodes = await layoutNodes('front-back', { x: 1, y: 1.8, z: 0.4 }, center);
  for (const node of nodes) {
    const angle = 2 * Math.atan2(node.rotation[1], node.rotation[3]);
    const worldY = node.translation[1] + node.scale[1] * center.y;
    const worldZ = node.translation[2] + node.scale[2] * (-Math.sin(angle) * center.x + Math.cos(angle) * center.z);
    assert.ok(Math.abs(worldY) < 1e-6);
    assert.ok(Math.abs(worldZ) < 1e-6);
  }
});
