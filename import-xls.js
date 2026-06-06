// 현대카드 "엑셀(실제로는 HTML 표)" 이용내역 → transactions.jsonl 변환
// 사용: node import-xls.js <엑셀파일경로> > seed.jsonl
// 컬럼: 승인일, 승인시각, 카드구분, 카드종류(마스킹번호), 가맹점명, 승인금액,
//       이용구분, 할부개월, 승인번호, 취소일, 승인구분(승인/취소)

const fs = require("fs");
const crypto = require("crypto");

const file = process.argv[2];
// 카드 표시명: 인자 2번 또는 CARD_NAME 환경변수, 기본 "현대카드"
const CARD_NAME = process.argv[3] || process.env.CARD_NAME || "현대카드";
if (!file) {
  console.error("사용법: node import-xls.js <엑셀파일> [카드표시명] > seed.jsonl");
  process.exit(1);
}
const html = fs.readFileSync(file, "utf8");

function cells(tr) {
  return [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
  );
}
const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => cells(m[1]));

// "2026년 06월 06일" + "14:01" → UTC ISO (KST 기준)
function toISO(dateStr, timeStr) {
  const d = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!d) return null;
  const [, y, mo, da] = d.map(Number);
  let h = 0, mi = 0;
  const t = (timeStr || "").match(/(\d{1,2}):(\d{2})/);
  if (t) { h = +t[1]; mi = +t[2]; }
  // KST(+9) → UTC
  return new Date(Date.UTC(y, mo - 1, da, h - 9, mi, 0)).toISOString();
}

const out = [];
const stats = { total: 0, sumApprove: 0, sumCancel: 0, byCard: {} };
for (const r of trs) {
  if (r.length < 11) continue;
  const [seungilDay, time, gubun, cardType, merchant, amountStr, useType, months, approvalNo, cancelDay, status] = r;
  // 헤더/소계/합계 행 제외
  if (!/\d{4}년/.test(seungilDay)) continue;
  if (/소계|합계/.test(merchant)) continue;
  const amount = parseInt((amountStr || "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(amount)) continue;
  const st = /취소/.test(status) ? "취소" : "승인";
  const installment = !months || months === "0" ? "일시불" : `${months}개월`;
  const tx = {
    id: crypto.randomUUID(),
    status: st,
    cardName: CARD_NAME, // 문자 알림 카드명과 통일해두면 표기 일관됨
    cardNo: cardType || null,
    holder: null,
    amount,
    installment,
    when: toISO(seungilDay, time),
    merchant,
    cumulative: null,
    approvalNo: approvalNo || null,
    source: "card_export",
    capturedAt: toISO(seungilDay, time),
  };
  out.push(tx);
  stats.total++;
  if (st === "취소") stats.sumCancel += amount; else stats.sumApprove += amount;
  stats.byCard[cardType] = (stats.byCard[cardType] || 0) + 1;
}

// 오래된 → 최신 순 정렬
out.sort((a, b) => new Date(a.when) - new Date(b.when));

for (const t of out) process.stdout.write(JSON.stringify(t) + "\n");

console.error("=== 임포트 통계 ===");
console.error("건수:", stats.total);
console.error("승인 합:", stats.sumApprove.toLocaleString());
console.error("취소 합:", stats.sumCancel.toLocaleString());
console.error("순지출(승인-취소):", (stats.sumApprove - stats.sumCancel).toLocaleString());
console.error("카드별 건수:", JSON.stringify(stats.byCard));
console.error("기간:", out[0]?.when, "~", out[out.length - 1]?.when);
