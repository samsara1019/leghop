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

const urls = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
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
