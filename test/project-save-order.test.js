const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('3D editor reserves a project before uploading generated project assets', () => {
  const source = read('public/js/model-designer.js');
  const start = source.indexOf('async function saveCloudProject');
  const end = source.indexOf('\n  function ', start + 1);
  const saveFlow = source.slice(start, end > start ? end : undefined);
  const reservation = saveFlow.indexOf('const reservedProject = await window.UserProjects.saveProject');
  const textureUpload = saveFlow.indexOf("'project-texture'");
  const previewUpload = saveFlow.indexOf("'project-preview'");

  assert.ok(reservation >= 0, 'new projects should be reserved in the database');
  assert.ok(textureUpload > reservation, 'texture upload should happen after project reservation');
  assert.ok(previewUpload > reservation, 'preview upload should happen after project reservation');
  assert.match(saveFlow, /previewImageUrl: '',[\s\S]*designData: baseDesignData/);
  assert.match(saveFlow, /id: state\.projectId,[\s\S]*textureUrl: texture\.url/);
});

test('white mockup editor reserves a project before uploading its generated preview', () => {
  const source = read('public/js/white-mockup-editor.js');
  const start = source.indexOf('async function saveProject');
  const end = source.indexOf('\n  function ', start + 1);
  const saveFlow = source.slice(start, end > start ? end : undefined);
  const reservation = saveFlow.indexOf('const reservedProject = await window.UserProjects.saveProject');
  const previewUpload = saveFlow.indexOf("'project-preview'");

  assert.ok(reservation >= 0, 'new mockup projects should be reserved in the database');
  assert.ok(previewUpload > reservation, 'preview upload should happen after project reservation');
  assert.match(saveFlow, /previewImageUrl: '',[\s\S]*designData: projectDesignData\(\)/);
  assert.match(saveFlow, /id: state\.projectId,[\s\S]*previewImageUrl/);
});
