import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPngBuffer(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    rawData[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 3;
      const ratioX = x / width;
      const ratioY = y / height;
      rawData[idx] = Math.min(255, Math.max(0, Math.floor(r + ratioX * 20 - ratioY * 20)));
      rawData[idx + 1] = Math.min(255, Math.max(0, Math.floor(g + ratioX * 40)));
      rawData[idx + 2] = Math.min(255, Math.max(0, Math.floor(b + ratioY * 50)));
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);

  const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = zlib.crc32(crcBuf);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

const publicDir = path.resolve('public');

const images = [
  { name: 'og-image.png', w: 1200, h: 630, r: 11, g: 15, b: 25 },
  { name: 'icon-192.png', w: 192, h: 192, r: 59, g: 130, b: 246 },
  { name: 'icon-512.png', w: 512, h: 512, r: 59, g: 130, b: 246 },
  { name: 'apple-touch-icon.png', w: 180, h: 180, r: 59, g: 130, b: 246 },
  { name: 'icon-trade.png', w: 96, h: 96, r: 16, g: 185, b: 129 },
  { name: 'icon-analytics.png', w: 96, h: 96, r: 139, g: 92, b: 246 },
];

for (const img of images) {
  const filePath = path.join(publicDir, img.name);
  const buffer = createPngBuffer(img.w, img.h, img.r, img.g, img.b);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated ${img.name} (${img.w}x${img.h}) at ${filePath}`);
}
