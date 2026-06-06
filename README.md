# 📱💳 Auto Ledger

> **카드 결제 문자(SMS)가 오면 → 아이폰 단축어가 내 서버로 쏘고 → 자동 파싱·저장 → 대시보드(PWA)로 한눈에.**
> 둘이 같은 데이터를 보는 **커플 가계부**. 외부 서비스·DB·프레임워크 없이 **순수 Node + JSONL 파일**로 돌아갑니다.

A self-hosted couple budget app that auto-collects card payment **SMS** on iPhone via **Shortcuts → webhook → parse → dashboard**. Zero dependencies — just plain Node and human-readable JSONL files.

![license](https://img.shields.io/badge/license-MIT-blue) ![node](https://img.shields.io/badge/node-%E2%89%A518-green) ![deps](https://img.shields.io/badge/dependencies-0-brightgreen)

---

**[동작 원리](#동작-원리)** · [왜 만들었나](#왜-이렇게-만들었나) · [아키텍처](#아키텍처--갈아끼울-수-있는-단계) · [주요 기능](#주요-기능) · [빠른 시작](#빠른-시작) · [보안](#보안-) · [구조·API](#구조--파일--api) · [다른 카드사](#다른-카드사-지원하기)

## 동작 원리

```
카드 결제
   └→ 카드사 결제 문자(SMS) 수신 (아이폰)
        └→ 단축어 "메시지 받을 때" 자동화  (발신번호 말고 '내용'으로 필터)
             └→ POST /sms?token=***       (본문 = 문자 내용)
                  └→ 서버: 원문 보관 + 파싱 + 중복방지 + 저장(JSONL)
                       └→ 대시보드(PWA): 총지출 · 카테고리 · 내역 · 수기입력 · 편집
                            └→ 너 아이폰 / 배우자 아이폰  (홈 화면에 추가)
```

## 왜 이렇게 만들었나

안드로이드는 앱이 문자를 직접 읽어 가계부 자동입력이 쉽지만, **아이폰은 앱이 SMS를 못 읽습니다.** 그래서 대부분의 "문자 자동수집" 가계부는 안드로이드 전용이에요. 이 프로젝트는 그 빈틈을 메웁니다:

- 아이폰 **단축어 자동화**("메시지 받을 때")로 결제 문자를 가로채서
- 내 서버 **웹훅으로 POST** → 서버가 파싱해서 저장
- **PWA 대시보드**를 홈 화면에 추가하면 네이티브 앱처럼 사용

기존 가계부 앱에 카드/계좌를 연동하기 싫거나, **금융 데이터를 내 서버에만** 두고 싶은 사람을 위한 구조입니다.

## 아키텍처 — 갈아끼울 수 있는 단계

이 앱은 한 가지 조합에 묶여 있지 않아요. **단계마다 부품을 바꿔 끼울 수 있는 파이프라인**이에요.

```
[1.소스]        [2.캡처(기기)]      [3.전송]      [4.서버]      [5.저장]    [6.표시]
결제 알림   →   기기에서 가로채기  →  HTTP POST  →  실행 위치  →   데이터  →  대시보드
```

각 단계의 선택지와, 이 저장소가 현재 제공하는 것:

### 캡처 — 기기에서 결제 알림 가로채기

| 플랫폼 | 방법 | 상태 |
|--------|------|------|
| **아이폰** | 단축어 "메시지 받을 때" 자동화 → 웹훅 | ✅ **제공** ([빠른 시작](#2-아이폰-단축어-자동화)) |
| **안드로이드** | SMS Forwarder / Tasker / MacroDroid, 또는 NotificationListener(앱 푸시까지 캡처) | 🚧 **TBD** (서버 쪽은 동일 — 웹훅만 같으면 됨) |

> 참고: iOS는 앱이 SMS를 못 읽어 단축어로 우회합니다. 안드로이드는 앱이 SMS·알림을 직접 읽을 수 있어 **무인 백그라운드 포워딩**이 가능하고 오히려 더 견고해요. (중고 안드로이드 1대를 상시 게이트웨이로 두는 구성이 가장 안정적 — 문서화 예정)

### 서버 — 어디서 실행할까

서버는 "HTTP POST 받아 → 파싱·저장 → 대시보드 서빙"이 전부라 **Node가 도는 곳이면 어디든** 됩니다.

| 방식 | 예시 | 비고 |
|------|------|------|
| 🟢 **무료 VM (추천)** | 오라클 Cloud Always Free, GCP e2-micro | 지금 코드 그대로, 풀 제어. **이 저장소 기준 구성** |
| 유료 소형 VM | Hetzner, Lightsail | 더 안정적, 월 소액 |
| 집/홈서버 | 라즈베리파이, NAS | 데이터 완전 자가보관 |
| 서버리스 | Cloudflare Workers + D1 | 무료 HTTPS·IP은닉. 저장 계층 포팅 필요 |

**추천: 무료 VM** (오라클 Always Free 등). 추가 비용 없이 현재 코드를 그대로 올려 24시간 돌릴 수 있고, 방화벽·HTTPS만 챙기면 됩니다.

## 주요 기능

| | |
|---|---|
| 📥 **자동 수집** | 결제 문자 → 단축어 → 웹훅 → 파싱·저장 (중복 방지) |
| 💰 **월별 총지출** | 승인−취소 자동 차감, 지난달 대비 % |
| 📊 **카테고리 분류** | 가맹점 키워드로 자동 분류 + 막대 그래프, 직접 수정 가능 |
| ✍️ **수기 입력** | 현금·누락분 보충, 거래 탭해서 카테고리·메모 편집 |
| 👫 **커플 공유** | 같은 URL/암호로 둘이 같은 데이터 실시간 공유 |
| 🗂 **과거 내역 임포트** | 카드사 이용내역 엑셀 → 한 번에 적재 |
| 📱 **PWA** | 홈 화면에 추가하면 전체화면 앱처럼 |
| 🪶 **제로 의존성** | `node server.js` 하나. 데이터는 사람이 읽는 JSONL |

## 빠른 시작

### 1. 서버 띄우기
```bash
git clone https://github.com/<you>/auto-ledger.git
cd auto-ledger
cp .env.example .env
# .env 의 SMS_WEBHOOK_SECRET 를 무작위 값으로:
#   openssl rand -hex 16
node server.js
```
- 헬스체크: `curl http://localhost:8080/health` → `ok`
- 상시 실행(부팅 자동시작 + 죽으면 재시작)은 [`budget.service.example`](budget.service.example) (systemd) 참고
- 공인 서버면 **방화벽에서 포트(기본 8080)** 를 열어야 외부 접속 가능

### 2. 아이폰 단축어 자동화
**단축어 앱 → 자동화 → 개인용 자동화 생성**

1. **트리거**: `메시지` → **"메시지에 포함된 내용"** 에 카드사 이름(예: `현대카드`)
   - **즉시 실행** 켜기 / **실행 전 확인** 끄기
2. **동작**: `URL의 콘텐츠 가져오기` (= *Get Contents of URL*)
   - **URL**: `http://<서버주소>:8080/sms?token=<비밀값>`
   - **방식**: `POST`
   - **요청 본문**: `JSON` → 필드 `text` = 변수 **"단축어 입력"**(받은 메시지)
   - (raw 텍스트로 받은 메시지만 보내도 서버가 처리합니다)

### 3. (선택) 과거 내역 임포트
카드사 웹에서 "이용내역"을 엑셀(.xls)로 받아서:
```bash
node import-xls.js ~/Downloads/카드내역.xls "내 카드 표시명" > seed.jsonl
# 기존 데이터가 있으면 먼저 백업!
mv seed.jsonl transactions.jsonl
```

### 4. 대시보드 열기
- 브라우저로 `http://<서버주소>:8080/` → 암호(=비밀값) 입력 (기기에 저장되어 한 번만)
- 아이폰: **Safari** 로 열고 → 공유(↑) → **홈 화면에 추가**

## 보안 ⚠️

기본 구성은 **평문 HTTP + 토큰 1개** 입니다. 카드 내역은 민감정보이니 실사용 전 권장:
- **HTTPS** (리버스 프록시 또는 Cloudflare)
- **Cloudflare Access** 등으로 허용 사용자(이메일) 제한
- 서버 방화벽으로 신뢰 트래픽만 허용

`SMS_WEBHOOK_SECRET` 와 `transactions.jsonl`(결제 데이터)은 **절대 커밋하지 마세요** — `.gitignore` 에 이미 포함돼 있습니다.

## 구조 · 파일 · API

| 파일 | 역할 |
|------|------|
| `server.js` | HTTP 서버: 웹훅 수신, 파싱·저장, REST API, 대시보드 서빙, `.env` 로더 |
| `parser.js` | 카드 결제 문자 파서 (현재 현대카드 양식) |
| `dashboard.html` | 단일 파일 PWA 대시보드 (프레임워크 없음) |
| `import-xls.js` | 카드사 이용내역 엑셀(HTML 표) → JSONL 임포트 |
| `make-icon.js` | 홈 화면 아이콘 PNG 생성 (zlib만 사용) |
| `budget.service.example` | systemd 서비스 템플릿 |

**데이터**: `transactions.jsonl`(거래), `captured.jsonl`(문자 원문 백업). 한 줄 = 한 레코드(JSON).

**API** (모두 `?token=` 필요)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/sms` | 웹훅 수신(단축어가 호출) |
| `GET`  | `/api/transactions` | 거래 전체(+카테고리) |
| `POST` | `/api/manual` | 수기 입력 추가 |
| `POST` | `/api/update` | 카테고리/메모 수정 |
| `POST` | `/api/delete` | 거래 삭제 |
| `GET`  | `/` | 대시보드(PWA) |

## 다른 카드사 지원하기

`parser.js` 는 라인 기반 파서예요. 본인 카드사 결제 문자 몇 건을 (서버가 `captured.jsonl` 에 원문을 보관합니다) 보고 규칙을 추가하면 됩니다. 임포트는 카드사마다 엑셀 컬럼이 달라 `import-xls.js` 의 매핑을 손보면 됩니다. **PR 환영!**

## 크레딧

- UI 아이콘: [Iconify](https://iconify.design) + [Lucide](https://lucide.dev) (ISC)
- 앱 아이콘 소재: [Noto Emoji](https://github.com/googlefonts/noto-emoji) (Apache-2.0)

## 기여 · 라이선스

이슈 · PR 환영합니다. 새 카드사 양식이나 파서 개선이 특히 좋아요.
[MIT](LICENSE) © 2026
