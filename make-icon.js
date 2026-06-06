// 홈화면 아이콘 생성기 (제로 의존성). 512x512, 그라데이션 배경 + 중앙 원.
// 실행: node make-icon.js  → icon.png
const fs = require("fs");
const zlib = require("zlib");

const S = 512;
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// 픽셀 채우기
const raw = Buffer.alloc(S * (1 + S * 3));
for (let y = 0; y < S; y++) {
  raw[y * (1 + S * 3)] = 0; // filter byte
  for (let x = 0; x < S; x++) {
    // 대각 그라데이션 (남색 → 보라)
    const t = (x + y) / (2 * S);
    let r = Math.round(40 + t * 68);   // 0x28→0x6c
    let g = Math.round(50 + t * 90);   // 0x32→0x8c
    let b = Math.round(120 + t * 135); // 0x78→0xff
    // 중앙 원(밝은 점) — 가계부 느낌의 동전
    const dx = x - S / 2, dy = y - S / 2;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 150) { r = 245; g = 215; b = 90; }       // 금색 원
    else if (d < 165) { r = 255; g = 255; b = 255; } // 흰 테두리
    const off = y * (1 + S * 3) + 1 + x * 3;
    raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // color type RGB
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync("icon.png", png);
console.log("icon.png 생성됨", png.length, "bytes");
