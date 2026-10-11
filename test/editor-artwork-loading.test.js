const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'), 'utf8');
function loader(fetch) {
  const ctx = {artworkDataCache:new Map(), fetch, window:{UserProjects:{textureUrl:url=>'/proxy?'+url}}, blobToDataUrl:async blob=>blob};
  const start=source.indexOf('  async function resolveArtworkDataUrl('), end=source.indexOf('  async function addArtworkFromSource(',start);
  vm.runInNewContext(source.slice(start,end),ctx);
  return ctx;
}
test('thumbnail preparation and repeated clicks share a single artwork download', async () => {
  let count=0;
  const ctx=loader(async()=>{count++;return {ok:true,blob:async()=> 'data:image/png;base64,AA'};});
  const results=await Promise.all([ctx.resolveArtworkDataUrl('/image.png'),ctx.resolveArtworkDataUrl('/image.png')]);
  assert.equal(results[0],results[1]);
  await ctx.resolveArtworkDataUrl('/image.png');
  assert.equal(count,1);
});
test('a failed preparation is evicted so clicking can retry', async () => {
  let count=0;
  const ctx=loader(async()=>({ok:++count>1,blob:async()=> 'data:image/png;base64,AA'}));
  await assert.rejects(ctx.resolveArtworkDataUrl('/image.png'));
  assert.equal(await ctx.resolveArtworkDataUrl('/image.png'),'data:image/png;base64,AA');
  assert.equal(count,2);
});
test('known thumbnail dimensions insert artwork without another image decode', () => {
  let created, decodeStarted=false;
  const ctx={minSize:12,Image:class {set src(value){decodeStarted=true;}},createElement:(type,options)=>{created={type,...options};},setTool:()=>{},setAssetTrayOpen:()=>{}};
  const start=source.indexOf('  function importArtworkDataUrl('),end=source.indexOf('  function blobToDataUrl(',start);
  vm.runInNewContext(source.slice(start,end),ctx);
  assert.equal(ctx.importArtworkDataUrl('data:image/png;base64,AA',{width:1000,height:500}),true);
  assert.equal(created.width,190);assert.equal(created.height,95);
  assert.equal(decodeStarted,false);
});
