const mimeTypes = {
  css: 'text/css',
  gif: 'image/gif',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'application/javascript',
  json: 'application/json',
  mjs: 'application/javascript',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2'
};

function lookup(value) {
  const ext = String(value || '').split('.').pop().toLowerCase();
  return mimeTypes[ext] || value;
}

function send() {
  throw new Error('send file is not available in the Worker runtime');
}

send.mime = {
  lookup,
  charsets: {
    lookup(type, fallback) {
      return /^text\/|^application\/(javascript|json)/.test(String(type || '')) ? 'UTF-8' : fallback;
    }
  }
};

module.exports = send;
