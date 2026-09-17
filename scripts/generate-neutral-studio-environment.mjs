import fs from 'node:fs';
import path from 'node:path';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  throw new Error('Usage: node scripts/generate-neutral-studio-environment.mjs <input.hdr> <output.hdr>');
}

const inputPath = path.resolve(inputArgument);
const outputPath = path.resolve(outputArgument);
const input = fs.readFileSync(inputPath);
const sourceBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
const image = new HDRLoader().setDataType(FloatType).parse(sourceBuffer);

function encodeChannel(channel) {
  const output = [];
  let index = 0;

  const runLengthAt = (start) => {
    let length = 1;
    while (start + length < channel.length && length < 127 && channel[start + length] === channel[start]) {
      length += 1;
    }
    return length;
  };

  while (index < channel.length) {
    const runLength = runLengthAt(index);
    if (runLength >= 4) {
      output.push(128 + runLength, channel[index]);
      index += runLength;
      continue;
    }

    const literalStart = index;
    index += runLength;
    while (index < channel.length && index - literalStart < 128) {
      const nextRunLength = runLengthAt(index);
      if (nextRunLength >= 4) break;
      index += Math.min(nextRunLength, 128 - (index - literalStart));
    }
    output.push(index - literalStart, ...channel.subarray(literalStart, index));
  }

  return Buffer.from(output);
}

function floatToRgbe(value) {
  if (!Number.isFinite(value) || value <= 1e-32) return [0, 0];
  const exponent = Math.ceil(Math.log2(value));
  const scale = 255 / (2 ** exponent);
  return [Math.max(0, Math.min(255, Math.round(value * scale))), exponent + 128];
}

const scanlines = [];
let sourceRed = 0;
let sourceGreen = 0;
let sourceBlue = 0;
let neutralTotal = 0;

for (let y = 0; y < image.height; y += 1) {
  const channels = Array.from({ length: 4 }, () => new Uint8Array(image.width));
  for (let x = 0; x < image.width; x += 1) {
    const offset = (y * image.width + x) * 4;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const [mantissa, exponent] = floatToRgbe(luminance);

    channels[0][x] = mantissa;
    channels[1][x] = mantissa;
    channels[2][x] = mantissa;
    channels[3][x] = exponent;
    sourceRed += red;
    sourceGreen += green;
    sourceBlue += blue;
    neutralTotal += luminance;
  }

  scanlines.push(Buffer.from([2, 2, image.width >> 8, image.width & 255]));
  channels.forEach((channel) => scanlines.push(encodeChannel(channel)));
}

const header = Buffer.from(
  '#?RADIANCE\n' +
  '# Neutral white-light derivative for camera-relative apparel lighting\n' +
  'FORMAT=32-bit_rle_rgbe\n\n' +
  `-Y ${image.height} +X ${image.width}\n`
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat([header, ...scanlines]));

const pixels = image.width * image.height;
console.log(JSON.stringify({
  input: inputPath,
  output: outputPath,
  width: image.width,
  height: image.height,
  sourceAverageRgb: [sourceRed / pixels, sourceGreen / pixels, sourceBlue / pixels],
  neutralAverageRgb: [neutralTotal / pixels, neutralTotal / pixels, neutralTotal / pixels]
}, null, 2));
