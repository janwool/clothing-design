const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const start=source.indexOf('  function tintFabricPixels('),end=source.indexOf('  async function getFabricTile(',start);
const ctx={parseColorState:color=>({start:color}),hexToRgbUnit:color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255)};
vm.runInNewContext(source.slice(start,end),ctx);
test('blue denim preserves white fill while keeping weave contrast and alpha',()=>{
 const pixels={data:new Uint8ClampedArray([10,20,60,255,50,70,120,128])};
 ctx.tintFabricPixels(pixels,'#ffffff');
 for(let i=0;i<8;i+=4){assert.equal(pixels.data[i],pixels.data[i+1]);assert.equal(pixels.data[i+1],pixels.data[i+2]);assert.ok(pixels.data[i]>=229);}
 assert.ok(pixels.data[0]<pixels.data[4]);assert.equal(pixels.data[3],255);assert.equal(pixels.data[7],128);
});
test('material sample hue cannot contaminate an existing red fill',()=>{
 const pixels={data:new Uint8ClampedArray([20,40,90,255,20,40,90,255])};
 ctx.tintFabricPixels(pixels,'#ff0000');
 assert.deepEqual([...pixels.data],[255,0,0,255,255,0,0,255]);
});
