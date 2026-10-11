const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const start=source.indexOf('  function normalizeElementGeometry('),end=source.indexOf('  function renderElementContent',start);
const ctx={minSize:12};vm.runInNewContext(source.slice(start,end),ctx);
test('element movement permits workspace positions beyond every UV atlas edge',()=>{
 for(const [x,y] of [[-500,-300],[3000,4000]]) {
  const result=ctx.normalizeElementGeometry({x,y,width:400,height:200,rotate:35});
  assert.equal(result.x,x);assert.equal(result.y,y);assert.equal(result.rotate,35);
 }
});
test('geometry retains minimum size and rejects invalid coordinates',()=>{
 const result=ctx.normalizeElementGeometry({x:NaN,y:Infinity,width:2,height:3});
 assert.equal(result.x,0);assert.equal(result.y,0);assert.equal(result.width,12);assert.equal(result.height,12);
});
