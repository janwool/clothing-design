// Model downloads and inference stay off the editor's main thread.
import { pipeline, RawImage, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
const pipelines = new Map();
let busy = false;

async function getPipeline(operation, id) {
  if (!pipelines.has(operation)) {
    const model = operation === 'upscale' ? 'Xenova/swin2SR-lightweight-x2-64' : 'onnx-community/BEN2-ONNX';
    const pending = pipeline(operation === 'upscale' ? 'image-to-image' : 'background-removal', model, {
      device: 'wasm', dtype: operation === 'background' ? 'fp16' : 'fp32',
      progress_callback: () => self.postMessage({ id, status: 'loading' })
    }).catch(error => { pipelines.delete(operation); throw error; });
    pipelines.set(operation, pending);
  }
  return pipelines.get(operation);
}

self.onmessage = async ({ data: { id, operation, source } }) => {
  if (busy) return self.postMessage({ id, error: 'Another image is being processed.' });
  busy = true;
  try {
    if (!['upscale', 'background'].includes(operation)) throw new Error('Unsupported operation');
    const original = (await RawImage.read(source)).rgba();
    if (original.width * original.height > 4096 * 4096) throw new Error('Use an image smaller than 4096 × 4096.');
    const run = await getPipeline(operation, id);
    self.postMessage({ id, status: 'processing' });
    let output;
    if (operation === 'background') {
      [output] = await run(original);
      output = output.rgba();
      // Never restore pixels that were already transparent in the source.
      const alpha = await original.resize(output.width, output.height);
      for (let i = 3; i < output.data.length; i += 4) output.data[i] = Math.round(output.data[i] * alpha.data[i] / 255);
    } else {
      // Small overlapping tiles bound inference memory for large artwork.
      const canvas = new OffscreenCanvas(original.width * 2, original.height * 2);
      const ctx = canvas.getContext('2d');
      const tileSize = 128, overlap = 16;
      for (let y = 0; y < original.height; y += tileSize) {
        for (let x = 0; x < original.width; x += tileSize) {
          const left = Math.max(0, x - overlap), top = Math.max(0, y - overlap);
          const right = Math.min(original.width, x + tileSize + overlap), bottom = Math.min(original.height, y + tileSize + overlap);
          const tile = await original.crop([left, top, right - 1, bottom - 1]);
          const result = await run(tile.clone().rgb());
          const width = Math.min(tileSize, original.width - x), height = Math.min(tileSize, original.height - y);
          ctx.drawImage(result.toCanvas(), (x - left) * 2, (y - top) * 2, width * 2, height * 2, x * 2, y * 2, width * 2, height * 2);
          self.postMessage({ id, status: 'processing' });
        }
      }
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const alpha = await original.resize(canvas.width, canvas.height);
      for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = alpha.data[i];
      ctx.putImageData(pixels, 0, 0);
      self.postMessage({ id, blob: await canvas.convertToBlob({ type: 'image/png' }) });
      return;
    }
    self.postMessage({ id, blob: await output.toBlob() });
  } catch (error) {
    self.postMessage({ id, error: error.message || 'Image could not be processed.' });
  } finally { busy = false; }
};
