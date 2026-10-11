const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../public/js/editor-image-worker.js'),'utf8').replace(/^import .*;$/m,'');

function worker({width=2,height=1,fail=false}={}) {
  const messages=[], loads=[], crops=[];
  const image = (w,h,alpha=128) => ({width:w,height:h,data:Uint8ClampedArray.from({length:Math.min(w*h*4,100000)},(_,i)=>i%4===3?alpha:120), rgba(){return this;}, rgb(){return this;}, clone(){return image(w,h,alpha);}, async resize(w2,h2){return image(w2,h2,alpha);}, async crop(bounds){crops.push(bounds);return image(bounds[2]-bounds[0]+1,bounds[3]-bounds[1]+1,alpha);},toCanvas(){return {};},async toBlob(){return {width:w,height:h,alpha:[...this.data].filter((_,i)=>i%4===3)};}});
  class Canvas {
    constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}
    getContext(){return {drawImage(){},getImageData:()=>({data:this.data}),putImageData: pixels=>{this.data=pixels.data;}};}
    async convertToBlob(){return {width:this.width,height:this.height,alpha:[...this.data].filter((_,i)=>i%4===3)};}
  }
  const self={postMessage:msg=>messages.push(msg)};
  vm.runInNewContext(source,{self,env:{backends:{onnx:{wasm:{}}}},RawImage:{read:async()=>image(width,height)},OffscreenCanvas:Canvas, pipeline:async(task,model,options)=>{loads.push({task,model,dtype:options.dtype});if(fail)throw Error('Download failed');return async input=>task==='image-to-image'?image(input.width*2,input.height*2):[image(width,height,200)];}});
  return {messages,loads,crops,run:(operation,id=1)=>self.onmessage({data:{id,operation,source:'fixture'}})};
}

test('background removal preserves existing source transparency',async()=>{
  const w=worker();await w.run('background');
  assert.deepEqual(w.messages.at(-1).blob.alpha,[100,100]);
  assert.equal(w.loads[0].dtype,'fp16');
  assert.equal(w.loads[0].model,'onnx-community/BEN2-ONNX');
  assert.equal(w.loads[0].task,'background-removal');
});
test('upscale doubles dimensions, keeps alpha and handles partial tiles',async()=>{
  const w=worker({width:129,height:3});await w.run('upscale');
  assert.equal(w.messages.at(-1).blob.width,258);assert.equal(w.messages.at(-1).blob.height,6);
  assert.ok(w.messages.at(-1).blob.alpha.every(alpha=>alpha===128));
  assert.deepEqual(w.crops.map(bounds=>Array.from(bounds)),[[0,0,128,2],[112,0,128,2]]);
});
test('successful pipelines are reused, failed downloads can be retried',async()=>{
  const good=worker();await good.run('background');await good.run('background',2);assert.equal(good.loads.length,1);
  const bad=worker({fail:true});await bad.run('background');await bad.run('background',2);assert.equal(bad.loads.length,2);assert.match(bad.messages.at(-1).error,/Download failed/);
});
test('invalid operations and oversize artwork do not start inference',async()=>{
  const w=worker();await w.run('invalid');assert.match(w.messages.at(-1).error,/Unsupported/);assert.equal(w.loads.length,0);
  const large=worker({width:4097,height:4096});await large.run('upscale');assert.match(large.messages.at(-1).error,/4096/);assert.equal(large.loads.length,0);
});
