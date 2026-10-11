const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'), 'utf8');
function setup() {
  const timers = new Map(); let counter = 0; const applied = [];
  const ctx = {
    state: {hoverTextureUpdateId:0,textureUpdateId:0,hoverMaterialSnapshot:null},
    designerViewer: {}, hasEditableArtwork: () => false,
    setTimeout(fn) {timers.set(++counter, fn); return counter;}, clearTimeout(id) {timers.delete(id);},
    captureViewerBaseColorTextures: () => 'old artwork',
    restoreViewerBaseColorTextures: snapshot => applied.push(snapshot),
    rasterizeModelTexture: async options => options?.includeTemplateHighlight ? 'hover texture' : 'empty texture',
    applyTextureToModel: async texture => applied.push(texture),
    applyTextureToViewer: async (viewer, texture, options) => {if(options.isCurrent()) applied.push(texture);}, console
  };
  const start = source.indexOf('  function previewHoveredTemplatePath(');
  const end = source.indexOf('  async function saveDesignAndClose(', start);
  vm.runInNewContext(source.slice(start, end), ctx);
  return {ctx, timers, applied};
}
test('deleting the final artwork replaces the texture and retires the old hover snapshot', async () => {
  const {ctx, timers, applied} = setup();
  const path = {};
  ctx.previewHoveredTemplatePath(path);
  await timers.get(ctx.state.hoverTextureTimer)();
  ctx.scheduleTexturePreviewUpdate();
  assert.equal(ctx.state.hoverMaterialSnapshot, null);
  await timers.get(ctx.state.textureUpdateTimer)();
  ctx.clearHoveredTemplatePreview(path);
  assert.equal(applied.at(-1), 'empty texture');
});
test('an in-flight hover upload cannot reapply deleted artwork or restore an obsolete snapshot', async () => {
  const {ctx, timers, applied} = setup();
  let finishUpload, markStarted;
  const uploadStarted = new Promise(resolve => {markStarted = resolve;});
  ctx.applyTextureToViewer = async (viewer, texture, options) => {
    await new Promise(resolve => {finishUpload = resolve; markStarted();});
    if (options.isCurrent()) applied.push(texture);
  };
  ctx.previewHoveredTemplatePath({});
  const hover = timers.get(ctx.state.hoverTextureTimer)();
  await uploadStarted;
  ctx.scheduleTexturePreviewUpdate();
  await timers.get(ctx.state.textureUpdateTimer)();
  finishUpload(); await hover;
  assert.equal(applied.at(-1), 'empty texture');
  assert.ok(!applied.includes('hover texture'));
});

test('older texture uploads cannot overwrite the current canvas after an image deletion', async () => {
  const applied=[];
  const material={pbrMetallicRoughness:{baseColorTexture:{setTexture:texture=>applied.push(texture)}}};
  const viewer={updateComplete:Promise.resolve(),createTexture(){},model:{materials:[material]},requestUpdate(){}};
  let releaseOld, started;
  const oldStarted=new Promise(resolve=>{started=resolve;});
  const ctx={state:{textureUpdateId:1},designerViewer:viewer,viewerTextureRequests:new WeakMap(),
    createViewerTexture:async (_,url)=>{if(url==='old image') {started();await new Promise(resolve=>{releaseOld=resolve;});}return url;},
    buildPanelMaterialMaps:async()=>null,rememberSurfaceMaps(){},getDesignedTextureFactor:()=>[],
    originalSurfaceMaps:new Map([[material,{}]]),applyFabricSurfaceResponse(){},applyArtworkTextureTransform(){},
    applyDesignedTextureExposure(){},renderStandardPromise:Promise.resolve({}),console};
  const start=source.indexOf('  async function applyTextureToViewer('),end=source.indexOf('  async function applyTextureToModel(',start);
  vm.runInNewContext(source.slice(start,end),ctx);
  const old=ctx.applyTextureToViewer(viewer,'old image');
  await oldStarted;
  ctx.state.textureUpdateId++;
  assert.equal(await ctx.applyTextureToViewer(viewer,'remaining black rectangle'),true);
  releaseOld();
  assert.equal(await old,false);
  assert.deepEqual(applied,['remaining black rectangle']);
});
