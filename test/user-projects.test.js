const test = require('node:test');
const assert = require('node:assert/strict');
const { containsEmbeddedImage, containsUnsafeMarkup, validateProjectPayload } = require('../lib/user-projects');

test('accepts a 3D project whose images are stored URLs', () => {
  const result = validateProjectPayload({
    projectType: '3d',
    name: 'Look one',
    sourceId: '42',
    sourceUrl: '/3d-models/t-shirt/basic-tee',
    previewImageUrl: 'https://cdn.cloz-design.com/users/1/preview.png',
    designData: {
      textureUrl: 'https://cdn.cloz-design.com/users/1/texture.png',
      elements: '<image href="https://cdn.cloz-design.com/users/1/artwork.png">'
    }
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.projectType, '3d');
});

test('accepts a white mockup project with an R2 artwork URL', () => {
  const result = validateProjectPayload({
    projectType: 'white_mockup',
    name: 'Campaign mockup',
    sourceId: 'white-look-1',
    sourceUrl: '/white-mockups/white-look-1',
    previewImageUrl: 'https://cdn.cloz-design.com/users/2/preview.jpg',
    designData: { artworkUrl: 'https://cdn.cloz-design.com/users/2/logo.webp', scale: 48 }
  });

  assert.equal(result.valid, true);
});

test('rejects embedded image data and invalid cross-editor source paths', () => {
  assert.equal(containsEmbeddedImage({ artwork: 'data:image/png;base64,AAAA' }), true);
  assert.equal(validateProjectPayload({
    projectType: '3d',
    name: 'Bad project',
    sourceUrl: '/white-mockups/look',
    designData: { artwork: 'data:image/png;base64,AAAA' }
  }).valid, false);
});

test('rejects executable markup in saved editor state', () => {
  assert.equal(containsUnsafeMarkup('<image href="x" onerror="alert(1)">'), true);
  const result = validateProjectPayload({
    projectType: '3d',
    name: 'Unsafe project',
    sourceUrl: '/3d-models/top/example',
    designData: { elements: '<script>alert(1)</script>' }
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /unsafe/i);
});
