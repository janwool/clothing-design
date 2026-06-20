const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
process.env.PORT = process.env.PORT || '3812';

const app = require('../app-core');

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const serverPort = Number(process.env.PORT);
const debugPort = Number(process.env.MOCKUP_CHROME_DEBUG_PORT || 9231);
const baseUrl = `http://127.0.0.1:${serverPort}`;
const outputDir = path.resolve(__dirname, '..', 'public', 'images', 'mockups');
const renderDir = path.join(outputDir, '.render-html');

const asset = (url) => `${baseUrl}${url}`;

const garments = {
  tee: {
    name: 'T-shirt',
    preview: '/uploads/preview/t-shirt-mockup-3d-model-01-aa09ae0d.webp',
    texture: '/uploads/texture/t-shirt-mockup-3d-model-01-aa09ae0d.svg'
  },
  teeBasic: {
    name: 'Boxy tee',
    preview: '/uploads/preview/basic-short-sleeve-tshirt-3d-model.webp',
    texture: '/uploads/texture/basic-short-sleeve-tshirt-3d-model.svg'
  },
  hoodie: {
    name: 'Hoodie',
    preview: '/uploads/preview/hoodie-mockup-3d-model-04-e77e8039.webp',
    texture: '/uploads/texture/hoodie-mockup-3d-model-04-e77e8039.svg'
  },
  hoodieAlt: {
    name: 'Pullover hoodie',
    preview: '/uploads/preview/hoodie-mockup-3d-model-02-a413536b.webp',
    texture: '/uploads/texture/hoodie-mockup-3d-model-02-a413536b.svg'
  },
  jacket: {
    name: 'Jacket',
    preview: '/uploads/preview/jacket-3d-model-02-c70928e8.webp',
    texture: '/uploads/texture/jacket-3d-model-02-c70928e8.svg'
  },
  dress: {
    name: 'Dress',
    preview: '/uploads/preview/dress-3d-model-06-29e39d9a.webp',
    texture: '/uploads/texture/dress-3d-model-06-29e39d9a.svg'
  }
};

const scenes = [
  {
    file: 't-shirt-mockup-generator.webp',
    title: 'T-shirt mockup builder',
    subtitle: 'Front graphic placement, colorways, UV check, export-ready product image.',
    mode: 'tool',
    hero: { garment: 'tee', color: '#f4efe6', mark: 'CLOZ', accent: '#111827' },
    cards: [
      { garment: 'tee', color: '#f4efe6', mark: 'Front logo', accent: '#111827' },
      { garment: 'teeBasic', color: '#dbeafe', mark: 'Sky variant', accent: '#1d4ed8' },
      { garment: 'tee', color: '#fef3c7', mark: 'Back print', accent: '#b45309' }
    ],
    metrics: ['Transparent WebP', 'Front/back views', 'POD-ready crop']
  },
  {
    file: 'hoodie-mockup-generator.webp',
    title: 'Hoodie mockup system',
    subtitle: 'Chest art, sleeve marks, fleece texture notes, and listing previews.',
    mode: 'tool',
    hero: { garment: 'hoodie', color: '#f7f2ea', mark: 'DROP', accent: '#111827' },
    cards: [
      { garment: 'hoodie', color: '#f7f2ea', mark: 'Chest print', accent: '#111827' },
      { garment: 'hoodieAlt', color: '#e0f2fe', mark: 'Sleeve mark', accent: '#0369a1' },
      { garment: 'hoodie', color: '#fce7f3', mark: 'Back art', accent: '#be185d' }
    ],
    metrics: ['Streetwear fit', 'Fleece folds', 'Store listing crop']
  },
  {
    file: 'clothing-mockup-generator.webp',
    title: '3D clothing mockup board',
    subtitle: 'One apparel workflow across tees, hoodies, jackets, and dresses.',
    mode: 'grid',
    cards: [
      { garment: 'tee', color: '#f4efe6', mark: 'TEE', accent: '#111827' },
      { garment: 'hoodie', color: '#e0f2fe', mark: 'HOOD', accent: '#0369a1' },
      { garment: 'jacket', color: '#fff7ed', mark: 'DROP', accent: '#c2410c' },
      { garment: 'dress', color: '#fdf2f8', mark: 'LOOK', accent: '#be185d' }
    ],
    metrics: ['Model-based', 'UV-aware', 'Category pages']
  },
  {
    file: 'bulk-t-shirt-mockup-generator.webp',
    title: 'Bulk T-shirt colorway matrix',
    subtitle: 'Batch visual planning for merch drops, POD variants, and catalog reviews.',
    mode: 'bulk',
    cards: [
      { garment: 'tee', color: '#f4efe6', mark: 'A01', accent: '#111827' },
      { garment: 'tee', color: '#dbeafe', mark: 'A02', accent: '#1d4ed8' },
      { garment: 'teeBasic', color: '#fef3c7', mark: 'A03', accent: '#b45309' },
      { garment: 'tee', color: '#dcfce7', mark: 'A04', accent: '#15803d' },
      { garment: 'teeBasic', color: '#fce7f3', mark: 'A05', accent: '#be185d' },
      { garment: 'tee', color: '#e5e7eb', mark: 'A06', accent: '#374151' }
    ],
    metrics: ['6 variants', 'One artwork set', 'Listing consistency']
  },
  {
    file: 'print-on-demand-mockup-generator.webp',
    title: 'POD listing image kit',
    subtitle: 'Create Shopify, Etsy, and merch catalog visuals from apparel mockups.',
    mode: 'commerce',
    cards: [
      { garment: 'tee', color: '#f4efe6', mark: 'SELL', accent: '#111827' },
      { garment: 'teeBasic', color: '#ecfccb', mark: 'POD', accent: '#3f6212' },
      { garment: 'hoodie', color: '#eef2ff', mark: 'MERCH', accent: '#4338ca' }
    ],
    metrics: ['Main image', 'Variant set', 'Marketplace crop']
  },
  {
    file: 'mockup-workflow.webp',
    title: 'Mockup workflow',
    subtitle: 'Choose model, place artwork, inspect UV fit, export product visuals.',
    mode: 'workflow',
    cards: [
      { garment: 'tee', color: '#f4efe6', mark: '01', accent: '#111827', label: 'Choose model' },
      { garment: 'hoodie', color: '#e0f2fe', mark: '02', accent: '#0369a1', label: 'Place artwork' },
      { garment: 'jacket', color: '#fff7ed', mark: '03', accent: '#c2410c', label: 'Preview fit' },
      { garment: 'dress', color: '#fdf2f8', mark: '04', accent: '#be185d', label: 'Export render' }
    ],
    metrics: ['Garment model', 'UV texture', 'WebP export']
  }
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function swatchStyle(item) {
  return `--garment:${item.color};--accent:${item.accent}`;
}

function garmentCard(item, options = {}) {
  const garment = garments[item.garment];
  const label = item.label || garment.name;
  const className = options.compact ? 'garment-card compact' : 'garment-card';
  return `
    <article class="${className}" style="${swatchStyle(item)}">
      <div class="garment-stage">
        <img class="garment-img" src="${asset(garment.preview)}" alt="${escapeHtml(label)}">
        <div class="print-mark">${escapeHtml(item.mark)}</div>
      </div>
      <div class="card-meta">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(item.mark)}</b>
      </div>
    </article>`;
}

function uvPanel(item) {
  const garment = garments[item.garment];
  return `
    <aside class="uv-panel" style="${swatchStyle(item)}">
      <div class="panel-head">
        <span>UV placement</span>
        <b>${escapeHtml(garment.name)}</b>
      </div>
      <div class="uv-canvas">
        <img src="${asset(garment.texture)}" alt="${escapeHtml(garment.name)} UV texture">
        <div class="uv-art art-a">${escapeHtml(item.mark.slice(0, 4))}</div>
        <div class="uv-art art-b"></div>
      </div>
      <div class="layer-list">
        <span>Base garment</span>
        <span>Artwork layer</span>
        <span>Export crop</span>
      </div>
    </aside>`;
}

function listingCard(item, index) {
  const garment = garments[item.garment];
  return `
    <article class="listing-card" style="${swatchStyle(item)}">
      <div class="listing-image">
        <img class="garment-img" src="${asset(garment.preview)}" alt="${escapeHtml(garment.name)} listing">
        <div class="print-mark">${escapeHtml(item.mark)}</div>
      </div>
      <div class="listing-copy">
        <b>${index === 0 ? 'Main product image' : `Variant ${index + 1}`}</b>
        <span>${escapeHtml(garment.name)} mockup</span>
        <small>1200 x 1600 crop</small>
      </div>
    </article>`;
}

function metrics(scene) {
  return `<div class="metrics">${scene.metrics.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

function toolLayout(scene) {
  const hero = scene.hero || scene.cards[0];
  return `
    <main class="canvas tool-layout">
      <section class="copy-block">
        <p class="eyebrow">CLOZ mockup content</p>
        <h1>${escapeHtml(scene.title)}</h1>
        <p>${escapeHtml(scene.subtitle)}</p>
        ${metrics(scene)}
      </section>
      <section class="primary-board">
        ${garmentCard(hero)}
        ${uvPanel(hero)}
      </section>
      <section class="mini-row">
        ${scene.cards.map(card => garmentCard(card, { compact: true })).join('')}
      </section>
    </main>`;
}

function gridLayout(scene) {
  return `
    <main class="canvas grid-layout">
      <section class="copy-block">
        <p class="eyebrow">Apparel-first mockups</p>
        <h1>${escapeHtml(scene.title)}</h1>
        <p>${escapeHtml(scene.subtitle)}</p>
        ${metrics(scene)}
      </section>
      <section class="category-grid">
        ${scene.cards.map(card => garmentCard(card, { compact: true })).join('')}
      </section>
      ${uvPanel(scene.cards[0])}
    </main>`;
}

function bulkLayout(scene) {
  return `
    <main class="canvas bulk-layout">
      <section class="copy-block">
        <p class="eyebrow">Batch mockup planning</p>
        <h1>${escapeHtml(scene.title)}</h1>
        <p>${escapeHtml(scene.subtitle)}</p>
        ${metrics(scene)}
      </section>
      <section class="bulk-grid">
        ${scene.cards.map(card => garmentCard(card, { compact: true })).join('')}
      </section>
      <aside class="batch-panel">
        <span>Batch export queue</span>
        <b>6 mockups</b>
        <div class="progress"><i></i></div>
        <small>Consistent framing for product variants</small>
      </aside>
    </main>`;
}

function commerceLayout(scene) {
  return `
    <main class="canvas commerce-layout">
      <section class="copy-block">
        <p class="eyebrow">Print-on-demand visuals</p>
        <h1>${escapeHtml(scene.title)}</h1>
        <p>${escapeHtml(scene.subtitle)}</p>
        ${metrics(scene)}
      </section>
      <section class="listing-grid">
        ${scene.cards.map((card, index) => listingCard(card, index)).join('')}
      </section>
      <aside class="store-panel">
        <b>Listing checklist</b>
        <span>Main image</span>
        <span>Color variants</span>
        <span>Detail crop</span>
        <span>Marketplace cover</span>
      </aside>
    </main>`;
}

function workflowLayout(scene) {
  return `
    <main class="canvas workflow-layout">
      <section class="copy-block">
        <p class="eyebrow">Model to mockup</p>
        <h1>${escapeHtml(scene.title)}</h1>
        <p>${escapeHtml(scene.subtitle)}</p>
        ${metrics(scene)}
      </section>
      <section class="workflow-steps">
        ${scene.cards.map(card => garmentCard(card, { compact: true })).join('<i class="arrow"></i>')}
      </section>
      ${uvPanel(scene.cards[1])}
    </main>`;
}

function buildSceneHtml(scene) {
  const body = {
    tool: toolLayout,
    grid: gridLayout,
    bulk: bulkLayout,
    commerce: commerceLayout,
    workflow: workflowLayout
  }[scene.mode](scene);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(scene.title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#eef1f4;color:#17202a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.canvas{width:1200px;height:720px;overflow:hidden;display:grid;gap:24px;padding:34px;background:linear-gradient(135deg,#f9fafb 0%,#edf2f7 58%,#e7edf4 100%)}
.copy-block{align-self:start}
.eyebrow{margin:0 0 12px;color:#0f766e;text-transform:uppercase;font-size:13px;font-weight:800;letter-spacing:.08em}
h1{margin:0;max-width:510px;font-size:45px;line-height:1.02;letter-spacing:0;font-weight:850;color:#111827}
p{margin:15px 0 0;max-width:440px;color:#4b5563;font-size:18px;line-height:1.48}
.metrics{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.metrics span{padding:8px 11px;border:1px solid #d4dce6;border-radius:6px;background:rgba(255,255,255,.7);font-size:13px;font-weight:750;color:#334155}
.garment-card,.uv-panel,.listing-card,.batch-panel,.store-panel{border:1px solid #d9e0e8;border-radius:8px;background:rgba(255,255,255,.88);box-shadow:0 18px 60px rgba(25,38,52,.12)}
.garment-card{padding:14px}
.garment-stage,.listing-image{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:radial-gradient(circle at 50% 42%,#334155 0%,#111827 44%,#020617 100%)}
.garment-stage{height:310px}
.garment-stage::before,.listing-image::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,var(--garment),transparent 58%);opacity:.18}
.garment-img{position:relative;max-width:92%;max-height:96%;object-fit:contain;filter:contrast(1.18) saturate(.96) drop-shadow(0 20px 22px rgba(0,0,0,.38))}
.print-mark{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);min-width:82px;padding:10px 14px;border-radius:5px;background:var(--accent);color:white;text-align:center;font-size:22px;font-weight:900;letter-spacing:0;box-shadow:0 10px 24px rgba(17,24,39,.25)}
.card-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;font-size:14px;color:#64748b}
.card-meta b{color:#111827}
.compact{padding:10px}
.compact .garment-stage{height:188px}
.compact .print-mark{min-width:52px;padding:7px 9px;font-size:15px}
.compact .card-meta{font-size:12px}
.uv-panel{padding:16px}
.panel-head{display:flex;justify-content:space-between;color:#475569;font-size:13px;font-weight:750}
.panel-head b{color:#111827}
.uv-canvas{position:relative;height:245px;margin-top:13px;border:1px dashed #bac7d5;border-radius:6px;background:#fbfdff;overflow:hidden}
.uv-canvas img{width:100%;height:100%;object-fit:cover;opacity:.42;filter:contrast(1.1)}
.uv-art{position:absolute;background:var(--accent);color:#fff;font-weight:900;text-align:center;border-radius:5px}
.art-a{left:18%;top:55%;width:82px;padding:12px 8px}
.art-b{right:18%;top:34%;width:54px;height:54px;border-radius:50%}
.layer-list{display:grid;grid-template-columns:1fr;gap:7px;margin-top:12px}
.layer-list span,.store-panel span{padding:8px 10px;border-radius:5px;background:#f3f6fa;color:#475569;font-size:13px;font-weight:700}
.tool-layout{grid-template-columns:420px 1fr;grid-template-rows:1fr 230px}
.tool-layout .copy-block{grid-row:1/3}
.primary-board{display:grid;grid-template-columns:1.05fr .95fr;gap:18px}
.mini-row{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.grid-layout{grid-template-columns:390px 1fr 270px;align-items:stretch}
.category-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.grid-layout .uv-panel{align-self:center}
.bulk-layout{grid-template-columns:360px 1fr 250px;align-items:center}
.bulk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.batch-panel{padding:18px;display:grid;gap:13px}
.batch-panel span,.batch-panel small{color:#64748b;font-size:14px;font-weight:700}
.batch-panel b{font-size:36px;color:#111827}
.progress{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden}
.progress i{display:block;width:78%;height:100%;background:#0f766e}
.commerce-layout{grid-template-columns:360px 1fr 230px;align-items:center}
.listing-grid{display:grid;grid-template-columns:1.2fr .9fr;grid-template-rows:repeat(2,1fr);gap:16px}
.listing-card:first-child{grid-row:1/3}
.listing-card{overflow:hidden}
.listing-image{height:210px;border-radius:8px 8px 0 0}
.listing-card:first-child .listing-image{height:420px}
.listing-copy{display:grid;gap:4px;padding:12px 14px}
.listing-copy b{font-size:15px}
.listing-copy span,.listing-copy small{color:#64748b;font-size:13px}
.store-panel{display:grid;gap:10px;padding:16px}
.store-panel b{font-size:18px}
.workflow-layout{grid-template-columns:350px 1fr 260px;align-items:center}
.workflow-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:center}
.arrow{width:24px;height:2px;background:#94a3b8;margin-left:-18px;margin-right:-18px;z-index:2}
.workflow-steps .garment-card{min-width:0}
.workflow-steps .compact .garment-stage{height:260px}
</style>
</head>
<body>${body}</body>
</html>`;
}

function httpJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${options.method || 'GET'} ${url} failed with ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

class CdpSocket {
  constructor(webSocketUrl) {
    this.url = new URL(webSocketUrl);
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const request = [
        `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
        `Host: ${this.url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        ''
      ].join('\r\n');

      this.socket = net.connect(Number(this.url.port), this.url.hostname, () => {
        this.socket.write(request);
      });

      let handshake = Buffer.alloc(0);
      const onHandshakeData = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const end = handshake.indexOf('\r\n\r\n');
        if (end === -1) return;
        const header = handshake.slice(0, end).toString('utf8');
        if (!header.includes(' 101 ')) {
          reject(new Error(`Chrome websocket handshake failed: ${header}`));
          return;
        }
        this.socket.off('data', onHandshakeData);
        const rest = handshake.slice(end + 4);
        this.socket.on('data', data => this.handleData(data));
        this.socket.on('error', err => this.rejectAll(err));
        this.socket.on('close', () => this.rejectAll(new Error('Chrome websocket closed')));
        if (rest.length) this.handleData(rest);
        resolve();
      };

      this.socket.on('data', onHandshakeData);
      this.socket.on('error', reject);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(this.encodeFrame(Buffer.from(payload)));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  encodeFrame(payload) {
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    return Buffer.concat([header, mask, masked]);
  }

  handleData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 2) {
      const second = this.buffer[1];
      let offset = 2;
      let length = second & 0x7f;
      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        length = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }
      const masked = Boolean(second & 0x80);
      const mask = masked ? this.buffer.slice(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      const opcode = this.buffer[0] & 0x0f;
      let payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);
      if (masked) {
        payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
      }
      if (opcode === 0x8) {
        this.close();
        return;
      }
      this.handleMessage(payload.toString('utf8'));
    }
  }

  handleMessage(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (err) {
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || 'CDP command failed'));
    } else {
      pending.resolve(message.result);
    }
  }

  rejectAll(err) {
    for (const pending of this.pending.values()) pending.reject(err);
    this.pending.clear();
  }

  close() {
    if (this.socket) this.socket.destroy();
  }
}

async function waitForHttp(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await httpJson(url);
      return;
    } catch (err) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function createPage(url) {
  const target = await httpJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const cdp = new CdpSocket(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false
  });
  return cdp;
}

async function evaluate(cdp, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    }
    if (result.result.value) return result.result.value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out evaluating ${expression}`);
}

async function renderScene(scene) {
  const pageName = `${path.basename(scene.file, path.extname(scene.file))}.html`;
  await fs.writeFile(path.join(renderDir, pageName), buildSceneHtml(scene));
  const cdp = await createPage(`${baseUrl}/images/mockups/.render-html/${pageName}`);
  try {
    await evaluate(cdp, 'document.fonts.ready.then(() => true)');
    await evaluate(cdp, 'Promise.all(Array.from(document.images).map(img => img.complete ? true : new Promise(resolve => { img.onload = img.onerror = () => resolve(true); }))).then(() => true)');
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 94,
      clip: { x: 0, y: 0, width: 1200, height: 720, scale: 1 },
      fromSurface: true,
      captureBeyondViewport: false
    });
    await fs.writeFile(path.join(outputDir, scene.file), Buffer.from(screenshot.data, 'base64'));
    console.log(`Generated ${scene.file}`);
  } finally {
    cdp.close();
  }
}

async function main() {
  await fs.mkdir(renderDir, { recursive: true });

  const server = app.listen(serverPort);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloz-mockup-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  chrome.stderr.on('data', chunk => {
    const text = chunk.toString();
    if (/error|failed/i.test(text) && !/DevTools/i.test(text)) process.stderr.write(text);
  });

  try {
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    for (const scene of scenes) {
      await renderScene(scene);
    }
  } finally {
    server.close();
    chrome.kill();
    await fs.rm(renderDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
