# Leghop

여행 일정을 구간(leg)별 이동 경로로 자동 변환하는 모바일 우선 PWA.

설계 문서: [`DESIGN.md`](./DESIGN.md)

```
leghop/
├── DESIGN.md      설계 문서 (읽고 시작할 것)
├── supabase/      DB 스키마 · RLS 정책
├── web/           React + Vite PWA
└── worker/        Cloudflare Worker — Gemini 중계 전용
```

**서버가 정본이다.** Supabase(Postgres)에 저장하고, 브라우저의 IndexedDB는
오프라인에서 일정을 꺼내 보기 위한 **읽기 전용 사본**이다. 수정은 온라인에서만
된다 — 오프라인 쓰기를 허용하면 두 사람이 같은 일정을 고쳤을 때 충돌 해결이
필요해지고, 그 복잡도를 피하기로 결정했다 (`DESIGN.md` §5).

---

## 준비물

- **Node 24** — 저장소 루트에 `.nvmrc`가 있다. `nvm use` 하면 맞춰진다.
  (전역 기본값은 v18이라 매번 `nvm use`가 필요하다)
- Google Cloud 계정
- Google AI Studio 계정 (Gemini — P3부터 필요, P0에서는 없어도 됨)
- Cloudflare 계정 (Worker 배포 — P3부터 필요)

---

## 빠른 시작

```bash
nvm use                      # Node 24
cd web
cp .env.example .env.local   # 값 채우기 (아래 참고)
npm install
npm run dev                  # http://localhost:5173
```

키 없이 실행해도 앱은 뜬다. 지도 자리에 설정 안내가 대신 표시된다.

---

## Supabase 설정

**1. 프로젝트 생성**

[Supabase 콘솔](https://supabase.com/dashboard)에서 프로젝트를 만든다.

**2. 스키마 적용**

SQL Editor에 [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)을
그대로 붙여넣고 Run. 테이블·RLS 정책·트리거가 한 번에 만들어진다.

> 이 파일은 여러 번 실행해도 안전하게 쓰여 있다 (`create ... if not exists`,
> `drop policy if exists`). 수정 후 다시 돌려도 된다.

**3. Google 로그인 활성화**

Authentication → Providers → Google 을 켜고, Google Cloud 콘솔에서 OAuth
클라이언트를 만들어 Client ID / Secret 을 넣는다.

- Google Cloud 쪽 **승인된 리디렉션 URI**:
  `https://<프로젝트-ref>.supabase.co/auth/v1/callback`
- Supabase 쪽 **Redirect URLs** (Authentication → URL Configuration):
  `http://localhost:5173` 과 배포 도메인

**4. 키 복사**

Project Settings → API 에서 `Project URL` 과 `anon public` 키를 `web/.env` 에 넣는다.

> `anon` 키는 브라우저에 노출되는 공개 키다. 실제 방어선은 RLS 정책이다.
> **`service_role` 키는 절대 프론트엔드에 넣지 말 것** — RLS를 전부 우회한다.

### 공유 동작 방식

- 여행 생성자가 owner, 초대받은 사람이 editor다. 둘 다 수정할 수 있고 **삭제는 owner만** 가능하다
- 초대는 이메일로 한다. 아직 가입하지 않은 사람도 초대해두면, 같은 이메일로 가입하는 순간 트리거가 참여시킨다
- 인원 상한은 `trips.max_members`(기본 2)다. **SQL 수정 없이 컬럼 값만 올리면** 3명 이상으로 늘어난다
- `role`에 `viewer`가 이미 정의돼 있어서, 보기 전용을 붙일 때 마이그레이션이 필요 없다

---

## Google Maps 키 발급

**1. 프로젝트와 결제 계정**

[Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 만들고 결제 계정을 연결한다.
결제 연결 없이는 Maps Platform API가 활성화되지 않는다.

**2. API 활성화**

[API 라이브러리](https://console.cloud.google.com/google/maps-apis/api-list)에서 세 개를 켠다.

| API | 쓰이는 곳 |
|---|---|
| Maps JavaScript API | 지도 렌더링 (P0~) |
| Places API (New) | 장소 검색·자동완성 (P1~) |
| Directions API | 구간 경로 계산 (P2~) |

**3. 키 발급과 제한**

사용자 인증 정보 → API 키 만들기. 그다음 **반드시 제한을 건다.**

- *애플리케이션 제한사항* → **HTTP 리퍼러(웹사이트)**
  - `http://localhost:5173/*`
  - 배포 후 실제 도메인 추가
- *API 제한사항* → 위 세 개 API만 선택

> 이 키는 브라우저 번들에 그대로 들어간다. 숨길 방법은 없고, 리퍼러 제한이 유일한 방어선이다.
> 제한을 안 걸면 남이 가져다 쓰고 요금은 이쪽으로 청구된다.

**4. Map ID (P1부터 필요)**

지도 관리 → Map ID 만들기 → **Vector** 선택.
Advanced Marker와 지도 스타일링에 필요하다. P0에서는 없어도 지도가 뜬다.

**5. 예산 알림**

결제 → 예산 및 알림에서 상한 알림을 걸어둘 것.
API별 일일 쿼터 상한도 함께 설정하면 사고를 막을 수 있다.

> ⚠️ Google Maps Platform은 2025년에 과금 체계가 개편됐다.
> 현행 무료 한도는 콘솔에서 직접 확인할 것 — `DESIGN.md` §7.2 참고.

**6. `.env.local` 작성**

```bash
VITE_GOOGLE_MAPS_API_KEY=AIza...
VITE_GOOGLE_MAPS_MAP_ID=          # P1부터
VITE_WORKER_URL=                  # P3부터
```

dev 서버를 재시작해야 반영된다.

---

## Worker (P3부터)

Gemini 키를 숨기는 용도. P0~P2에서는 없어도 된다.

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars    # GEMINI_API_KEY 채우기
npm run dev                       # http://localhost:8787
```

키는 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급한다.

동작 확인:

```bash
curl http://localhost:8787/health

curl -X POST http://localhost:8787/parse \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:5173' \
  -d '{"text":"바르셀로나 공항 도착 후 입국 심사 및 짐 찾기\n공항버스로 시내 이동\n라 플라우타에서 꿀대구 먹기","cityHint":"Barcelona"}'
```

배포:

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

배포 후 `wrangler.toml`의 `ALLOWED_ORIGINS`를 실제 도메인으로 바꾼다.
이 목록에 없는 출처의 요청은 403으로 끊긴다 — CORS는 브라우저만 막아주므로 서버에서도 확인한다.

---

## 명령어

**web/**

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (SW 비활성 — HMR과 충돌 방지) |
| `npm run build` | 프로덕션 빌드 + SW 생성 |
| `npm run preview` | 빌드 결과 확인. **PWA 동작 확인은 여기서** |
| `node scripts/gen-icons.mjs` | PWA 아이콘 재생성 |

**worker/**

| 명령 | 설명 |
|---|---|
| `npm run dev` | 로컬 Worker |
| `npm run typecheck` | 타입 검사 |
| `npm run deploy` | Cloudflare 배포 |

---

## 알아둘 것

**Google Maps 타일은 캐시하지 않는다.**
약관상 오프라인 저장이 금지돼 있어서, `vite.config.ts`의 Workbox 설정에서
`maps.googleapis.com` 등을 `NetworkOnly`로 못박아 뒀다. 이 규칙을 풀지 말 것.
오프라인 범위는 일정·장소·경로 텍스트까지다 (`DESIGN.md` §5).

**Node 18에서는 안 돌아간다.**
Vite 8과 Wrangler 4가 Node 20+를 요구한다. `nvm use`를 잊지 말 것.
