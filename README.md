# 📱 Card SMS Budget — 문자로 자동 수집하는 셀프호스팅 가계부

> 카드 **결제 문자(SMS)** 가 오면 → **아이폰 단축어** 가 내 서버로 쏘고 → **자동 파싱·저장** → **대시보드(PWA)** 로 한눈에.
> 둘이 같은 데이터를 보는 **커플 가계부**. 제로 의존성 Node + JSONL 파일 저장. DB·프레임워크 없음.

A self-hosted couple budget app that auto-collects card payment **SMS** via **iPhone Shortcuts → webhook → parse → dashboard**. Zero dependencies (plain Node + JSONL).

---

## 왜 이렇게 만들었나

안드로이드는 앱이 문자를 직접 읽어서 가계부 자동입력이 쉽지만, **아이폰은 앱이 SMS를 못 읽어요.** 그래서:

- 아이폰 **단축어 "메시지 받을 때" 자동화** 로 결제 문자를 가로채서
- 내 서버 **웹훅으로 POST** → 서버가 파싱해서 저장
- **PWA 대시보드** 를 홈 화면에 추가하면 앱처럼 사용

기존 가계부 앱에 카드/계좌를 연동하기 싫거나, 데이터를 내 서버에 두고 싶은 사람을 위한 구조예요.

```
카드 결제
   └→ 카드사 결제 문자(SMS) 수신 (아이폰)
        └→ 단축어 자동화 "메시지 받을 때" (발신자 말고 내용으로 필터)
             └→ POST /sms?token=*** (본문=문자 내용)
                  └→ 서버: 원문 보관 + 파싱 + 중복방지 + 저장(JSONL)
                       └→ 대시보드(PWA): 총지출/카테고리/내역, 수기입력, 카테고리 편집
```

## 주요 기능

- 📥 **자동 수집**: 결제 문자 → 단축어 → 웹훅 → 파싱·저장
- 💰 **월별 총지출** (승인−취소 자동 차감) + 지난달 대비
- 📊 **카테고리 자동 분류** (가맹점 키워드 기반) + 막대 그래프
- ✍️ **수기 입력** (현금·누락분) / 거래 **탭해서 카테고리·메모 수정**
- 📱 **PWA** — 아이폰 홈 화면에 추가하면 전체화면 앱처럼
- 👫 **커플 공유** — 같은 URL/암호로 둘이 같은 데이터
- 🗂 **과거 내역 임포트** — 카드사 엑셀(이용내역) 다운로드 → 한 번에 적재
- 🪶 **제로 의존성** — `node server.js` 하나면 끝. 데이터는 사람이 읽을 수 있는 JSONL.

## 빠른 시작

### 1. 서버 띄우기
```bash
git clone <이 저장소>
cd card-sms-budget
cp .env.example .env
# .env 의 SMS_WEBHOOK_SECRET 를 무작위 값으로 (openssl rand -hex 16)
node server.js
```
- 헬스체크: `curl http://localhost:8080/health` → `ok`
- 상시 실행은 `budget.service.example` (systemd) 참고.
- 공인 서버라면 방화벽에서 포트(기본 8080)를 열어야 외부에서 접속됩니다.
  (오라클 클라우드 등은 **콘솔의 Security List**, 그리고 VM의 `iptables` 둘 다 열어야 할 수 있어요. iptables는 REJECT 규칙 **앞** 에 넣어야 합니다.)

### 2. 아이폰 단축어 자동화
**단축어 앱 → 자동화 → 개인용 자동화 생성**
1. 트리거: **메시지** → **"메시지에 포함된 내용"** 에 카드사 이름(예: `현대카드`) 지정
   - ⚠️ "보낸 사람(번호)" 로 거는 건 비추: 결제 알림 SMS는 **발신번호가 매번 달라요**. 내용으로 거세요.
   - **즉시 실행** 켜기 / **실행 전 확인** 끄기
2. 동작: **"URL의 콘텐츠 가져오기"** (검색이 안 잡히면 동작 목록의 **"웹"** 범주에서)
   - URL: `http://<서버주소>:8080/sms?token=<비밀값>`
   - 방식: **POST**, 요청 본문: **JSON**, 필드 `text` = 변수 **"단축어 입력"**(받은 메시지)
   - (또는 본문을 raw 텍스트로 받은 메시지만 보내도 서버가 처리합니다)

### 3. (선택) 과거 내역 임포트
카드사 웹에서 "이용내역"을 엑셀(.xls)로 받아서:
```bash
node import-xls.js ~/Downloads/카드내역.xls "내 카드 표시명" > seed.jsonl
mv seed.jsonl transactions.jsonl   # 서버 데이터로 사용 (기존 파일 있으면 백업 먼저!)
```
> 참고: 한국 카드사 ".xls" 는 실제론 HTML 표인 경우가 많아 그걸 파싱합니다. 현재 **현대카드** 양식 기준. 다른 카드사는 `import-xls.js` 의 컬럼 매핑을 손보면 됩니다.

### 4. 대시보드 열기
- 브라우저로 `http://<서버주소>:8080/` → 암호(=비밀값) 입력 (기기에 저장되어 한 번만)
- 아이폰: **Safari** 로 열고 → 공유 → **홈 화면에 추가** (Safari에서만 가능)

## 보안 ⚠️

이 기본 구성은 **평문 HTTP + 토큰 1개** 입니다. 카드 내역은 민감정보이므로 실사용 전 권장:
- **HTTPS** (리버스 프록시 / Cloudflare)
- **Cloudflare Access** 등으로 허용 사용자(이메일) 제한
- 서버 방화벽으로 신뢰 트래픽만 허용

`SMS_WEBHOOK_SECRET` 와 `transactions.jsonl`(결제 데이터)은 **절대 커밋하지 마세요** — `.gitignore` 에 이미 포함돼 있습니다.

## 구조 / 파일

| 파일 | 역할 |
|------|------|
| `server.js` | HTTP 서버: 웹훅 수신, 파싱·저장, REST API, 대시보드 서빙 |
| `parser.js` | 카드 결제 문자(SMS) 파서 (현재 현대카드 양식) |
| `dashboard.html` | 단일 파일 PWA 대시보드 (프레임워크 없음) |
| `import-xls.js` | 카드사 이용내역 엑셀(HTML 표) → JSONL 임포트 |
| `make-icon.js` | 홈 화면 아이콘(PNG) 생성기 (zlib만 사용) |
| `budget.service.example` | systemd 서비스 예시 |

**데이터 저장**: `transactions.jsonl`(거래), `captured.jsonl`(문자 원문 백업) — 한 줄 = 한 레코드.

**API**: `GET /api/transactions` · `POST /api/manual` · `POST /api/update` · `POST /api/delete` · `POST /sms`(웹훅) — 모두 `?token=` 필요.

## 다른 카드사 지원하기
`parser.js` 는 라인 기반 파서예요. 본인 카드사 결제 문자 몇 건을 `captured.jsonl`(원문 보관됨) 에서 보고 규칙을 추가하면 됩니다. PR 환영.

## 라이선스
MIT
