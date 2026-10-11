const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const start=source.indexOf('  function handleCanvasWheel('),end=source.indexOf("  textureCanvasArea.addEventListener('wheel'",start);
function setup(){
 const state={zoom:1,canvasPanX:10,canvasPanY:20};let prevented=0;
 const ctx={state,textureSvg:{getScreenCTM:()=>({})},textureCanvasArea:{clientHeight:600},textureCanvasFrame:{style:{}},svgPoint:e=>{const x=(e.clientX-state.canvasPanX)/state.zoom,y=(e.clientY-state.canvasPanY)/state.zoom;return {matrixTransform:()=>({x:x*state.zoom+state.canvasPanX,y:y*state.zoom+state.canvasPanY})};},applyCanvasZoom:z=>{state.zoom=z;},positionElementToolbar(){}};
 vm.runInNewContext(source.slice(start,end),ctx);
 return {ctx,state,event:{target:{closest:()=>false},deltaMode:0,deltaY:-100,clientX:110,clientY:220,preventDefault(){prevented++;}},prevented:()=>prevented};
}
test('wheel zoom preserves the canvas point under the cursor',()=>{
 const {ctx,state,event,prevented}=setup();ctx.handleCanvasWheel(event);
 assert.ok(state.zoom>1);assert.ok(Math.abs(100*state.zoom+state.canvasPanX-110)<1e-9);assert.ok(Math.abs(200*state.zoom+state.canvasPanY-220)<1e-9);assert.equal(prevented(),1);
});
test('wheel over a tool popover does not zoom or prevent its scrolling',()=>{
 const {ctx,state,event,prevented}=setup();event.target.closest=()=>true;ctx.handleCanvasWheel(event);assert.equal(state.zoom,1);assert.equal(prevented(),0);
});
test('zoom stays within limits and supports line-mode wheel events',()=>{
 const {ctx,state,event}=setup();event.deltaMode=1;event.deltaY=-10000;ctx.handleCanvasWheel(event);assert.equal(state.zoom,2.5);event.deltaY=10000;ctx.handleCanvasWheel(event);assert.equal(state.zoom,.2);
});
