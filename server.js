// 현대카드 문자 수집 서버
// 파이프라인: 아이폰 단축어 → POST /sms?token=<secret> (body=문자본문 또는 {"text":...})
//   → 원문을 captured.jsonl 에 항상 기록(디버그/미파싱 대비)
//   → parser 로 파싱 성공 시 transactions.jsonl 에 거래 1건 저장(중복은 무시)
//
// 실행:  SMS_WEBHOOK_SECRET=비밀값 node server.js   (포트 기본 8080)

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parse } = require("./parser");
const newId = () => crypto.randomUUID();

// .env 파일이 있으면 읽어서 환경변수로 (의존성 없는 초간단 로더)
(() => {
  try {
    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch (_) {}
})();

const PORT = process.env.PORT || 8080;
const SECRET = process.env.SMS_WEBHOOK_SECRET || "";
const RAW_FILE = path.join(__dirname, "captured.jsonl");
const TX_FILE = path.join(__dirname, "transactions.jsonl");
const DASH_FILE = path.join(__dirname, "dashboard.html");

if (!SECRET) {
  console.error("환경변수 SMS_WEBHOOK_SECRET 를 설정하세요.");
  process.exit(1);
}

// 가맹점명 → 카테고리 (키워드 기반 자동 분류)
const CAT_RULES = [
  ["편의점", ["GS25", "CU", "씨유", "세븐일레븐", "이마트24", "미니스톱", "GS THE FRESH"]],
  ["카페/간식", ["스타벅스", "스타벅", "투썸", "이디야", "메가", "빽다방", "컴포즈", "더카페", "카페", "커피", "파리바게", "뚜레쥬르", "베이커리", "공차", "배스킨", "던킨"]],
  ["쇼핑", ["쿠팡", "11번가", "G마켓", "지마켓", "옥션", "네이버페이", "무신사", "올리브영", "다이소", "이마트", "홈플러스", "롯데마트", "신세계", "코스트코", "마켓컬리", "SSG", "스마트스토어"]],
  ["식비", ["배달", "요기요", "배민", "김밥", "식당", "마라", "치킨", "피자", "버거", "맥도날드", "롯데리아", "KFC", "서브웨이", "분식", "국밥", "레스토랑", "한솥", "본죽", "더본"]],
  ["교통", ["택시", "카카오T", "카카오 T", "지하철", "시내버스", "광역버스", "마을버스", "고속버스", "주유", "SK에너지", "GS칼텍스", "S-OIL", "현대오일", "하이패스", "주차", "코레일", "SRT", "티머니", "철도공사"]],
  ["통신/구독", ["넷플릭스", "유튜브", "스포티파이", "애플", "구글", "아마존", "SKT", "KT ", "LGU", "통신", "멜론", "디즈니", "왓챠"]],
  ["의료", ["병원", "의원", "약국", "치과", "한의원", "클리닉", "메디"]],
];
function categorize(merchant) {
  if (!merchant) return "기타";
  for (const [cat, kws] of CAT_RULES) {
    if (kws.some((k) => merchant.includes(k))) return cat;
  }
  return "기타";
}

// 기존 거래 중복키 로드
const seen = new Set();
function txKey(tx) {
  return [tx.when, tx.amount, tx.merchant, tx.cumulative, tx.status].join("|");
}
if (fs.existsSync(TX_FILE)) {
  for (const line of fs.readFileSync(TX_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      seen.add(txKey(JSON.parse(line)));
    } catch (_) {}
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function jsonOut(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    return res.end("ok");
  }

  // 대시보드 (PWA)
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
    try {
      const html = fs.readFileSync(DASH_FILE);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch (_) {
      res.writeHead(500);
      return res.end("dashboard.html 없음");
    }
  }

  // PWA manifest
  if (req.method === "GET" && req.url === "/manifest.json") {
    res.writeHead(200, { "content-type": "application/manifest+json" });
    return res.end(
      JSON.stringify({
        name: "우리 가계부",
        short_name: "가계부",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0b0f",
        theme_color: "#0b0b0f",
        icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
      })
    );
  }

  // 홈화면 아이콘
  if (req.method === "GET" && req.url === "/icon.png") {
    try {
      const png = fs.readFileSync(path.join(__dirname, "icon.png"));
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(png);
    } catch (_) {
      res.writeHead(404);
      return res.end("no icon");
    }
  }

  // 거래 API: GET /api/transactions?token=  (카테고리 부여해서 전체 반환)
  if (req.method === "GET" && req.url.startsWith("/api/transactions")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.searchParams.get("token") !== SECRET) {
      res.writeHead(401);
      return res.end("unauthorized");
    }
    let rows = [];
    if (fs.existsSync(TX_FILE)) {
      rows = fs
        .readFileSync(TX_FILE, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const t = JSON.parse(l);
          t.category = t.categoryOverride || categorize(t.merchant);
          return t;
        });
    }
    return jsonOut(res, 200, { count: rows.length, rows });
  }

  // 수기 입력: POST /api/manual?token=  body={merchant,amount,when,status?,category?,memo?}
  if (req.method === "POST" && req.url.startsWith("/api/manual")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.searchParams.get("token") !== SECRET) {
      res.writeHead(401);
      return res.end("unauthorized");
    }
    const body = await readBody(req);
    let d;
    try { d = JSON.parse(body); } catch (_) {
      return jsonOut(res, 400, { ok: false, error: "잘못된 JSON" });
    }
    const amount = parseInt(String(d.amount).replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonOut(res, 400, { ok: false, error: "금액 확인" });
    }
    const ts = new Date().toISOString();
    const tx = {
      id: newId(),
      status: d.status === "취소" ? "취소" : "승인",
      cardName: "직접입력",
      holder: null,
      amount,
      installment: "일시불",
      when: d.when || ts, // 클라이언트가 ISO로 보냄
      merchant: (d.merchant || "").trim() || "(미입력)",
      cumulative: null,
      memo: (d.memo || "").trim() || null,
      categoryOverride: d.category || null, // 사용자가 고른 카테고리
      source: "manual",
      capturedAt: ts,
    };
    fs.appendFileSync(TX_FILE, JSON.stringify(tx) + "\n");
    seen.add(txKey(tx));
    console.log(`[${ts}] 수기입력: ${tx.merchant} ${tx.amount}원`);
    return jsonOut(res, 200, { ok: true, tx });
  }

  // 거래 카테고리/메모 수정: POST /api/update?token=  body={id, category?, memo?}
  if (req.method === "POST" && req.url.startsWith("/api/update")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.searchParams.get("token") !== SECRET) {
      res.writeHead(401);
      return res.end("unauthorized");
    }
    const body = await readBody(req);
    let d;
    try { d = JSON.parse(body); } catch (_) { return jsonOut(res, 400, { ok: false }); }
    if (!d.id || !fs.existsSync(TX_FILE)) return jsonOut(res, 400, { ok: false, error: "id 필요" });
    let found = false;
    const lines = fs.readFileSync(TX_FILE, "utf8").split("\n").filter(Boolean).map((l) => {
      let t;
      try { t = JSON.parse(l); } catch (_) { return l; }
      if (t.id !== d.id) return l;
      found = true;
      if (d.category !== undefined) t.categoryOverride = d.category || null;
      if (d.memo !== undefined) t.memo = (d.memo || "").trim() || null;
      return JSON.stringify(t);
    });
    if (!found) return jsonOut(res, 404, { ok: false, error: "거래 없음" });
    fs.writeFileSync(TX_FILE, lines.join("\n") + "\n");
    return jsonOut(res, 200, { ok: true });
  }

  // 거래 삭제(수기/실수 정정용): POST /api/delete?token=  body={id}
  if (req.method === "POST" && req.url.startsWith("/api/delete")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.searchParams.get("token") !== SECRET) {
      res.writeHead(401);
      return res.end("unauthorized");
    }
    const body = await readBody(req);
    let d;
    try { d = JSON.parse(body); } catch (_) { return jsonOut(res, 400, { ok: false }); }
    if (!d.id || !fs.existsSync(TX_FILE)) return jsonOut(res, 400, { ok: false });
    const kept = fs.readFileSync(TX_FILE, "utf8").split("\n").filter(Boolean)
      .filter((l) => { try { return JSON.parse(l).id !== d.id; } catch (_) { return true; } });
    fs.writeFileSync(TX_FILE, kept.join("\n") + (kept.length ? "\n" : ""));
    return jsonOut(res, 200, { ok: true });
  }

  // 최근 거래 조회(점검용): GET /tx?token=&n=20
  if (req.method === "GET" && req.url.startsWith("/tx")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.searchParams.get("token") !== SECRET) {
      res.writeHead(401);
      return res.end("unauthorized");
    }
    const n = Math.min(parseInt(u.searchParams.get("n") || "20", 10) || 20, 200);
    let rows = [];
    if (fs.existsSync(TX_FILE)) {
      rows = fs
        .readFileSync(TX_FILE, "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-n)
        .map((l) => JSON.parse(l));
    }
    return jsonOut(res, 200, { count: rows.length, rows });
  }

  if (req.method !== "POST" || !req.url.startsWith("/sms")) {
    res.writeHead(404);
    return res.end("not found");
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const provided =
    req.headers["x-webhook-secret"] || url.searchParams.get("token");
  if (provided !== SECRET) {
    res.writeHead(401);
    return res.end("unauthorized");
  }

  const body = await readBody(req);
  let text = body;
  try {
    const j = JSON.parse(body);
    if (j && typeof j.text === "string") text = j.text;
  } catch (_) {}

  const ts = new Date().toISOString();
  // 원문은 항상 보관
  fs.appendFileSync(
    RAW_FILE,
    JSON.stringify({ ts, ip: req.socket.remoteAddress, text }) + "\n"
  );

  // 파싱 시도
  const parsed = parse(text, ts);
  if (!parsed) {
    console.log(`[${ts}] 미파싱(원문만 저장):\n${text}\n---`);
    return jsonOut(res, 200, { ok: true, parsed: false });
  }

  const key = txKey(parsed);
  if (seen.has(key)) {
    console.log(`[${ts}] 중복 무시: ${parsed.merchant} ${parsed.amount}원`);
    return jsonOut(res, 200, { ok: true, parsed: true, duplicate: true });
  }
  seen.add(key);
  const tx = { id: newId(), ...parsed, capturedAt: ts };
  fs.appendFileSync(TX_FILE, JSON.stringify(tx) + "\n");
  console.log(
    `[${ts}] 저장: ${parsed.status} ${parsed.merchant} ${parsed.amount}원 (${parsed.installment})`
  );
  return jsonOut(res, 200, { ok: true, parsed: true, tx });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`현대카드 수집 서버 listening on :${PORT}`);
  console.log(`기존 거래 ${seen.size}건 로드됨`);
});
