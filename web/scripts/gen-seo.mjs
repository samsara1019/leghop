/**
 * 검색엔진이 읽을 수 있는 **정적 페이지**를 만든다.
 *
 * 앱 본체는 로그인 뒤에 있는 SPA라 색인되지 않는다. 그래서 자바스크립트 없이
 * 완결되는 HTML을 따로 생성해 `dist/guide/`에 둔다. 내용은 지어내지 않고
 * 앱이 실제로 쓰는 준비물 템플릿(src/lib/packing.ts)에서 뽑는다 —
 * 같은 데이터라 문서와 제품이 어긋나지 않는다.
 *
 * vite build 뒤에 실행된다 (package.json의 build 스크립트).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DISCLOSURE,
  buildContext,
  generateItems,
  hasAnyAffiliate,
  recommendedLink,
} from './.generated/packing.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SITE = process.env.SITE_URL ?? 'https://leghop.vercel.app'
const GA_ID = process.env.GA_ID ?? 'G-ZG57N6TY7R'

/**
 * 정적 페이지는 React 앱과 별개라 GA를 따로 넣어야 한다.
 * 검색으로 들어오는 곳이 여기라서, 빠지면 SEO 성과가 하나도 안 잡힌다.
 * SPA와 달리 화면 이동이 없으므로 기본 자동 page_view를 그대로 쓴다.
 */
const GA_SNIPPET = GA_ID
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${GA_ID}');</script>`
  : ''

// ---------------------------------------------------------------------------
// 가이드 정의
//
// 도시별 "추천 코스"는 만들지 않는다. 가보지 않은 곳의 일정을 지어내면
// 사람들이 그걸 믿고 움직인다. 대신 실제로 가진 데이터(준비물 템플릿)와
// 제품이 하는 일(동선 계산 방법)만 쓴다.
// ---------------------------------------------------------------------------

/** 대표 좌표 — 템플릿의 지역·계절 조건을 태우기 위한 값이다 */
const BARCELONA = { lat: 41.3874, lng: 2.1686 }
const PARIS = { lat: 48.8566, lng: 2.3522 }

const dest = (name, coord, startDate) => ({
  id: name,
  tripId: 'guide',
  name,
  lat: coord.lat,
  lng: coord.lng,
  startDate,
  order: 0,
})

const GUIDES = [
  {
    slug: 'europe-packing',
    title: '유럽여행 준비물 체크리스트 — 계절별로 달라지는 것까지',
    description:
      '유럽여행 준비물을 분류별로 정리했습니다. 석회수 대비 샤워 필터, 유럽형 C타입 어댑터처럼 유럽에서만 필요한 것과, 여름·겨울에 갈리는 항목을 함께 담았습니다.',
    keywords: ['유럽여행 준비물', '유럽 여행 준비물 리스트', '유럽여행 체크리스트'],
    lead: `유럽여행 준비물은 "어디를 가느냐"보다 <strong>언제 가느냐</strong>에 더 크게 갈립니다.
      8월 바르셀로나와 1월 파리는 가방 안이 절반쯤 다릅니다.
      아래 목록은 Leghop이 여행 날짜와 도시 좌표를 보고 실제로 만들어 주는 목록을 그대로 옮긴 것입니다.`,
    sections: [
      {
        heading: '여름 유럽 (6~8월) · 10일 · 여러 도시',
        note: '바르셀로나 → 세비야처럼 도시를 옮기는 일정 기준입니다.',
        ctx: buildContext(
          [dest('바르셀로나', BARCELONA, '2026-08-10'), dest('세비야', { lat: 37.3891, lng: -5.9845 }, '2026-08-15')],
          '2026-08-10',
          '2026-08-19',
        ),
      },
      {
        heading: '겨울 유럽 (12~2월) · 5일 · 한 도시',
        note: '같은 유럽이라도 계절이 바뀌면 빠지고 더해지는 항목이 있습니다.',
        ctx: buildContext([dest('파리', PARIS, '2027-01-10')], '2027-01-10', '2027-01-14'),
      },
    ],
    extras: [
      {
        h: '유럽에서만 필요한 것',
        items: [
          '<strong>유럽형 C타입 멀티어댑터</strong> — 한국 플러그가 그대로 안 들어갑니다.',
          '<strong>샤워키 필터</strong> — 석회수가 센 지역이 많아 머리가 뻣뻣해집니다.',
          '<strong>화장실용 잔돈</strong> — 공중화장실이 유료인 곳이 흔합니다.',
          '<strong>큰 스카프</strong> — 성당은 어깨와 무릎을 가려야 들어갈 수 있는 곳이 있습니다.',
        ],
      },
      {
        h: '자주 빠뜨리는 것',
        items: [
          '<strong>여권 사본</strong> — 분실 시 재발급 절차가 달라집니다. 휴대폰 저장과 출력본을 함께.',
          '<strong>볼펜</strong> — 기내 입국서류를 쓸 때 빌리러 다니게 됩니다.',
          '<strong>보조배터리</strong> — 위탁수하물에 넣을 수 없습니다. 기내로.',
          '<strong>휴대용 세제</strong> — 4일이 넘으면 한 번은 빨래하게 됩니다.',
        ],
      },
    ],
  },
  {
    slug: 'barcelona-packing',
    title: '바르셀로나 여행 준비물 — 8월 기준 체크리스트',
    description:
      '바르셀로나 여행 준비물을 분류별로 정리했습니다. 여름 더위와 소매치기 대비, 사그라다 파밀리아 같은 성당 입장 복장까지 함께 담았습니다.',
    keywords: ['바르셀로나 여행 준비물', '바르셀로나 준비물', '스페인 여행 준비물'],
    lead: `바르셀로나는 8월이 성수기이자 가장 더운 시기입니다. 준비물도 그에 맞춰 달라집니다 —
      양산과 손풍기가 사치가 아니라 필수가 되고, 성당 입장을 위한 옷차림도 챙겨야 합니다.`,
    sections: [
      {
        heading: '바르셀로나 8월 · 5일',
        note: '아래 목록은 여행 날짜와 도시를 넣으면 앱이 자동으로 만들어 줍니다.',
        ctx: buildContext([dest('바르셀로나', BARCELONA, '2026-08-10')], '2026-08-10', '2026-08-14'),
      },
    ],
    extras: [
      {
        h: '바르셀로나에서 특히 신경 쓸 것',
        items: [
          '<strong>소매치기 대비</strong> — 지하철과 람블라스 거리에서 특히 조심하라는 이야기가 많습니다. 앞으로 메는 크로스백과 스트랩 폰케이스.',
          '<strong>성당 입장 복장</strong> — 사그라다 파밀리아 등은 어깨·무릎을 가려야 합니다. 얇은 스카프 하나로 해결됩니다.',
          '<strong>더위 대비</strong> — 8월 한낮은 걷기 어렵습니다. 양산·물통·손풍기.',
          '<strong>사전 예약</strong> — 인기 명소는 현장 구매가 어렵습니다. 예약 확인서를 오프라인으로 가지고 계세요.',
        ],
      },
    ],
  },
  {
    slug: 'travel-course',
    title: '여행 코스 짜는 법 — 동선부터 정하면 시간이 남는다',
    description:
      '여행 코스를 짤 때 흔히 놓치는 것은 이동 시간입니다. 장소를 먼저 모으고 동선을 정리하는 순서로 일정을 짜는 방법을 정리했습니다.',
    keywords: ['여행 코스', '여행 동선', '유럽 동선', '여행 일정 짜기'],
    lead: `여행 코스를 짜다 보면 "가고 싶은 곳"은 금방 모이는데 하루에 몇 개가 들어가는지는 끝까지 모릅니다.
      이동 시간을 계산하지 않았기 때문입니다. 순서를 뒤집으면 훨씬 쉬워집니다.`,
    steps: [
      {
        h: '1. 장소를 먼저 모은다 (순서는 나중에)',
        p: `숙소, 가고 싶은 맛집, 관광지를 순서 상관없이 전부 모읍니다. 이 단계에서 순서를 고민하면
          "이게 먼저인가 저게 먼저인가"에 갇혀 진도가 안 납니다.`,
      },
      {
        h: '2. 지도에 찍어보고 덩어리를 찾는다',
        p: `모은 장소를 지도에 올리면 대개 <strong>2~3개 덩어리</strong>로 뭉칩니다.
          하루에 한 덩어리씩 배치하는 것이 이동을 가장 크게 줄이는 방법입니다.
          지도에서 멀리 떨어진 하나 때문에 하루가 날아가는 일을 여기서 막습니다.`,
      },
      {
        h: '3. 구간별 이동 시간을 붙인다',
        p: `장소 사이마다 실제 이동 시간을 넣어야 하루에 몇 개가 들어가는지 보입니다.
          도보 15분과 대중교통 50분은 일정에서 전혀 다른 무게입니다.
          공항에서 시내로 들어가는 첫 구간은 특히 공항버스와 택시를 나란히 비교해 두면 좋습니다.`,
      },
      {
        h: '4. 고정된 시각만 못박는다',
        p: `항공편 도착, 예약된 투어처럼 <strong>움직일 수 없는 시각</strong>만 고정하고
          나머지는 이동 시간으로 자동 계산되게 둡니다. 그러면 순서를 바꿔도 일정이 저절로 다시 맞춰집니다.`,
      },
      {
        h: '5. 오프라인에서 열리는지 확인한다',
        p: `현지에서 데이터가 안 터지는 순간은 반드시 옵니다. 일정과 경로 안내, 예약 바우처가
          네트워크 없이 열리는지 출발 전에 한 번 확인해 두세요.`,
      },
    ],
    extras: [
      {
        h: '동선을 짤 때 흔한 실수',
        items: [
          '<strong>하루에 너무 많이 넣는다</strong> — 이동 시간을 더하면 대개 3~4곳이 한계입니다.',
          '<strong>왕복을 계산하지 않는다</strong> — 숙소로 돌아오는 시간도 이동입니다.',
          '<strong>휴식을 넣지 않는다</strong> — 식사와 이동만 채우면 셋째 날부터 무너집니다.',
          '<strong>영업시간을 안 본다</strong> — 스페인의 시에스타처럼 낮에 닫는 곳이 있습니다.',
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// 렌더링
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function groupByCategory(items) {
  const map = new Map()
  for (const it of items) {
    const arr = map.get(it.category)
    if (arr) arr.push(it)
    else map.set(it.category, [it])
  }
  return [...map]
}

const STYLE = `
:root{color-scheme:light dark;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--bg:#fff;--card:#f8fafc;--accent:#0284c7}
@media (prefers-color-scheme:dark){:root{--fg:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--bg:#0f172a;--card:#1e293b;--accent:#38bdf8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.7 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
  -webkit-text-size-adjust:100%}
.wrap{max-width:720px;margin:0 auto;padding:24px 20px 64px}
a{color:var(--accent)}
header nav{font-size:13px;color:var(--muted);margin-bottom:20px}
h1{font-size:26px;line-height:1.35;letter-spacing:-.02em;margin:0 0 12px}
h2{font-size:19px;margin:36px 0 10px;letter-spacing:-.01em}
h3{font-size:15px;margin:22px 0 6px;color:var(--muted)}
p{margin:0 0 14px}
.lead{color:var(--muted)}
ul{margin:0 0 14px;padding-left:20px}
li{margin:4px 0}
.cat{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 10px;background:var(--card)}
.cat h3{margin:0 0 6px;color:var(--fg);font-size:14px}
.cat ul{list-style:none;padding:0;margin:0}
.cat li{display:flex;gap:8px;align-items:baseline;font-size:14px;padding:3px 0}
.cat li span.n{color:var(--muted);font-size:12px}
.cat li a.rec{margin-left:auto;flex:none;background:#e0f2fe;color:#075985;border-radius:999px;
  padding:2px 9px;font-size:11px;text-decoration:none;white-space:nowrap}
@media (prefers-color-scheme:dark){.cat li a.rec{background:#082f49;color:#7dd3fc}}
.disclosure{border:1px solid var(--line);border-radius:10px;padding:10px 12px;
  font-size:12px;color:var(--muted);margin:20px 0}
.box{border:1px solid var(--line);border-radius:12px;padding:16px;margin:24px 0;background:var(--card)}
.cta{display:inline-block;background:var(--fg);color:var(--bg);text-decoration:none;
  padding:12px 18px;border-radius:10px;font-weight:600;font-size:15px}
footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
footer a{margin-right:14px}
.meta{font-size:13px;color:var(--muted);margin:-6px 0 20px}
`

function renderGuide(g) {
  const url = `${SITE}/guide/${g.slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    inLanguage: 'ko',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    publisher: { '@type': 'Organization', name: 'Leghop' },
  }

  const affiliate =
    (g.sections ?? []).some((s) =>
      hasAnyAffiliate(generateItems(s.ctx).map((i) => i.name)),
    )

  const sections = (g.sections ?? [])
    .map((s) => {
      const items = generateItems(s.ctx)
      const groups = groupByCategory(items)
      return `
<h2>${esc(s.heading)}</h2>
<p class="meta">${esc(s.note)} · 총 ${items.length}개 항목</p>
${groups
  .map(
    ([cat, list]) => `<div class="cat"><h3>${esc(cat)} <span class="n">${list.length}</span></h3><ul>${list
      .map((i) => {
        const link = recommendedLink(i.name)
        return `<li><span>${esc(i.name)}</span>${
          i.note ? `<span class="n">${esc(i.note)}</span>` : ''
        }${
          link
            ? `<a class="rec" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener noreferrer">추천템</a>`
            : ''
        }</li>`
      })
      .join('')}</ul></div>`,
  )
  .join('\n')}`
    })
    .join('\n')

  const steps = (g.steps ?? [])
    .map((s) => `<h2>${esc(s.h)}</h2><p>${s.p}</p>`)
    .join('\n')

  const extras = (g.extras ?? [])
    .map(
      (e) =>
        `<h2>${esc(e.h)}</h2><ul>${e.items.map((i) => `<li>${i}</li>`).join('')}</ul>`,
    )
    .join('\n')

  const others = GUIDES.filter((x) => x.slug !== g.slug)
    .map((x) => `<a href="/guide/${x.slug}">${esc(x.title.split(' — ')[0])}</a>`)
    .join('')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(g.title)} | Leghop</title>
<meta name="description" content="${esc(g.description)}">
<meta name="keywords" content="${esc(g.keywords.join(', '))}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0f172a">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(g.title)}">
<meta property="og:description" content="${esc(g.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="Leghop">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${GA_SNIPPET}
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header><nav><a href="/">Leghop</a> · 여행 가이드</nav></header>
<main>
<h1>${esc(g.title)}</h1>
<p class="lead">${g.lead}</p>
${affiliate ? `<p class="disclosure">${esc(DISCLOSURE)}</p>` : ''}
${sections}
${steps}
${extras}
<div class="box">
<h3 style="margin-top:0">이 목록을 직접 쓰려면</h3>
<p>Leghop에 여행 날짜와 도시를 넣으면 <strong>이 목록이 자동으로 만들어지고</strong>,
체크한 것이 함께 여행하는 사람과 공유됩니다. 장소를 모으면 하루 동선과 구간별
이동 시간도 자동으로 계산됩니다.</p>
<p style="margin:0"><a class="cta" href="/">Leghop 시작하기</a></p>
</div>
</main>
<footer>
${affiliate ? `<p>${esc(DISCLOSURE)}</p>` : ''}
<p>다른 가이드</p>
<p>${others}</p>
</footer>
</div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// 개인정보처리방침
//
// 내용은 코드에서 실제로 확인한 것만 쓴다 — 수집 항목은 DB 스키마,
// 제3자는 실제로 호출하는 서비스, 파기 절차는 delete_my_account() 함수.
// 방침과 구현이 어긋나는 것이 방침이 없는 것보다 나쁘다.
// ---------------------------------------------------------------------------

const OPERATOR = {
  name: 'Leghop 운영자 (개인)',
  email: 'samsara1019@naver.com',
  effective: '2026-08-05',
}

function renderPrivacy() {
  const url = `${SITE}/privacy`
  const sec = (h, body) => `<h2>${esc(h)}</h2>${body}`
  const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`

  const body = [
    `<p class="lead">Leghop(이하 "서비스")은 이용자의 개인정보를 중요하게 생각하며,
      개인정보보호법 등 관련 법령을 준수합니다. 이 방침은 서비스가 어떤 정보를
      어떤 목적으로 다루는지 설명합니다.</p>`,

    sec('1. 수집하는 개인정보 항목', `
      <h3>가입 시 (Google 로그인)</h3>
      ${ul([
        '<strong>이메일 주소</strong> — 계정 식별, 여행 공유 초대에 사용',
        '<strong>이름·프로필 사진</strong> — 함께 편집하는 사람에게 누구인지 보여주기 위해 사용 (Google 계정에 있는 경우)',
      ])}
      <p>비밀번호는 수집하지 않습니다. 인증은 Google이 처리하며 서비스는 비밀번호를 알 수 없습니다.</p>

      <h3>서비스 이용 중 이용자가 직접 입력하는 정보</h3>
      ${ul([
        '여행 제목·기간·방문 도시',
        '등록한 장소(이름·주소·좌표·메모)와 일정 구성',
        '준비물 체크리스트 항목과 체크 여부',
        '<strong>업로드한 서류 파일</strong> — 항공권·바우처·예약 확인서 등. 이용자가 여권 사본 등 민감할 수 있는 파일을 올릴 수 있습니다',
      ])}

      <h3>자동으로 수집되는 정보</h3>
      <p>서비스 개선을 위해 <strong>Google Analytics</strong>를 사용하며, 다음이
      자동으로 수집됩니다.</p>
      ${ul([
        '방문한 화면과 머문 시간, 유입 경로(검색어·참조 사이트)',
        '기기·브라우저 종류, 대략적인 지역(도시 수준)',
        '분석용 식별자(쿠키)',
      ])}
      <p>수집되는 화면 주소에서 <strong>여행 식별자는 제거</strong>한 뒤 전송합니다
      (예: <code>/trip/:tripId/plan</code>). 이용자가 입력한 여행 내용·장소·메모·서류는
      분석 도구로 전송되지 않습니다.</p>
      <p>브라우저의 쿠키 차단 설정이나
      <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google
      Analytics 차단 부가기능</a>으로 수집을 거부할 수 있으며, 거부해도 서비스 이용에
      제한이 없습니다.</p>
      <p>그 밖에 인프라 제공업체(아래 3항)의 서버 접속 기록이 보안·장애 대응 목적으로
      일정 기간 남을 수 있습니다.</p>`),

    sec('2. 이용 목적', ul([
      '계정 식별 및 로그인 유지',
      '여행 일정·장소·준비물·서류의 저장과 기기 간 동기화',
      '여행을 함께 편집하는 이용자 간 데이터 공유',
      '이동 경로 계산 등 서비스 기능 제공',
      '이용 통계 분석을 통한 서비스 개선',
    ])),

    sec('3. 처리 위탁 및 국외 이전', `
      <p>서비스는 아래 사업자의 인프라를 이용하며, 기능 수행에 필요한 범위에서만
      정보가 전달됩니다.</p>
      <table>
        <tr><th>수탁자</th><th>위탁 업무</th><th>전달되는 정보</th></tr>
        <tr><td>Supabase Inc.</td><td>인증·데이터베이스·파일 저장</td><td>계정 정보, 이용자가 입력·업로드한 모든 정보</td></tr>
        <tr><td>Vercel Inc.</td><td>웹 서비스 호스팅</td><td>접속 기록</td></tr>
        <tr><td>Google LLC</td><td>지도·장소 검색·경로 계산 (Google Maps Platform)</td><td>검색어, 지도에서 조회한 위치</td></tr>
        <tr><td>Google LLC</td><td>메모 자동 분류 (Gemini API) — 붙여넣기 기능을 쓸 때만</td><td>이용자가 붙여넣은 메모 텍스트</td></tr>
        <tr><td>Google LLC</td><td>이용 통계 분석 (Google Analytics)</td><td>화면 이동 기록, 기기·브라우저 정보, 분석용 식별자</td></tr>
      </table>
      <p>위 사업자의 서버는 국내 또는 국외에 위치할 수 있습니다. 이용자가 위탁에
      동의하지 않을 경우 서비스 이용이 제한될 수 있습니다.</p>
      <p><strong>서비스는 이용자의 개인정보를 판매하거나 광고 목적으로 제3자에게
      제공하지 않습니다.</strong></p>`),

    sec('4. 보유 및 파기', `
      <p>개인정보는 <strong>회원 탈퇴 시 지체 없이 파기</strong>됩니다.
      앱의 여행 목록 화면에서 직접 탈퇴할 수 있으며, 탈퇴 시 다음이 즉시 삭제됩니다.</p>
      ${ul([
        '계정 정보(이메일·이름·프로필 사진)',
        '본인이 만든 모든 여행과 그에 속한 장소·일정·준비물',
        '<strong>업로드한 서류 파일 전체</strong>',
        '다른 사람의 여행에 참여 중이던 기록 (해당 여행 자체는 소유자의 것이므로 남습니다)',
      ])}
      <p>여행을 개별적으로 삭제한 경우에도 그에 속한 데이터와 서류 파일이 함께 삭제됩니다.</p>
      <p>단말기에 저장된 오프라인 사본은 로그아웃 시 삭제됩니다.</p>`),

    sec('5. 이용자의 권리', `
      <p>이용자는 언제든지 자신의 정보를 조회·수정·삭제할 수 있습니다.
      대부분은 앱 안에서 직접 처리할 수 있으며, 그 밖의 요청은 아래 연락처로
      문의하시면 지체 없이 처리합니다.</p>`),

    sec('6. 안전성 확보 조치', ul([
      '데이터베이스에 <strong>행 수준 보안(RLS)</strong>을 적용해, 본인 또는 함께 편집하도록 초대된 사람만 해당 여행의 데이터에 접근할 수 있습니다',
      '업로드한 서류는 <strong>비공개 저장소</strong>에 보관하며, 링크를 아는 것만으로는 열람할 수 없습니다',
      '모든 통신은 HTTPS로 암호화됩니다',
      '비밀번호를 저장하지 않아 유출 위험이 없습니다',
    ])),

    sec('7. 광고·제휴 링크', `
      <p>준비물 목록의 일부 항목에는 쿠팡 파트너스 제휴 링크가 포함되어 있습니다.
      이 링크를 통해 구매가 이루어질 경우 운영자가 수수료를 받을 수 있으며,
      이용자의 구매 가격에는 영향이 없습니다.</p>
      <p>${esc(DISCLOSURE)}</p>
      <p>링크를 누르면 쿠팡으로 이동하며, 이후의 개인정보 처리는 쿠팡의 방침을 따릅니다.
      서비스는 이용자의 구매 정보를 수집하지 않습니다.</p>`),

    sec('8. 만 14세 미만 아동', `
      <p>서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를
      의도적으로 수집하지 않습니다.</p>`),

    sec('9. 문의처', `
      <p>개인정보 처리에 관한 문의·불만·피해 구제는 아래로 연락해 주십시오.</p>
      ${ul([
        `운영 주체: ${esc(OPERATOR.name)}`,
        `이메일: <a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a>`,
      ])}
      <p>그 밖의 개인정보 침해 신고는 개인정보침해신고센터(privacy.kisa.or.kr, 118),
      대검찰청 사이버수사과(1301), 경찰청 사이버수사국(182)에 문의하실 수 있습니다.</p>`),

    sec('10. 방침 변경', `
      <p>이 방침이 변경되는 경우 이 페이지에 변경 내용과 시행일을 게시합니다.</p>
      <p class="meta">시행일: ${esc(OPERATOR.effective)}</p>`),
  ].join('\n')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>개인정보처리방침 | Leghop</title>
<meta name="description" content="Leghop이 수집하는 개인정보 항목, 이용 목적, 보유 기간, 파기 절차와 이용자의 권리를 안내합니다.">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#0f172a">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${GA_SNIPPET}
<style>${STYLE}
table{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:13px}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:var(--card);font-weight:600;white-space:nowrap}</style>
</head>
<body>
<div class="wrap">
<header><nav><a href="/">Leghop</a> · 개인정보처리방침</nav></header>
<main>
<h1>개인정보처리방침</h1>
${body}
</main>
<footer><p><a href="/">Leghop 홈</a><a href="/guide/europe-packing">여행 가이드</a></p></footer>
</div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// 출력
// ---------------------------------------------------------------------------

// 슬러그마다 디렉토리 + index.html.
//
// `guide/foo.html`로 두면 확장자 없는 /guide/foo 가 404가 된다 —
// Vercel은 cleanUrls 없이 확장자를 붙여 찾아주지 않는다. 그리고 cleanUrls는
// 켤 수 없다(검색엔진 소유확인 .html 파일이 308로 넘어가 버린다).
// 디렉토리 index는 정적 호스팅의 기본 동작이라 어느 쪽도 건드리지 않는다.
for (const g of GUIDES) {
  const dir = join(DIST, 'guide', g.slug)
  mkdirSync(dir, { recursive: true })
  const html = renderGuide(g)
  writeFileSync(join(dir, 'index.html'), html)
  console.log(`guide/${g.slug}/index.html`.padEnd(38) + `${(html.length / 1024).toFixed(1)}KB`)
}

mkdirSync(join(DIST, 'privacy'), { recursive: true })
const privacyHtml = renderPrivacy()
writeFileSync(join(DIST, 'privacy', 'index.html'), privacyHtml)
console.log('privacy/index.html'.padEnd(38) + `${(privacyHtml.length / 1024).toFixed(1)}KB`)

const urls = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
  { loc: `${SITE}/privacy`, priority: '0.3', changefreq: 'yearly' },
  ...GUIDES.map((g) => ({
    loc: `${SITE}/guide/${g.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
  })),
]

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join('\n')}
</urlset>
`,
)
console.log('sitemap.xml'.padEnd(34) + `${urls.length} URL`)
