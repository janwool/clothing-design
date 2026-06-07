const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');
const zlib = require('zlib');
const { generateSlug } = require('../lib/slug');

process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
process.env.PORT = process.env.PORT || '3811';

const db = require('../lib/db');
const app = require('../app-core');

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const serverPort = Number(process.env.PORT);
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9227);
const outputDir = path.resolve(__dirname, '..', 'public', 'uploads', 'preview');
const version = process.env.COVER_VERSION || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const onlySlug = process.env.MODEL_SLUG || '';
const modelStatus = process.env.MODEL_STATUS || '';
const onlyMissingCovers = process.env.ONLY_MISSING_COVERS === '1';
const coverPrepareTimeoutMs = Number(process.env.COVER_PREPARE_TIMEOUT_MS || 120000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function waitForHttp(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        await httpJson(url);
        resolve();
      } catch (err) {
        if (Date.now() - startedAt > timeoutMs) {
          reject(err);
          return;
        }
        setTimeout(tick, 250);
      }
    };
    tick();
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
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

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  close() {
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
  }
}

async function createPage(url) {
  const target = await httpJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const cdp = new CdpSocket(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 1500,
    deviceScaleFactor: 1,
    mobile: false
  });
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 0, g: 0, b: 0, a: 0 }
  });
  return cdp;
}

async function evaluate(cdp, expression, timeoutMs = 120000) {
  const result = await withTimeout(cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs
  }), timeoutMs + 5000, 'Runtime.evaluate');
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
  }
  return result.result.value;
}

async function waitForExportFunction(cdp) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    const ready = await evaluate(cdp, 'typeof window.prepareDesignedModelCoverCapture === "function"', 5000);
    if (ready) return;
    await sleep(500);
  }
  throw new Error('Timed out waiting for cover capture function');
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL');
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function analyzePngPixels(buffer) {
  if (!buffer.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Invalid PNG screenshot');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.slice(offset, offset + 4).toString('ascii');
    offset += 4;
    const chunk = buffer.slice(offset, offset + length);
    offset += length + 4;
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  let position = 0;
  let previous = Buffer.alloc(stride);
  let nonTransparent = 0;
  let nonBlack = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const row = Buffer.from(raw.slice(position, position + stride));
    position += stride;

    for (let i = 0; i < stride; i += 1) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = previous[i] || 0;
      const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paethPredictor(left, up, upLeft)) & 255;
    }

    for (let x = 0; x < width; x += 1) {
      const i = x * bytesPerPixel;
      const alpha = colorType === 6 ? row[i + 3] : 255;
      if (alpha <= 8) continue;
      nonTransparent += 1;
      if (row[i] > 10 || row[i + 1] > 10 || row[i + 2] > 10) {
        nonBlack += 1;
      }
    }
    previous = row;
  }

  return { width, height, nonTransparent, nonBlack };
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const server = app.listen(serverPort);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clothing-cover-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
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

    const filters = [
      "file_url IS NOT NULL",
      "file_url != ''"
    ];
    const params = [];
    if (modelStatus) {
      filters.push('status = ?');
      params.push(modelStatus);
    }
    if (onlySlug) {
      filters.push('slug = ?');
      params.push(onlySlug);
    }
    if (onlyMissingCovers) {
      filters.push("(image_url IS NULL OR image_url NOT LIKE ?)");
      params.push(`/uploads/preview/%.webp?v=cover-${version}`);
    }

    const models = await db.all(`
      SELECT id, name, slug, category, file_url
      FROM models_3d
      WHERE ${filters.join(' AND ')}
      ORDER BY id ASC
    `, params);

    let success = 0;
    const failures = [];

    for (const model of models) {
      const categorySlug = generateSlug(model.category, '3d-models');
      const pageUrl = `http://127.0.0.1:${serverPort}/3d-models/${categorySlug}/${model.slug}`;
      const filename = `${model.slug}.webp`;
      const publicPath = `/uploads/preview/${filename}?v=cover-${version}`;
      const outputPath = path.join(outputDir, filename);
      let cdp;

      try {
        console.log(`rendering ${model.id}: ${model.slug}`);
        cdp = await createPage(pageUrl);
        await waitForExportFunction(cdp);
        const clip = await evaluate(
          cdp,
          'window.prepareDesignedModelCoverCapture()',
          coverPrepareTimeoutMs
        );
        const pngScreenshot = await withTimeout(cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: clip.x,
            y: clip.y,
            width: clip.width,
            height: clip.height,
            scale: 1
          },
          fromSurface: true,
          captureBeyondViewport: false
        }), 30000, 'PNG screenshot');
        const pngBuffer = Buffer.from(pngScreenshot.data, 'base64');
        const visibleStats = analyzePngPixels(pngBuffer);
        if (visibleStats.nonTransparent < 50000 || visibleStats.nonBlack < 2500) {
          throw new Error(`render produced too few visible pixels (${JSON.stringify(visibleStats)})`);
        }

        const screenshot = await withTimeout(cdp.send('Page.captureScreenshot', {
          format: 'webp',
          quality: 96,
          clip: {
            x: clip.x,
            y: clip.y,
            width: clip.width,
            height: clip.height,
            scale: 1
          },
          fromSurface: true,
          captureBeyondViewport: false
        }), 30000, 'WebP screenshot');
        await evaluate(cdp, 'window.cleanupDesignedModelCoverCapture?.()', 5000).catch(() => {});
        const buffer = Buffer.from(screenshot.data, 'base64');
        await fs.writeFile(outputPath, buffer);
        await db.run(
          'UPDATE models_3d SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [publicPath, model.id]
        );
        success += 1;
        console.log(`updated ${model.slug} -> ${publicPath}`);
      } catch (err) {
        failures.push({ slug: model.slug, error: err.message });
        console.error(`failed ${model.slug}: ${err.message}`);
      } finally {
        cdp?.close();
      }
    }

    console.log(`Generated ${success}/${models.length} covers.`);
    if (failures.length) {
      console.log('Failures:');
      failures.forEach(item => console.log(`- ${item.slug}: ${item.error}`));
      process.exitCode = 1;
    }
  } finally {
    server.close();
    chrome.kill();
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
