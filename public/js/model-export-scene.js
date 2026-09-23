(() => {
  'use strict';

  const JSON_CHUNK = 0x4E4F534A;
  const GLB_MAGIC = 0x46546C67;

  function instancesForLayout(layout, dimensions) {
    const width = Math.max(Number(dimensions?.x) || 0, 0.4);
    const height = Math.max(Number(dimensions?.y) || 0, 0.7);
    const x = width * 1.34;
    const y = height * 1.2;
    const item = (name, tx, ty, angle, scale = 1) => ({ name, tx, ty, angle, scale });
    switch (layout) {
      case 'front-back': return [item('Front', -x / 2, 0, 0), item('Back', x / 2, 0, 180)];
      case 'three': return [item('Front', -x, 0, 0), item('Side', 0, 0, 80), item('Back', x, 0, 180)];
      case 'four': return [item('Front', -x / 2, y / 2, 0), item('Side', x / 2, y / 2, 80), item('Back', -x / 2, -y / 2, 180), item('Other side', x / 2, -y / 2, -80)];
      case 'editorial': return [item('Front detail', -x * .48, 0, -12, 1.14), item('Back', x * .72, 0, 180, .76)];
      case 'detail': return [item('Front detail', -x * .65, 0, -18, 1.18), item('Side detail', x * .65, 0, 68, 1.18)];
      default: return [item('Front', 0, 0, 0)];
    }
  }

  async function buildLayoutGlb(sourceBlob, layout, dimensions) {
    const source = new Uint8Array(await sourceBlob.arrayBuffer());
    const sourceView = new DataView(source.buffer);
    if (source.byteLength < 20 || sourceView.getUint32(0, true) !== GLB_MAGIC || sourceView.getUint32(4, true) !== 2 || sourceView.getUint32(16, true) !== JSON_CHUNK) {
      throw new Error('The 3D model could not be arranged for this layout.');
    }
    const jsonLength = sourceView.getUint32(12, true);
    const restOffset = 20 + jsonLength;
    if (restOffset > source.byteLength) throw new Error('The 3D model file is incomplete.');
    const gltf = JSON.parse(new TextDecoder().decode(source.subarray(20, restOffset)));
    const originalNodes = gltf.nodes || [];
    const originalSkins = gltf.skins || [];
    const roots = gltf.scenes?.[gltf.scene || 0]?.nodes || [];
    if (!roots.length) throw new Error('The 3D model has no visible scene.');
    gltf.nodes = [...originalNodes];
    gltf.skins = [...originalSkins];
    const sceneRoots = [];

    for (const instance of instancesForLayout(layout, dimensions)) {
      const nodeOffset = gltf.nodes.length;
      const skinOffset = gltf.skins.length;
      for (const original of originalNodes) {
        const node = { ...original };
        if (original.children) node.children = original.children.map(index => index + nodeOffset);
        if (Number.isInteger(original.skin)) node.skin = original.skin + skinOffset;
        gltf.nodes.push(node);
      }
      for (const original of originalSkins) {
        const skin = { ...original, joints: original.joints.map(index => index + nodeOffset) };
        if (Number.isInteger(original.skeleton)) skin.skeleton = original.skeleton + nodeOffset;
        gltf.skins.push(skin);
      }
      const radians = instance.angle * Math.PI / 180;
      sceneRoots.push(gltf.nodes.push({
        name: `Export ${instance.name}`,
        children: roots.map(index => index + nodeOffset),
        translation: [instance.tx, instance.ty, 0],
        rotation: [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)],
        scale: [instance.scale, instance.scale, instance.scale]
      }) - 1);
    }
    gltf.scenes = [{ name: `Export ${layout}`, nodes: sceneRoots }];
    gltf.scene = 0;
    delete gltf.animations;

    const encoded = new TextEncoder().encode(JSON.stringify(gltf));
    const paddedLength = (encoded.length + 3) & ~3;
    const header = new Uint8Array(20);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, GLB_MAGIC, true);
    headerView.setUint32(4, 2, true);
    headerView.setUint32(8, 20 + paddedLength + source.byteLength - restOffset, true);
    headerView.setUint32(12, paddedLength, true);
    headerView.setUint32(16, JSON_CHUNK, true);
    const jsonBytes = new Uint8Array(paddedLength);
    jsonBytes.fill(0x20);
    jsonBytes.set(encoded);
    return new Blob([header, jsonBytes, source.subarray(restOffset)], { type: 'model/gltf-binary' });
  }

  if (typeof window !== 'undefined') window.ModelExportScene = { buildLayoutGlb };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildLayoutGlb };
})();
