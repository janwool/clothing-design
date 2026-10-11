const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');
const start=source.indexOf('  function getPopoverPlacement(');
const end=source.indexOf('  function placeToolbarPopover(',start);
const context={};vm.runInNewContext(source.slice(start,end),context);
for(const [name,area,toolbar,size] of [
 ['large color picker near bottom',{left:0,top:0,right:700,bottom:600},{left:180,top:490,right:490,bottom:535},{width:336,height:560}],
 ['mobile text toolbar',{left:0,top:0,right:390,bottom:420},{left:100,top:170,right:300,bottom:242},{width:280,height:400}],
 ['toolbar near top',{left:0,top:0,right:500,bottom:600},{left:30,top:8,right:470,bottom:52},{width:336,height:560}],
 ['scrolled canvas',{left:310,top:60,right:1080,bottom:850},{left:500,top:500,right:900,bottom:550},{width:230,height:420}]
]) test(name+' keeps the full toolbar visible',()=>{
 const p=context.getPopoverPlacement(area,toolbar,toolbar,size);
 assert.ok(p.left>=area.left && p.left+p.width<=area.right);
 assert.ok(p.top>=area.top && p.top+p.maxHeight<=area.bottom);
 assert.ok(p.left>=toolbar.right+12 || p.left+p.width<=toolbar.left-12 || p.top>=toolbar.bottom+12 || p.top+p.maxHeight<=toolbar.top-12);
});

const fillStart=source.indexOf('  function getFillPopoverPlacement(');
const fillEnd=source.indexOf('\n  function ',fillStart+1);
vm.runInNewContext(source.slice(fillStart,fillEnd),context);
for (const [name,area,anchor,size] of [
 ['desktop',{left:300,top:70,right:1100,bottom:900},{left:1120,top:840,right:1150,bottom:870},{width:336,height:490}],
 ['short canvas',{left:300,top:70,right:1100,bottom:420},{left:1120,top:360,right:1150,bottom:390},{width:336,height:490}],
 ['mobile canvas',{left:0,top:70,right:320,bottom:600},{left:20,top:650,right:50,bottom:680},{width:336,height:490}]
]) test('Fill picker stays inside the canvas to the left of preview: '+name,()=>{
 const p=context.getFillPopoverPlacement(area,size);
 assert.equal(p.left+p.width,area.right-12);
 assert.ok(p.left>=area.left);
 assert.ok(p.top>=area.top+8);
 assert.equal(p.top+p.height,area.bottom-8);
});
test('global Fill uses the canvas container rather than the preview/modal',()=>{
 assert.match(source,/openColorPopover\(appearanceCustomColor, \{\s*container: textureCanvasArea,\s*placement: 'canvas-right'/);
});
