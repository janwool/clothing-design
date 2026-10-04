import * as THREE from 'three';

// Project in model space inside the garment's existing material shader. The
// source pixels never touch the garment UV atlas, and there is no second mesh
// whose depth or triangle boundaries can tear when the camera rotates.
const attachments = new WeakMap();

function modelScene(viewer) {
  const sceneSymbol = Object.getOwnPropertySymbols(viewer).find(symbol => symbol.description === 'scene');
  const scene = sceneSymbol && viewer[sceneSymbol];
  const model = scene?.models?.[0];
  if (!model) throw new Error('The 3D garment is not ready. Please try again.');
  return { scene, model };
}

function shaderUniforms(image, projection) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return {
    artworkTexture: { value: texture },
    artworkCenter: { value: new THREE.Vector3() },
    artworkRight: { value: new THREE.Vector3() },
    artworkDown: { value: new THREE.Vector3() },
    artworkNormal: { value: new THREE.Vector3() },
    artworkWidth: { value: 1 },
    artworkHeight: { value: 1 },
    artworkDepthTexture: { value: null },
    artworkCameraDistance: { value: 1 },
    artworkCameraNear: { value: 0.01 },
    artworkCameraFar: { value: 10 },
    artworkDepthTolerance: { value: 0.01 },
    artworkFromMesh: { value: new THREE.Matrix4() }
  };
}

function updateUniforms(uniforms, projection) {
  const { center, right, down, normal, width, height } = projection;
  uniforms.artworkCenter.value.set(center.x, center.y, center.z);
  uniforms.artworkRight.value.set(right.x, right.y, right.z);
  uniforms.artworkDown.value.set(down.x, down.y, down.z);
  uniforms.artworkNormal.value.set(normal.x, normal.y, normal.z);
  uniforms.artworkWidth.value = width;
  uniforms.artworkHeight.value = height;
}

// The projector sees the same garment geometry as the user. Its depth map
// prevents a print from appearing again on a pocket lining, the back panel,
// or another surface behind the visible one. This is independent of UVs and
// of the number of primitives in a model.
function renderVisibleDepth(viewer, entry, projection) {
  let rendererSymbol;
  for (let owner = viewer; owner && !rendererSymbol; owner = Object.getPrototypeOf(owner)) {
    rendererSymbol = Object.getOwnPropertySymbols(owner).find(symbol => symbol.description === 'renderer');
  }
  const renderer = rendererSymbol && viewer[rendererSymbol]?.threeRenderer;
  if (!renderer) throw new Error('The 3D renderer is not ready.');

  const { scene, model, uniforms } = entry;
  model.updateWorldMatrix(true, true);
  const modelScale = new THREE.Vector3();
  model.getWorldScale(modelScale);
  const worldScale = Math.max(modelScale.x, modelScale.y, modelScale.z);
  const center = new THREE.Vector3(projection.center.x, projection.center.y, projection.center.z).applyMatrix4(model.matrixWorld);
  const normal = new THREE.Vector3(projection.normal.x, projection.normal.y, projection.normal.z)
    .transformDirection(model.matrixWorld);
  const down = new THREE.Vector3(projection.down.x, projection.down.y, projection.down.z)
    .transformDirection(model.matrixWorld);
  const span = Math.max(projection.width, projection.height) * worldScale;
  const bounds = new THREE.Box3().setFromObject(model);
  const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, span, 0.01);
  const distance = radius * 3;
  const near = 0.01;
  const far = radius * 6;
  const halfWidth = projection.width * worldScale / 2;
  const halfHeight = projection.height * worldScale / 2;
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, near, far);
  camera.position.copy(center).addScaledVector(normal, distance);
  camera.up.copy(down).negate();
  camera.lookAt(center);
  camera.updateMatrixWorld();

  const resolution = 512;
  if (!entry.depthTarget) {
    entry.depthTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    entry.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide
    });
  }
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
  const previousClearAlpha = renderer.getClearAlpha();
  const previousOverride = scene.overrideMaterial;
  const previousBackground = scene.background;
  const previousAutoClear = renderer.autoClear;
  const previousShadowEnabled = renderer.shadowMap.enabled;
  const layerStates = [];
  try {
    model.traverse(object => {
      if (!object.isMesh) return;
      layerStates.push([object, object.layers.mask]);
      object.layers.enable(30);
    });
    camera.layers.set(30);
    scene.overrideMaterial = entry.depthMaterial;
    scene.background = null;
    renderer.shadowMap.enabled = false;
    renderer.autoClear = true;
    renderer.setRenderTarget(entry.depthTarget);
    renderer.setViewport(0, 0, resolution, resolution);
    renderer.setScissorTest(false);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
  } finally {
    for (const [object, mask] of layerStates) object.layers.mask = mask;
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;
    renderer.shadowMap.enabled = previousShadowEnabled;
    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
  }
  uniforms.artworkDepthTexture.value = entry.depthTarget.texture;
  uniforms.artworkCameraDistance.value = distance / worldScale;
  uniforms.artworkCameraNear.value = near / worldScale;
  uniforms.artworkCameraFar.value = far / worldScale;
  // Let an image continue over front-facing folds while rejecting the back of
  // the garment. The limit follows both the print size and model thickness.
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const modelDepth = Math.abs(normal.x) * boundsSize.x + Math.abs(normal.y) * boundsSize.y + Math.abs(normal.z) * boundsSize.z;
  uniforms.artworkDepthTolerance.value = Math.max(Math.min(span * 0.25, modelDepth * 0.25), 0.003) / worldScale;
}

function patchShader(shader, uniforms) {
  if (!shader.vertexShader.includes('#include <begin_vertex>') ||
      !shader.fragmentShader.includes('#include <map_fragment>')) {
    throw new Error('This 3D material cannot display a projected image.');
  }
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `
#include <common>
uniform mat4 artworkFromMesh;
varying vec3 artworkPosition;
`);
  const positionAnchor = shader.vertexShader.includes('#include <displacementmap_vertex>')
    ? '#include <displacementmap_vertex>'
    : shader.vertexShader.includes('#include <skinning_vertex>')
      ? '#include <skinning_vertex>'
      : '#include <begin_vertex>';
  shader.vertexShader = shader.vertexShader.replace(positionAnchor, `
${positionAnchor}
artworkPosition = (artworkFromMesh * vec4(transformed, 1.0)).xyz;
`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
#include <common>
uniform sampler2D artworkTexture;
uniform sampler2D artworkDepthTexture;
uniform vec3 artworkCenter;
uniform vec3 artworkRight;
uniform vec3 artworkDown;
uniform vec3 artworkNormal;
uniform float artworkWidth;
uniform float artworkHeight;
uniform float artworkCameraDistance;
uniform float artworkCameraNear;
uniform float artworkCameraFar;
uniform float artworkDepthTolerance;
varying vec3 artworkPosition;
float clozUnpackDepth(vec4 packed) {
  return dot(packed, vec4(255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0));
}
`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
#include <map_fragment>
vec3 artworkDelta = artworkPosition - artworkCenter;
float artworkS = dot(artworkDelta, artworkRight) / artworkWidth + 0.5;
float artworkT = dot(artworkDelta, artworkDown) / artworkHeight + 0.5;
if (artworkS >= 0.0 && artworkS <= 1.0 && artworkT >= 0.0 && artworkT <= 1.0) {
  float artworkSurfaceDepth = (artworkCameraDistance - dot(artworkDelta, artworkNormal) - artworkCameraNear) /
    (artworkCameraFar - artworkCameraNear);
  float artworkFrontDepth = clozUnpackDepth(texture2D(artworkDepthTexture, vec2(artworkS, 1.0 - artworkT)));
  float artworkTolerance = artworkDepthTolerance / (artworkCameraFar - artworkCameraNear);
  if (artworkSurfaceDepth <= artworkFrontDepth + artworkTolerance) {
  vec4 artworkPixel = texture2D(artworkTexture, vec2(artworkS, 1.0 - artworkT));
  float artworkCoverage = artworkPixel.a;
  diffuseColor.rgb = mix(diffuseColor.rgb, artworkPixel.rgb, artworkCoverage);
  }
}
`);
}

function detach(viewer) {
  const entry = attachments.get(viewer);
  if (!entry) return;
  for (const [material, previous] of entry.materials) {
    material.onBeforeCompile = previous.onBeforeCompile;
    material.customProgramCacheKey = previous.customProgramCacheKey;
    material.needsUpdate = true;
  }
  for (const [mesh, previous] of entry.meshes) mesh.onBeforeRender = previous;
  entry.uniforms.artworkTexture.value.dispose();
  entry.depthTarget?.dispose();
  entry.depthMaterial?.dispose();
  entry.scene.queueRender();
  attachments.delete(viewer);
}

function attach(viewer, image, projection) {
  const { scene, model } = modelScene(viewer);
  let entry = attachments.get(viewer);
  if (entry && (entry.image !== image || entry.model !== model)) {
    detach(viewer);
    entry = null;
  }
  if (!entry) {
    const uniforms = shaderUniforms(image, projection);
    entry = { scene, model, image, uniforms, materials: new Map(), meshes: new Map() };
    attachments.set(viewer, entry);
  }
  updateUniforms(entry.uniforms, projection);
  renderVisibleDepth(viewer, entry, projection);
  model.updateWorldMatrix(true, true);
  const fromWorld = new THREE.Matrix4();
  model.traverse(object => {
    if (!object.isMesh) return;
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material || entry.materials.has(material)) continue;
      const previous = {
        onBeforeCompile: material.onBeforeCompile,
        customProgramCacheKey: material.customProgramCacheKey
      };
      entry.materials.set(material, previous);
      material.onBeforeCompile = function (shader, renderer) {
        previous.onBeforeCompile?.call(this, shader, renderer);
        patchShader(shader, entry.uniforms);
      };
      material.customProgramCacheKey = function () {
        return `${previous.customProgramCacheKey?.call(this) || ''}|model-detail-artwork-v1`;
      };
      material.needsUpdate = true;
    }
    if (!entry.meshes.has(object)) {
      const previous = object.onBeforeRender;
      let projectionRoot = object.parent;
      while (projectionRoot && projectionRoot !== model && !/^Export[_ ]/.test(projectionRoot.name || '')) {
        projectionRoot = projectionRoot.parent;
      }
      projectionRoot ||= model;
      entry.meshes.set(object, previous);
      object.onBeforeRender = function (renderer, sceneObject, camera, geometry, material, group) {
        previous?.call(this, renderer, sceneObject, camera, geometry, material, group);
        this.updateWorldMatrix(true, false);
        fromWorld.copy(projectionRoot.matrixWorld).invert();
        entry.uniforms.artworkFromMesh.value.copy(fromWorld).multiply(this.matrixWorld);
      };
    }
  });
  scene.queueRender();
  return entry.meshes.size;
}

window.ModelDetailSurface = Object.freeze({ attach, detach });
