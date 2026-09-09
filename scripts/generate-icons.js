'use strict';

// Minimal from-scratch PNG encoder (no dependencies) used to generate placeholder
// app icons (a solid purple rounded square with a lime circle, matching the brand
// mark in styles.css) at the sizes required for a PWA manifest / app store listing.
// Replace these with a real designed logo before submitting to app stores.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PURPLE = [0x6d, 0x3b, 0xf5];
const LIME = [0xc9, 0xf2, 0x4a];
const OUT_DIR = path.join(__dirname, '..', 'icons');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // no filter for this scanline
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function roundedSquarePixel(size, radiusRatio, padRatio, circleRatio) {
  const radius = size * radiusRatio;
  const pad = size * padRatio;
  const cx = size / 2;
  const cy = size / 2;
  const circleR = (size / 2) * circleRatio;

  function insideRoundedRect(x, y) {
    const left = pad;
    const top = pad;
    const right = size - pad;
    const bottom = size - pad;
    const nx = Math.min(Math.max(x, left + radius), right - radius);
    const ny = Math.min(Math.max(y, top + radius), bottom - radius);
    if (x < left || x > right || y < top || y > bottom) return false;
    const dx = x - nx;
    const dy = y - ny;
    return dx * dx + dy * dy <= radius * radius + 0.5 || (x >= left + radius && x <= right - radius) || (y >= top + radius && y <= bottom - radius);
  }

  return (x, y) => {
    if (!insideRoundedRect(x + 0.5, y + 0.5)) return [0, 0, 0, 0];
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= circleR * circleR) return [...LIME, 255];
    return [...PURPLE, 255];
  };
}

function writeIcon(name, size, { maskable = false } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const padRatio = maskable ? 0.18 : 0.06;
  const radiusRatio = maskable ? 0 : 0.22;
  const pixelFn = roundedSquarePixel(size, radiusRatio, padRatio, 0.32);
  const png = encodePng(size, size, pixelFn);
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`wrote icons/${name} (${size}x${size})`);
}

writeIcon('icon-192.png', 192);
writeIcon('icon-512.png', 512);
writeIcon('icon-512-maskable.png', 512, { maskable: true });
writeIcon('apple-touch-icon.png', 180);
writeIcon('favicon-32.png', 32);
