// 현대카드 결제 문자 파서
// 실제 양식(2026-06 확인):
//   [Web발신]
//   현대카드Z work Ed2 승인
//   홍*동
//   4,000원 일시불
//   06/05 19:09
//   GS25금천벚꽃
//   누적3,664,974원
//
// 파싱 실패해도 원문은 따로 보관하므로, 못 읽으면 null 반환.

// 한 줄에서 "1,234원" 형태 금액 추출 → 정수(원)
function wonToInt(s) {
  const m = s.match(/([\d,]+)\s*원/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// MM/DD HH:MM (+선택 :SS) → ISO 문자열. 연도는 기준연도(now) 사용.
// 12월 문자가 1월에 도착하는 등 연말 경계는 보정: 미래로 한 달 이상 튀면 작년으로.
function parseWhen(s, nowISO) {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, mo, d, h, mi, se] = m;
  const now = nowISO ? new Date(nowISO) : new Date();
  let year = now.getUTCFullYear();
  // KST(+9) 기준 로컬 날짜로 구성
  const make = (y) =>
    new Date(Date.UTC(y, +mo - 1, +d, +h - 9, +mi, +(se || 0)));
  let dt = make(year);
  // 결제시각이 현재보다 한참 미래면(>2일) 작년으로 본다 (연말 경계)
  if (dt.getTime() - now.getTime() > 2 * 24 * 3600 * 1000) dt = make(year - 1);
  return dt.toISOString();
}

function parse(rawText, nowISO) {
  if (typeof rawText !== "string") return null;
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== "[Web발신]");

  // 현대카드 문자가 아니면 패스
  if (!lines.some((l) => l.includes("현대카드"))) return null;

  // 승인/취소 줄 찾기
  const headIdx = lines.findIndex((l) => /(승인|취소)\s*$/.test(l));
  if (headIdx < 0) return null;
  const head = lines[headIdx];
  const status = /취소/.test(head) ? "취소" : "승인";
  const cardName = head.replace(/\s*(승인|취소)\s*$/, "").trim();

  // 금액 + 할부 줄
  const amtIdx = lines.findIndex((l, i) => i > headIdx && /[\d,]+\s*원/.test(l));
  if (amtIdx < 0) return null;
  const amount = wonToInt(lines[amtIdx]);
  const instMatch = lines[amtIdx].match(/원\s*(.+)$/);
  const installment = instMatch ? instMatch[1].trim() : null; // 일시불 / N개월 등

  // 날짜시각 줄
  const whenIdx = lines.findIndex(
    (l, i) => i > amtIdx && /\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/.test(l)
  );
  const when = whenIdx >= 0 ? parseWhen(lines[whenIdx], nowISO) : null;

  // 가맹점: 날짜 다음 줄에서 누적 줄 전까지 (보통 한 줄)
  let merchant = null;
  if (whenIdx >= 0 && whenIdx + 1 < lines.length) {
    const cand = lines[whenIdx + 1];
    if (!/^누적/.test(cand)) merchant = cand;
  }

  // 누적 금액
  const cumLine = lines.find((l) => /^누적/.test(l));
  const cumulative = cumLine ? wonToInt(cumLine) : null;

  // 마스킹 이름: 헤더와 금액 줄 사이의 줄
  let holder = null;
  if (amtIdx - headIdx >= 2) holder = lines[headIdx + 1];

  return {
    status,
    cardName,
    holder,
    amount,
    installment,
    when,
    merchant,
    cumulative,
  };
}

module.exports = { parse, wonToInt, parseWhen };
