// Run with Playwright available in NODE_PATH. Uses installed Chrome and local assets only.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/videos/export-templates');
const templates = ['orbit', 'front-back', 'three', 'detail', 'reveal', 'before-after', 'social', 'story'];
const html = `<!doctype html><script type="module" src="/vendor/model-viewer/model-viewer.min.js"></script><script src="/js/model-export-video.js"></script><style>body{margin:0}model-viewer{width:320px;height:240px}</style>${['designed','plain'].map(id => `<model-viewer id="${id}" src="/previews/tshirt-224-review/optimized.glb" loading="eager" reveal="auto" interaction-prompt="none" min-camera-orbit="auto auto 15%" field-of-view="28deg" exposure="1.1" shadow-intensity="0.25" environment-image="/environments/commercial-apparel-studio-v5-front-white-20260917.hdr"></model-viewer>`).join('')}`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
  const file = path.join(root, 'public', decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', ({'.js':'text/javascript','.glb':'model/gltf-binary','.hdr':'application/octet-stream'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    fs.mkdirSync(output, {recursive:true});
    const page = await browser.newPage({viewport:{width:640,height:600}});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => [...document.querySelectorAll('model-viewer')].every(v => v.loaded), null, {timeout:60000});
    for (const key of templates) {
      const result = await page.evaluate(async key => {
        const viewers = [...document.querySelectorAll('model-viewer')];
        const [designed, plain] = viewers;
        designed.model.materials.forEach(m => m.pbrMetallicRoughness.setBaseColorFactor([.12,.42,.39,1]));
        plain.model.materials.forEach(m => m.pbrMetallicRoughness.setBaseColorFactor([.92,.9,.84,1]));
        const dimensions = designed.getDimensions(), center = designed.getBoundingBoxCenter();
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const ctx = canvas.getContext('2d');
        const frame = async progress => {
          const pose = window.ModelExportVideo.sample(key, progress);
          for (const v of viewers) {
            v.cameraTarget = `${center.x + pose.target[0]*dimensions.x}m ${center.y + pose.target[1]*dimensions.y}m ${center.z + pose.target[2]*dimensions.z}m`;
            v.cameraOrbit = `${pose.azimuth}deg ${pose.polar}deg ${pose.distance}%`;
            v.jumpCameraToGoal();
          }
          await Promise.all(viewers.map(v => v.updateComplete));
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const capture = async v => { const img = new Image(); img.src = v.toDataURL('image/png'); await img.decode(); return img; };
          // Finish decoding before painting: captureStream must never see an empty intermediate frame.
          const designedImage = await capture(designed);
          const plainImage = key === 'before-after' ? await capture(plain) : null;
          ctx.fillStyle = '#e8ebf1'; ctx.fillRect(0,0,320,240);
          if (key === 'before-after') {
            ctx.drawImage(plainImage,0,0,320,240);
            ctx.save(); ctx.beginPath(); ctx.rect(0,240*(1-pose.reveal),320,240*pose.reveal); ctx.clip();
            ctx.fillStyle = '#e8ebf1'; ctx.fillRect(0,0,320,240);
            ctx.drawImage(designedImage,0,0,320,240); ctx.restore();
          } else ctx.drawImage(designedImage,0,0,320,240);
        };
        await frame(.4);
        const poster = canvas.toDataURL('image/jpeg',.88).split(',')[1];
        await frame(0);
        const mimeType = ['video/mp4;codecs=avc1','video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error('Chrome with MP4 MediaRecorder support is required.');
        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream,{mimeType,videoBitsPerSecond:350000});
        const chunks = []; recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
        const done = new Promise(resolve => recorder.onstop = resolve);
        recorder.start();
        const started = performance.now(), duration = 8000;
        while(performance.now()-started < duration) await frame(Math.min(1,(performance.now()-started)/duration));
        recorder.stop(); await done; stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks,{type:mimeType});
        const video = await new Promise(resolve => {const reader = new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
        return {video,poster,extension:mimeType.startsWith('video/mp4')?'mp4':'webm'};
      }, key);
      fs.writeFileSync(path.join(output, `${key}.${result.extension}`), Buffer.from(result.video,'base64'));
      fs.writeFileSync(path.join(output, `${key}.jpg`), Buffer.from(result.poster,'base64'));
      console.log(`${key}.${result.extension}`);
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => {console.error(error); server.close(); process.exitCode=1;});
