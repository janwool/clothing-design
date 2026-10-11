const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);}
test('hue drag on white retains hue and moves the handle',()=>{
 const state={colorPicker:{mode:'solid',h:0,s:0,v:1,solidColor:'#ffffff'}};
 const ctx={state,colorPopover:{querySelector:()=>({getBoundingClientRect:()=>({top:10,height:100})})},normalizeHex:x=>x,hsvToHex:()=> '#ffffff',hexToRgb:()=>({r:255,g:255,b:255}),rgbToHsv:()=>({h:0,s:0,v:1}),renderColorPopover(){},applyColorPicker(){}};
 vm.runInNewContext(extract('setActiveColorFromHex')+extract('setPickerHue')+'\nsetPickerHue({clientY:60});',ctx);
 assert.equal(state.colorPicker.h,180);assert.equal(state.colorPicker.solidColor,'#ffffff');
});
test('area drag retains exact pointer coordinates at achromatic edges',()=>{
 const state={colorPicker:{mode:'solid',h:180,s:1,v:1}};
 const ctx={state,colorPopover:{querySelector:()=>({getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})})},normalizeHex:x=>x,hsvToHex:()=> '#000000',renderColorPopover(){},applyColorPicker(){}};
 vm.runInNewContext(extract('setActiveColorFromHex')+extract('updatePickerFromArea')+'\nupdatePickerFromArea({clientX:30,clientY:100});',ctx);
 assert.equal(state.colorPicker.h,180);assert.equal(state.colorPicker.s,.3);assert.equal(state.colorPicker.v,0);
});
