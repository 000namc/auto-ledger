// 앱/헤더 아이콘 생성: 소스 이모지(scripts/icon-src.png, Noto Emoji·Apache2.0)를
// 깔끔한 그라데이션 배경에 합성 → 루트의 icon.png (512x512). 제로 의존성(zlib만).
// 실행: node scripts/make-icon.js [소스png]
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = process.argv[2] || path.join(__dirname, "icon-src.png");
const S = 512;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }

// 최소 PNG 디코더 (8bit RGBA, non-interlaced)
function decodePNG(buf) {
  let p = 8, w, h, bd, ct, il, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len); p += 12 + len;
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; il = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (bd !== 8 || ct !== 6 || il !== 0) throw new Error(`unsupported PNG ${bd}/${ct}/${il}`);
  const rawz = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = rawz[pos++];
    for (let i = 0; i < stride; i++) {
      const x = rawz[pos++];
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = (y > 0 && i >= bpp) ? out[(y - 1) * stride + i - bpp] : 0;
      let v;
      if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else v = x;
      out[y * stride + i] = v & 255;
    }
  }
  return { w, h, data: out };
}
function sample(img, fx, fy) {
  fx = clamp(fx, 0, img.w - 1); fy = clamp(fy, 0, img.h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, img.w - 1), y1 = Math.min(y0 + 1, img.h - 1), tx = fx - x0, ty = fy - y0;
  const g = (xx, yy, k) => img.data[(yy * img.w + xx) * 4 + k], o = [];
  for (let k = 0; k < 4; k++) o[k] = lerp(lerp(g(x0, y0, k), g(x1, y0, k), tx), lerp(g(x0, y1, k), g(x1, y1, k), tx), ty);
  return o;
}

const src = decodePNG(fs.readFileSync(SRC));
const draw = Math.round(S * 0.82), off = (S - draw) / 2; // 여백 두고 가운데
const raw = Buffer.alloc(S * (1 + S * 3));
for (let y = 0; y < S; y++) {
  raw[y * (1 + S * 3)] = 0;
  for (let x = 0; x < S; x++) {
    // 배경: 남보라 대각 그라데이션
    const tg = (x + y) / (2 * S);
    let r = lerp(58, 30, tg), g = lerp(54, 28, tg), b = lerp(96, 58, tg);
    if (x >= off && x < off + draw && y >= off && y < off + draw) {
      const s = sample(src, (x - off) / draw * src.w, (y - off) / draw * src.h), al = s[3] / 255;
      r = s[0] * al + r * (1 - al); g = s[1] * al + g * (1 - al); b = s[2] * al + b * (1 - al);
    }
    const o = y * (1 + S * 3) + 1 + x * 3;
    raw[o] = Math.round(r); raw[o + 1] = Math.round(g); raw[o + 2] = Math.round(b);
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(path.join(ROOT, "icon.png"), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]));
console.log("icon.png 생성됨");
