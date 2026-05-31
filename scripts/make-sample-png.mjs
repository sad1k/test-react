// Генератор демонстрационного PNG-спрайта (public/assets/sample.png).
//
// Кодирует PNG «вручную» (IHDR + IDAT + IEND, фильтр 0, zlib-deflate),
// чтобы в репозитории был воспроизводимый растровый ассет без бинарных
// зависимостей. Запуск: `npm run make:assets` / `pnpm run make:assets`.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 256;
const HEIGHT = 256;

// --- CRC32 (как требует спецификация PNG) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// --- Рисуем картинку в сырой RGBA-буфер (по байту-фильтру на строку) ---
const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
const cx = WIDTH / 2;
const cy = HEIGHT / 2;

for (let y = 0; y < HEIGHT; y++) {
  const rowStart = y * (WIDTH * 4 + 1);
  raw[rowStart] = 0; // filter: None
  for (let x = 0; x < WIDTH; x++) {
    const i = rowStart + 1 + x * 4;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Фоновый градиент.
    let r = 40 + 180 * (x / WIDTH);
    let g = 60 + 150 * (y / HEIGHT);
    let b = 150 + 80 * Math.sin((x + y) / 40);

    // Жёлтое кольцо.
    if (Math.abs(dist - 92) < 12) {
      r = 255;
      g = 210;
      b = 60;
    }
    // Красный диск в центре.
    if (dist < 52) {
      r = 255;
      g = 80;
      b = 90;
    }

    raw[i] = clamp(r);
    raw[i + 1] = clamp(g);
    raw[i + 2] = clamp(b);
    raw[i + 3] = 255; // полностью непрозрачный
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'assets');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'sample.png');
writeFileSync(outFile, png);

console.log(`✓ sample.png создан: ${WIDTH}×${HEIGHT}, ${png.length} байт → ${outFile}`);
