const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const template=read('views','dress-designer-landing.ejs');
const partial=read('views','partials','dress-motion.ejs');
const stylesheet=read('public','css','dress-designer-landing.css');
const runtime=read('public','js','dress-designer-landing.js');
const routes=read('routes','index.js');

test('dress landing explains the five-stage journey without loading an editor',()=>{
 const ids=['dress-models','dress-design','dress-export','dress-try-on','dress-production'];
 let last=-1;
 ids.forEach(id=>{const next=template.indexOf(`id="${id}"`);assert.ok(next>last);last=next;});
 assert.doesNotMatch(template+runtime,/<model-viewer|model-viewer\.min|createTexture|toDataURL|dressLoadModel|type="file"/);
 assert.match(template,/toolPage\.modelStarters/);
 assert.match(template,/\/try-on/);
 assert.match(template,/#productionFeatureTitle/);
 assert.match(template,/Export requires Pro or above/);
 assert.match(routes,/getActiveDressModelStarters/);
 assert.match(routes,/Free Online Dress Designer – Create 3D Dress Mockups/);
 assert.match(template,/Online Dress Designer FAQ/);
 assert.match(routes,/'@type': 'ItemList'/);
});

test('motion placements have static reduced-motion and no-JS behavior',()=>{
 assert.equal((template.match(/include\('partials\/dress-motion'/g)||[]).length,1);
 assert.match(template,/<video[^>]+muted loop playsinline/);
 assert.match(template,/class="dress-rotation-poster"/);
 assert.match(partial,/prefers-reduced-motion: reduce/);
 assert.match(partial,/data-poster=/);
 assert.doesNotMatch(partial+runtime,/data-motion-toggle|Pause|Play/);
 assert.match(template,/slice\(0,8\)/);
 assert.match(template,/\/mockups\/dress/);
 assert.match(stylesheet,/var\(--font-family\)/);
 assert.doesNotMatch(stylesheet,/Italiana|DM Sans|#852c36/);
 assert.match(stylesheet,/@media \(max-width: 820px\)/);
 assert.match(stylesheet,/@media \(max-width: 560px\)/);
});

test('rotation video autoplays in view and keeps the poster for reduced motion or failure',async()=>{
 const pref=new EventTarget();pref.matches=false;
 const video=new EventTarget();video.dataset={src:'/rotation.mp4'};video.getAttribute=()=>video.src;
 let plays=0,pauses=0,playing=false;
 video.play=()=>{plays++;return Promise.resolve();};video.pause=()=>{pauses++;};
 const figure={querySelector:()=>video,classList:{add:()=>playing=true,remove:()=>playing=false}};
 const document=new EventTarget();document.hidden=false;
 document.querySelector=()=>({querySelectorAll:s=>s==='[data-dress-video]'?[figure]:[]});
 let observer;
 class Observer{constructor(callback){observer=callback;}observe(){}}
 vm.runInNewContext(runtime,{document,window:{matchMedia:()=>pref,IntersectionObserver:Observer},IntersectionObserver:Observer});
 assert.equal(plays,0);assert.equal(video.src,undefined);
 observer([{isIntersecting:true}]);await Promise.resolve();assert.equal(plays,1);assert.equal(playing,true);assert.equal(video.muted,true);
 pref.matches=true;pref.dispatchEvent(new Event('change'));assert.equal(playing,false);assert.ok(pauses>0);
 pref.matches=false;pref.dispatchEvent(new Event('change'));await Promise.resolve();assert.equal(playing,true);
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(playing,false);
 document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();assert.equal(playing,true);
 video.dispatchEvent(new Event('error'));assert.equal(playing,false);
 const last=plays;observer([{isIntersecting:true}]);assert.equal(plays,last);
});

test('animation respects visibility, reduced motion, and failed requests',()=>{
 const pref=new EventTarget();pref.matches=false;
 const image=new EventTarget();image.loading='eager';image.dataset={animation:'/motion.webp',poster:'/poster.webp'};image.getAttribute=()=>image.src;
 let removed=false;const picture={querySelector:()=>({remove:()=>removed=true})};
 const figure={querySelector:s=>s==='picture'?picture:s==='img'?image:null};
 let observer;
 class Observer {constructor(cb){observer=cb;}observe(){}}
 vm.runInNewContext(runtime,{document:{querySelector:()=>({querySelectorAll:()=>[figure]})},window:{matchMedia:()=>pref,IntersectionObserver:Observer},IntersectionObserver:Observer});
 assert.equal(image.src,'/motion.webp');
 pref.matches=true;pref.dispatchEvent(new Event('change'));assert.equal(image.src,'/poster.webp');
 pref.matches=false;pref.dispatchEvent(new Event('change'));assert.equal(image.src,'/motion.webp');
 observer([{isIntersecting:false}]);assert.equal(image.src,'/poster.webp');
 observer([{isIntersecting:true}]);assert.equal(image.src,'/motion.webp');
 image.dispatchEvent(new Event('error'));assert.equal(image.src,'/poster.webp');assert.equal(removed,true);
 observer([{isIntersecting:true}]);assert.equal(image.src,'/poster.webp');
});

test('hero, design, and try-on assets are real looping animated WebPs with still posters',()=>{
 for(const [base,version] of [['dress-collection','v9'],['dress-design','v9'],['dress-try-on','v9']]){
  const chunks=(file)=>{
   const data=fs.readFileSync(path.join(root,'public','images','dress-designer',file));
   assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
   const found=[];
   for(let offset=12;offset+8<=data.length;){const size=data.readUInt32LE(offset+4);assert.ok(offset+8+size<=data.length);found.push({type:data.toString('ascii',offset,offset+4),payload:data.subarray(offset+8,offset+8+size)});offset+=8+size+(size%2);}
   return found;
  };
  const motion=chunks(`${base}-motion-${version}.webp`);assert.ok(motion.filter(c=>c.type==='ANMF').length>2);
  assert.equal(motion.find(c=>c.type==='ANIM').payload.readUInt16LE(4),0);
  assert.ok(motion.find(c=>c.type==='VP8X').payload[0]&0x10,'transparent alpha must survive animation encoding');
  assert.equal(chunks(`${base}-poster-${version}.webp`).some(c=>c.type==='ANIM'),false);
 }
});

test('silhouette carousel wraps, pauses for browsing, and respects reduced motion',()=>{
 const preference=new EventTarget();preference.matches=false;
 const viewport=new EventTarget();viewport.scrollLeft=0;viewport.contains=()=>false;
 const links=[{tabIndex:0},{tabIndex:0}];
 const duplicate={removeAttribute(){},setAttribute(){},querySelectorAll:()=>links};
 const group={children:[{},{}],cloneNode:()=>duplicate,getBoundingClientRect:()=>({width:2304}),parentNode:{append(){}}};
 viewport.querySelector=()=>group;
 const document=new EventTarget();document.hidden=false;
 document.querySelector=()=>({querySelectorAll:selector=>selector==='[data-dress-carousel]'?[viewport]:[]});
 let observer,now=0,id=0;const frames=new Map();
 class Observer{constructor(callback){observer=callback;}observe(){}}
 const window={matchMedia:()=>preference,IntersectionObserver:Observer,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(runtime,{document,window,IntersectionObserver:Observer,performance:{now:()=>now}});
 const advance=()=>{now+=64;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(now));};
 assert.equal(frames.size,0,'offscreen carousel must stay idle');
 observer([{isIntersecting:true}]);advance();advance();assert.ok(viewport.scrollLeft>0);
 viewport.scrollLeft=2303;viewport.dispatchEvent(new Event('scroll'));advance();
 assert.ok(viewport.scrollLeft<3,'last card must continue into the identical first card without a blank interval');
 const enter=new Event('pointerenter');Object.defineProperty(enter,'pointerType',{value:'mouse'});
 viewport.dispatchEvent(enter);const stopped=viewport.scrollLeft;advance();advance();assert.equal(viewport.scrollLeft,stopped);
 viewport.dispatchEvent(new Event('pointerleave'));advance();assert.ok(viewport.scrollLeft>stopped);
 viewport.dispatchEvent(new Event('focusin'));const focused=viewport.scrollLeft;advance();assert.equal(viewport.scrollLeft,focused);
 preference.matches=true;preference.dispatchEvent(new Event('change'));assert.equal(frames.size,0);assert.equal(duplicate.hidden,true);
 assert.ok(links.every(link=>link.tabIndex===-1),'duplicate links must stay out of keyboard navigation');
});
