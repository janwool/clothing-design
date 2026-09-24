(() => {
  'use strict';

  const JSON_CHUNK = 0x4E4F534A;
  const GLB_MAGIC = 0x46546C67;
  const CAMERA_AZIMUTH = 0;
  const CAMERA_POLAR = 72 * Math.PI / 180;

  function positiveDimension(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0.001 ? number : fallback;
  }

  function instancesForLayout(layout, dimensions) {
    const width = positiveDimension(dimensions?.x, 0.4);
    const height = positiveDimension(dimensions?.y, 0.7);
    const depth = positiveDimension(dimensions?.z, width * 0.25);
    const horizontalGap = Math.max(width * 0.12, Math.min(height * 0.12, width * 0.22));
    const verticalGap = Math.max(height * 0.1, width * 0.08);
    const item = (name, angle, scale = 1) => {
      const relativeAngle = angle * Math.PI / 180 - CAMERA_AZIMUTH;
      const projectedWidth = scale * (Math.abs(Math.cos(relativeAngle)) * width + Math.abs(Math.sin(relativeAngle)) * depth);
      const projectedDepth = scale * (Math.abs(Math.sin(relativeAngle)) * width + Math.abs(Math.cos(relativeAngle)) * depth);
      const projectedHeight = scale * Math.sin(CAMERA_POLAR) * height + Math.cos(CAMERA_POLAR) * projectedDepth;
      return { name, angle, scale, tx: 0, ty: 0, projectedWidth, projectedHeight };
    };
    const row = (items, gap = horizontalGap) => {
      const totalWidth = items.reduce((sum, instance) => sum + instance.projectedWidth, 0) + gap * (items.length - 1);
      let cursor = -totalWidth / 2;
      for (const instance of items) {
        instance.tx = (cursor + instance.projectedWidth / 2) / Math.cos(CAMERA_AZIMUTH);
        cursor += instance.projectedWidth + gap;
      }
      return items;
    };
    switch (layout) {
      case 'front-back': return row([item('Front', 0), item('Back', 180)]);
      case 'three': return row([item('Front', 0), item('Side', 90), item('Back', 180)]);
      case 'four': {
        const items = [item('Front', 0), item('Side', 90), item('Back', 180), item('Other side', -90)];
        const leftWidth = Math.max(items[0].projectedWidth, items[2].projectedWidth);
        const rightWidth = Math.max(items[1].projectedWidth, items[3].projectedWidth);
        const horizontalCenter = (rightWidth - leftWidth) / 2;
        const leftX = (-horizontalGap / 2 - leftWidth / 2 - horizontalCenter) / Math.cos(CAMERA_AZIMUTH);
        const rightX = (horizontalGap / 2 + rightWidth / 2 - horizontalCenter) / Math.cos(CAMERA_AZIMUTH);
        const topHeight = Math.max(items[0].projectedHeight, items[1].projectedHeight);
        const bottomHeight = Math.max(items[2].projectedHeight, items[3].projectedHeight);
        const verticalCenter = (topHeight - bottomHeight) / 2;
        const topY = (verticalGap / 2 + topHeight / 2 - verticalCenter) / Math.sin(CAMERA_POLAR);
        const bottomY = (-verticalGap / 2 - bottomHeight / 2 - verticalCenter) / Math.sin(CAMERA_POLAR);
        items.forEach((instance, index) => {
          instance.tx = index % 2 === 0 ? leftX : rightX;
          instance.ty = index < 2 ? topY : bottomY;
        });
        return items;
      }
      case 'editorial': return row([item('Front detail', 0, 1.14), item('Back', 180, .76)]);
      case 'detail': return row([item('Front detail', 0, 1.18), item('Side detail', 90, 1.18)]);
      default: return [item('Front', 0)];
    }
  }

  async function buildLayoutGlb(sourceBlob, layout, dimensions, center = { x: 0, y: 0, z: 0 }) {
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
      const centerX = Number(center?.x) || 0;
      const centerY = Number(center?.y) || 0;
      const centerZ = Number(center?.z) || 0;
      const rotatedCenterX = Math.cos(radians) * centerX + Math.sin(radians) * centerZ;
      const rotatedCenterZ = -Math.sin(radians) * centerX + Math.cos(radians) * centerZ;
      sceneRoots.push(gltf.nodes.push({
        name: `Export ${instance.name}`,
        children: roots.map(index => index + nodeOffset),
        translation: [instance.tx - instance.scale * rotatedCenterX, instance.ty - instance.scale * centerY, -instance.scale * rotatedCenterZ],
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
