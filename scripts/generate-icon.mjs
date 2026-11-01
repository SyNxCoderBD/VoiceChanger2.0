import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const samplesPerAxis = 4;
const palette = {
  background: [16, 93, 75],
  light: [223, 243, 232],
  accent: [247, 189, 113]
};

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, left + width - radius));
  const nearestY = Math.max(top + radius, Math.min(y, top + height - radius));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function pixelColor(x, y, size) {
  const scale = size / 256;
  if (!insideRoundedRect(x, y, 8 * scale, 8 * scale, 240 * scale, 240 * scale, 54 * scale)) return null;
  const bars = [
    [40, 104, 18, 48, palette.light],
    [84, 80, 18, 96, palette.light],
    [119, 52, 18, 152, palette.accent],
    [154, 80, 18, 96, palette.light],
    [198, 104, 18, 48, palette.light]
  ];
  for (const [left, top, width, height, color] of bars) {
    if (insideRoundedRect(x, y, left * scale, top * scale, width * scale, height * scale, 9 * scale)) return color;
  }
  return palette.background;
}

function makePng(size) {
  const rowLength = size * 4 + 1;
  const pixels = Buffer.alloc(rowLength * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * rowLength;
    pixels[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let coverage = 0;
      for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
        for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
          const pointX = (x + (sampleX + 0.5) / samplesPerAxis) * 256 / size;
          const pointY = (y + (sampleY + 0.5) / samplesPerAxis) * 256 / size;
          const color = pixelColor(pointX, pointY, size);
          if (!color) continue;
          red += color[0];
          green += color[1];
          blue += color[2];
          coverage += 1;
        }
      }
      const offset = rowStart + 1 + x * 4;
      if (coverage > 0) {
        pixels[offset] = Math.round(red / coverage);
        pixels[offset + 1] = Math.round(green / coverage);
        pixels[offset + 2] = Math.round(blue / coverage);
        pixels[offset + 3] = Math.round(coverage * 255 / samplesPerAxis ** 2);
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

const images = sizes.map((size) => makePng(size));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
const entries = Buffer.alloc(images.length * 16);
let imageOffset = header.length + entries.length;

images.forEach((image, index) => {
  const size = sizes[index];
  const offset = index * 16;
  entries[offset] = size === 256 ? 0 : size;
  entries[offset + 1] = size === 256 ? 0 : size;
  entries.writeUInt16LE(1, offset + 4);
  entries.writeUInt16LE(32, offset + 6);
  entries.writeUInt32LE(image.length, offset + 8);
  entries.writeUInt32LE(imageOffset, offset + 12);
  imageOffset += image.length;
});

const output = resolve(root, 'assets/icon.ico');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, entries, ...images]));
console.log(`Generated ${output} with ${sizes.length} resolutions.`);