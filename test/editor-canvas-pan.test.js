const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const a=source.indexOf('  function beginCanvasPan('),b=source.indexOf("  textureCanvasArea.addEventListener('pointerdown'",a);
test('fitted canvas pans freely in both directions and accumulates successive drags',()=>{
 const state={canvasPanX:0,canvasPanY:0};const frame={style:{}};const area={style:{},scrollLeft:0,scrollTop:0};let capture,updates=0;
 const ctx={state,textureCanvasFrame:frame,textureCanvasArea:area,positionElementToolbar(){updates++;}};
 vm.runInNewContext(source.slice(a,b),ctx);
 const event={clientX:100,clientY:100,pointerId:2,preventDefault(){}};
 ctx.beginCanvasPan(event,{setPointerCapture(id){capture=id;}});
 ctx.updateCanvasPan({clientX:140,clientY:75});
 assert.equal(frame.style.transform,'translate(40px, -25px)');assert.equal(capture,2);
 ctx.beginCanvasPan(event,{setPointerCapture(){}});ctx.updateCanvasPan({clientX:50,clientY:130});
 assert.equal(frame.style.transform,'translate(-10px, 5px)');
 assert.equal(area.scrollLeft,0);assert.equal(area.scrollTop,0);assert.equal(updates,2);
});
