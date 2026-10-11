const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'),'utf8');

test('appearance controls render without the removed gradient output element',()=>{
 const start=source.indexOf('  function renderAppearanceControls()');
 const end=source.indexOf('\n  function applyAppearanceFill()',start);
 const button={dataset:{fillColor:'#ffffff'},classList:{toggle(name,active){this.active=active;}},setAttribute(name,value){this[name]=value;}};
 const custom={classList:{toggle(name,active){this.active=active;}}};
 const context={state:{fillMode:'solid'},getAppearancePaint:()=> '#ffffff',designAppearancePanel:{querySelectorAll:()=>[button]},appearanceCustomColor:custom};
 vm.runInNewContext(source.slice(start,end)+'\nrenderAppearanceControls();',context);
 assert.equal(button['aria-pressed'],'true');
 assert.equal(custom.classList.active,false);
});

test('selection popovers initialize before image loading or selection callbacks',()=>{
 const initializationEnd=source.indexOf('  const SVG_NS');
 for(const declaration of ['const studioPopover =','const shapesPopover =','let openStudioControl =','let studioAnchor =']) {
  const location=source.indexOf(declaration);
  assert.ok(location>=0 && location<initializationEnd, declaration);
 }
 assert.doesNotMatch(source,/appearanceGradientAngleOutput/);
});
