const test = require('node:test');
const assert = require('node:assert/strict');

const studioLight = require('../public/js/camera-relative-studio-light.js');

test('rotates the one-sided studio environment with the camera azimuth', () => {
  assert.equal(studioLight.rotationForCamera(-16 * Math.PI / 180, -16), 0);
  assert.ok(Math.abs(studioLight.rotationForCamera(164 * Math.PI / 180, -16) + Math.PI) < 1e-12);
  assert.ok(Math.abs(studioLight.rotationForCamera(-16 * Math.PI / 180, -16, 30) - Math.PI / 6) < 1e-12);
});

test('updates model-viewer scene lighting without rotating the garment', () => {
  const sceneSymbol = Symbol('scene');
  const rotations = [];
  let renders = 0;
  const viewer = {
    [sceneSymbol]: {
      environmentRotation: { set: (...values) => rotations.push(values) },
      queueRender: () => { renders += 1; }
    },
    dataset: {
      cameraRelativeStudioLight: '/studio.hdr',
      studioLightReferenceAzimuth: '-16',
      studioLightAzimuthOffset: '30'
    },
    environmentImage: '/studio.hdr',
    getAttribute: () => '/studio.hdr',
    getCameraOrbit: () => ({ theta: 164 * Math.PI / 180 })
  };

  assert.equal(studioLight.sync(viewer), true);
  assert.ok(Math.abs(rotations[0][1] + (5 * Math.PI / 6)) < 1e-12);
  assert.equal(renders, 1);
  assert.equal(viewer.dataset.cameraRelativeLightReady, 'true');
  assert.equal(viewer.dataset.studioLightRotationY, (-5 * Math.PI / 6).toFixed(6));
});

test('resets environment rotation when a non-studio preset is selected', () => {
  const sceneSymbol = Symbol('scene');
  const rotations = [];
  const viewer = {
    [sceneSymbol]: {
      environmentRotation: { set: (...values) => rotations.push(values) }
    },
    dataset: {
      cameraRelativeStudioLight: '/studio.hdr',
      studioLightReferenceAzimuth: '-16'
    },
    environmentImage: 'neutral',
    getAttribute: () => '/studio.hdr',
    getCameraOrbit: () => ({ theta: Math.PI })
  };

  studioLight.sync(viewer);
  assert.deepEqual(rotations[0], [0, 0, 0]);
});
