// Draws Nion's home-screen icons (a quiet ring with a dot, like its waiting icon)
// as PNG files, with no extra packages. Run it with: node scripts/make-icons.mjs
// The results are saved in public/icons/, and are committed, so you only need to
// run this if you want to change the design.

import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/icons/", import.meta.url);

// Colours: near-black background, soft grey ring and dot (Nion's monotone look).
const BG = [20, 22, 29];
const INK = [226, 228, 236];

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size, draw) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // first byte 0 = "no filter"
    for (let x = 0; x < size; x++) {
      // 3 x 3 samples per pixel makes the edges smooth.
      let coverage = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) coverage += draw((x + (sx + 0.5) / 3) / size, (y + (sy + 0.5) / 3) / size);
      coverage /= 9;
      for (let c = 0; c < 3; c++) row[1 + x * 4 + c] = Math.round(BG[c] + (INK[c] - BG[c]) * coverage);
      row[1 + x * 4 + 3] = 255;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, colour with transparency
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Positions are fractions of the icon (0 to 1). The ring and dot stay well inside the
// middle 60%, so the icon still looks right when a phone crops it to a circle or rounded square.
const ring = (u, v) => (Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.22) < 0.035 ? 1 : 0);
const dot = (u, v) => (Math.hypot(u - 0.5, v - 0.5) < 0.05 ? 1 : 0);
const icon = (u, v) => Math.max(ring(u, v), dot(u, v));

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(new URL(name, OUT), png(size, icon));
  console.log("wrote public/icons/" + name);
}
