// 홈화면/헤더 공용 아이콘 생성기 (제로 의존성). 512x512 금색 동전.
// 실행: node make-icon.js  → icon.png
const fs = require("fs");
const zlib = require("zlib");

const S = 512;
const cx = S / 2, cy = S / 2;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ₩(원) 표시를 단순 도형으로: 두 개의 V 획 + 가로 두 줄. 좌표는 동전 중심 기준.
function wonMark(px, py, r) {
  // 정규화 좌표 (-1..1)
  const x = (px - cx) / r, y = (py - cy) / r;
  if (Math.abs(x) > 0.62 || y < -0.5 || y > 0.62) return false;
  const t = 0.085; // 획 두께
  // 두 V: 왼쪽 \  /  오른쪽 \  /  → 네 개의 사선
  const lines = [
    [-0.5, -0.45, -0.22, 0.5], [-0.22, 0.5, 0.06, -0.45],   // 왼쪽 V
    [0.06, -0.45, 0.34, 0.5], [0.34, 0.5, 0.5, -0.45],       // 오른쪽 ∧ 비슷
  ];
  for (const [x1, y1, x2, y2] of lines) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let u = ((x - x1) * dx + (y - y1) * dy) / len2;
    u = clamp(u, 0, 1);
    const ddx = x - (x1 + u * dx), ddy = y - (y1 + u * dy);
    if (ddx * ddx + ddy * ddy < t * t) return true;
  }
  // 가로 두 줄
  for (const yy of [-0.05, 0.18]) {
    if (Math.abs(y - yy) < t * 0.8 && Math.abs(x) < 0.5) return true;
  }
  return false;
}

const raw = Buffer.alloc(S * (1 + S * 3));
const coinR = 196, rimIn = 172, rimOut = 196, ring = 150;
for (let y = 0; y < S; y++) {
  raw[y * (1 + S * 3)] = 0;
  for (let x = 0; x < S; x++) {
    const off = y * (1 + S * 3) + 1 + x * 3;
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    let r, g, b;
    if (d > coinR) {
      // 배경: 부드러운 남보라 그라데이션
      const t = (x + y) / (2 * S);
      r = Math.round(lerp(38, 24, t));
      g = Math.round(lerp(34, 22, t));
      b = Math.round(lerp(64, 46, t));
    } else {
      const t = d / coinR;
      // 금색 방사형 (중심 밝음 → 가장자리 진함)
      r = lerp(255, 214, t);
      g = lerp(226, 150, t);
      b = lerp(140, 44, t);
      // 테두리 림(진한 금)
      if (d >= rimIn && d <= rimOut) { r = 188; g = 132; b = 36; }
      // 안쪽 음각 링
      if (Math.abs(d - ring) < 7) { r *= 0.82; g *= 0.82; b *= 0.82; }
      // ₩ 마크 (진한 금 음각)
      if (wonMark(x, y, coinR)) { r = 150; g = 100; b = 24; }
      // 좌상단 스펙큘러 하이라이트
      const nx = dx / coinR, ny = dy / coinR;
      const hl = clamp(-(nx + ny) * 0.6, 0, 1) * (1 - t) * 80;
      r = clamp(r + hl, 0, 255); g = clamp(g + hl, 0, 255); b = clamp(b + hl * 0.7, 0, 255);
    }
    raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync("icon.png", png);
console.log("icon.png 생성됨", png.length, "bytes");
