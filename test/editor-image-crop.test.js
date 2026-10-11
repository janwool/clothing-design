const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const transforms=require('../public/js/editor-transform.js');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const ctx={minSize:12,placeRectAtFixedAnchor:transforms.placeRectAtFixedAnchor};
const start=source.indexOf('  function cropImageFromPointer('),end=source.indexOf('  function renderElementContent(',start);
vm.runInNewContext(source.slice(start,end),ctx);
const initial={x:100,y:200,width:200,height:100,imageWidth:200,imageHeight:100,cropX:0,cropY:0,rotate:0};
test('side handles crop without changing source size and can restore hidden pixels',()=>{
 const cropped=ctx.cropImageFromPointer(initial,'w',40,0);
 assert.equal(cropped.width,160);assert.equal(cropped.x,140);assert.equal(cropped.cropX,40);
 assert.equal(cropped.imageWidth,200);assert.equal(cropped.imageHeight,100);
 const restored=ctx.cropImageFromPointer(cropped,'w',-500,0);
 assert.equal(restored.width,200);assert.equal(restored.cropX,0);assert.equal(restored.x,100);
});
test('cropping stays inside the source and retains a usable minimum frame',()=>{
 assert.equal(ctx.cropImageFromPointer(initial,'e',1000,0).width,200);
 assert.equal(ctx.cropImageFromPointer(initial,'s',0,1000).height,100);
 assert.equal(ctx.cropImageFromPointer(initial,'n',0,1000).height,12);
 assert.equal(ctx.cropImageFromPointer(initial,'w',1000,0).width,12);
});
test('rotated crop keeps the visible image pixels at their original canvas positions',()=>{
 const data={...initial,rotate:37};
 const angle=37*Math.PI/180;
 const cropped=ctx.cropImageFromPointer(data,'w',40*Math.cos(angle),40*Math.sin(angle));
 const before=transforms.elementPointToSvg(data,80,30);
 const after=transforms.elementPointToSvg(cropped,80-cropped.cropX,30-cropped.cropY);
 assert.ok(Math.abs(before.x-after.x)<1e-8);assert.ok(Math.abs(before.y-after.y)<1e-8);
});
