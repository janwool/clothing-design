const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('project save analytics record standardized failure reasons and the failed stage', () => {
  const projectClient = read('public/js/user-projects.js');
  const modelDesigner = read('public/js/model-designer.js');
  const whiteMockup = read('public/js/white-mockup-editor.js');

  assert.match(projectClient, /failure_reason: failureReason/);
  assert.match(projectClient, /save_stage: saveStage \|\| 'unknown'/);
  assert.match(projectClient, /status === 403[\s\S]*failureReason = 'project_limit'/);
  assert.match(modelDesigner, /designer_project_\$\{saveMode\}_begin/);
  assert.match(modelDesigner, /designer_project_\$\{saveMode\}_success/);
  assert.match(modelDesigner, /designer_project_\$\{saveMode\}_error/);
  assert.match(modelDesigner, /projectSaveFailureContext\?\.\(error, saveStage\)/);
  assert.match(whiteMockup, /projectSaveFailureContext\?\.\(error, saveStage\)/);

  const window = {
    location: { hash: '', pathname: '/3d-models/t-shirt/example', search: '', assign() {} },
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(projectClient, {
    AbortController,
    URLSearchParams,
    console,
    document: {},
    fetch: async () => { throw new Error('unused'); },
    window
  });
  const projectLimit = window.UserProjects.projectSaveFailureContext(
    { status: 403, code: 'PLAN_LIMIT', resource: 'projects' },
    'reserve_project'
  );
  assert.equal(projectLimit.failure_reason, 'project_limit');
  assert.equal(projectLimit.save_stage, 'reserve_project');
  assert.equal(projectLimit.error_status, 403);
  assert.equal(
    window.UserProjects.projectSaveFailureContext(new Error('fetch failed'), 'finalize_project').failure_reason,
    'network_or_client_error'
  );
});
