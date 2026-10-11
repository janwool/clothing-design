// Encode the landing media from selected imagegen commercial design concepts.
// No model-viewer or Blender screenshots are used in the published assets.
const path=require('node:path');
const fs=require('node:fs/promises');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'design-mockups/dress-commercial-v9');
const output=path.join(root,'public/images/dress-designer');
const smooth=t=>t*t*(3-2*t);
async function raw(file,width,height){return sharp(path.join(source,file)).resize(width,height,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).ensureAlpha().raw().toBuffer()}
function blend(a,b,t){const r=Buffer.alloc(a.length);for(let i=0;i<r.length;i++)r[i]=Math.round(a[i]*(1-t)+b[i]*t);return r}
async function animation(base,width,height,frames,delays,poster){
 const file=path.join(output,`${base}-motion-v9.webp`);
 await sharp(Buffer.concat(frames),{raw:{width,height:height*frames.length,channels:4,pageHeight:height}}).webp({quality:84,effort:5,loop:0,delay:delays}).toFile(file);
 await sharp(poster,{raw:{width,height,channels:4}}).webp({quality:92,effort:6}).toFile(path.join(output,`${base}-poster-v9.webp`));
 const meta=await sharp(file,{animated:true}).metadata();
 console.log(JSON.stringify({base,frames:meta.pages,duration:meta.delay.reduce((a,b)=>a+b,0),bytes:(await fs.stat(file)).size}));
}
async function sequence(base,files,width,height,hold,posterIndex){
 const states=await Promise.all(files.map(f=>raw(f,width,height))),frames=[],delays=[];
 for(let i=0;i<states.length;i++){
  frames.push(states[i]);delays.push(hold[i]);
  for(let j=1;j<=10;j++){frames.push(blend(states[i],states[(i+1)%states.length],smooth(j/11)));delays.push(60)}
 }
 await animation(base,width,height,frames,delays,states[posterIndex]);
}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const width=1120,height=700,hero=await raw('collection-hero.png',width,height),frames=[],delays=[];
 // A slow breathing camera move keeps the finished collection readable.
 for(let i=0;i<24;i++){
  const zoom=1+.025*(1-Math.cos(2*Math.PI*i/24))/2,w=Math.round(width*zoom),h=Math.round(height*zoom);
  frames.push(await sharp(hero,{raw:{width,height,channels:4}}).resize(w,h).extract({left:Math.floor((w-width)/2),top:Math.floor((h-height)/2),width,height}).raw().toBuffer());delays.push(200);
 }
 await animation('dress-collection',width,height,frames,delays,hero);
 await sequence('dress-design',['classic-front.png','classic-slate.png','classic-back.png'],720,900,[1400,1600,1400],0);
 const product=await raw('classic-front.png',600,900),person=await raw('classic-try-on.png',600,900);
 // One camera flash reveals the finished look, followed by a long viewing hold.
 const flash=Buffer.alloc(product.length,255);
 await animation('dress-try-on',600,900,[product,flash,blend(flash,person,.65),person,blend(person,product,.5)],[1800,60,60,4200,120],person);
 for(const [file,name] of [['classic-front.png','dress-front'],['classic-back.png','dress-back'],...['classic','tailored','layered','asymmetric','cross-strap','puff-sleeve','lightweight','utility'].map(name=>[`library-${name}.png`,`library-${name}`])]){
  await sharp(path.join(source,file)).resize(900,1125,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:92,effort:6}).toFile(path.join(output,`${name}-v9.webp`));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
