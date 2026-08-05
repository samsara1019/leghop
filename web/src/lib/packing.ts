import type { Destination } from '../db/schema'
import { eachDateISO, fromISODate } from './dates'
import { sortDestinations } from './destinations'

/**
 * 여행 준비물 템플릿.
 *
 * 기본 목록은 고정이고, **지역과 계절에 따라 항목이 붙거나 빠진다.**
 * 매번 LLM에 물어 만들지 않는다 — 준비물은 대체로 정해져 있고, 생성형에 맡기면
 * 실행마다 목록이 달라져서 "지난번엔 있었는데" 하는 문제가 생긴다.
 * 대신 사용자가 직접 항목을 추가할 수 있게 해뒀다.
 */

export type Region = 'europe' | 'southeast-asia' | 'japan' | 'americas' | 'other'

export interface PackingContext {
  region: Region
  /** 여행 시작 월 (1~12) */
  month: number
  /** 여행 일수 */
  nights: number
  cities: string[]
  multiCity: boolean
  /** 장거리 비행 여부 — 기내 준비물의 필요도를 가른다 */
  longHaul: boolean
}

/**
 * 좌표로 지역을 추정한다.
 *
 * `Destination.countryCode`가 있으면 그걸 쓰는 게 정확하지만, Places 검색에서
 * 국가 코드를 받아오지 않으므로 대부분 비어 있다. 좌표는 항상 있어서 이게 더
 * 실용적이다. 어긋나도 준비물 몇 개 차이라 위험이 작다.
 */
export function inferRegion(dest?: { lat: number; lng: number }): Region {
  if (!dest) return 'other'
  const { lat, lng } = dest
  if (lat >= 34 && lat <= 72 && lng >= -25 && lng <= 45) return 'europe'
  if (lat >= 30 && lat <= 46 && lng >= 128 && lng <= 146) return 'japan'
  if (lat >= -11 && lat <= 24 && lng >= 92 && lng <= 141) return 'southeast-asia'
  if (lng >= -170 && lng <= -30) return 'americas'
  return 'other'
}

export function buildContext(
  destinations: Destination[],
  startDate: string,
  endDate: string,
): PackingContext {
  const cities = sortDestinations(destinations)
  const first = cities[0]
  const region = inferRegion(first)
  const month = fromISODate(startDate).getMonth() + 1
  return {
    region,
    month,
    nights: Math.max(1, eachDateISO(startDate, endDate).length),
    cities: cities.map((c) => c.name),
    multiCity: cities.length > 1,
    longHaul: region === 'europe' || region === 'americas',
  }
}

// ---------------------------------------------------------------------------
// 추천템 (쿠팡 파트너스)
//
// **DB에 저장하지 않는다.** 링크는 템플릿에 속하는 정보이고 사용자 데이터가
// 아니다. 이름으로 조회하면 링크를 바꿔도 배포만으로 반영되고, 이미 만들어진
// 체크리스트에 "템플릿 다시 적용"을 눌러야 할 이유가 없어진다.
//
// 대가성 문구(DISCLOSURE)는 제휴 링크가 노출되는 화면에 **반드시** 함께 띄운다.
// 공정거래위원회 심사지침에 따른 의무이고, 빠지면 제재 대상이다.
// ---------------------------------------------------------------------------

export const DISCLOSURE =
  '이 페이지는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'

/** 항목 이름 → 쿠팡 파트너스 단축코드 */
const AFFILIATE_CODES: Record<string, string> = {
  '볼펜': 'fWf5J6aUbk',
  'eSIM / 유심': 'fWf8BazHUa',
  '힙색 / 크로스백': 'fWga7GKvaS',
  '스트랩 폰케이스': 'fWgfBe8E68',
  '일반 자물쇠': 'fWgenvrPzM',
  '와이어 자물쇠': 'fWggYsRnxY',
  '카라비너': 'fWgh2F62Ls',
  '보스턴백': 'fWgjGq25w4',
  '휴대폰 충전기': 'fWglLyalrw',
  '멀티어댑터': 'fWgw9ZGyJw',
  '3in1 충전기': 'fWgyQnffgq',
  '보조배터리': 'fWgAwOjgPc',
  '에어팟 / 이어폰': 'fWgCcqKxLo',
  '에어팟 맥스': 'fWgBpwZB5E',
  '카메라': 'fWgDtMhdGS',
  '미니 삼각대': 'fWgEqKiG1Q',
  '애플워치 / 스마트워치': 'fWgFbsWyMS',
  '손풍기': 'fWgFYYqBVs',
  '가습 마스크': 'fWgGSYCarI',
  '목베개': 'fWgIoIGwlE',
  '수면안대': 'fWgJtnbF3k',
  '기내 보습 화장품': 'fWgLp2wnhk',
  '종아리 압박밴드': 'fWgNxzZIR2',
  '슬리퍼': 'fWgPPIQwSq',
  '양산': 'fWgRweWG4W',
  '샤워기필터': 'fWgTZh2Q0G',
  '휴대용 세제': 'fWgXIwMxga',
  '선크림': 'fWg5atCS4W',
  '기내 보습제품': 'fWg3IdhEXY',
  '물티슈': 'fWgZKeOmNE',
  '휴족시간': 'fXgUGX8BhY',
  '캐리어 저울': 'fWgYXgTBD2',
  '피크닉매트': 'fWg1UQ6Mq4',
}

export function recommendedLink(name: string): string | undefined {
  const code = AFFILIATE_CODES[name]
  return code ? `https://link.coupang.com/a/${code}` : undefined
}

/** 제휴 링크가 하나라도 있는지 — 대가성 문구를 띄울지 판단한다 */
export function hasAnyAffiliate(names: string[]): boolean {
  return names.some((n) => n in AFFILIATE_CODES)
}

interface TemplateItem {
  category: string
  name: string
  note?: string
  /** 조건이 없으면 항상 포함 */
  when?: (c: PackingContext) => boolean
}

const summer = (c: PackingContext) => c.month >= 6 && c.month <= 8
const winter = (c: PackingContext) => c.month === 12 || c.month <= 2
const europe = (c: PackingContext) => c.region === 'europe'
const tropics = (c: PackingContext) => c.region === 'southeast-asia'

const TEMPLATE: TemplateItem[] = [
  // ── 필수 서류
  { category: '필수 서류', name: '여권', note: '만료일 6개월 이상 확인' },
  { category: '필수 서류', name: '여권 사본', note: '휴대폰 저장 + 출력본' },
  { category: '필수 서류', name: '항공권 출력본' },
  { category: '필수 서류', name: '예약 내역 사본', note: '숙소/투어/맛집 예약' },
  { category: '필수 서류', name: '여행자 보험' },
  { category: '필수 서류', name: '국제운전면허증', note: '렌트 예정 시' },
  { category: '필수 서류', name: '볼펜', note: '입국서류 작성용' },
  {
    category: '필수 서류',
    name: 'ETIAS / 입국 사전신고 확인',
    note: '유럽 입국 요건이 바뀌었을 수 있으니 출발 전 확인',
    when: europe,
  },

  // ── 금융
  { category: '금융', name: '현지 현금', note: '소액 지폐 위주로 준비' },
  { category: '금융', name: '트래블월렛' },
  { category: '금융', name: '신용·체크카드', note: '예비 카드 포함' },
  {
    category: '금융',
    name: '화장실용 잔돈',
    note: '유럽은 공중화장실이 유료인 곳이 많다',
    when: europe,
  },

  // ── 통신
  { category: '통신', name: 'eSIM / 유심' },
  { category: '통신', name: '온라인 체크인 확인', note: '항공 앱 등록' },

  // ── 가방/보안
  { category: '가방/보안', name: '힙색 / 크로스백', note: '소매치기 대비' },
  { category: '가방/보안', name: '스트랩 폰케이스' },
  { category: '가방/보안', name: '일반 자물쇠' },
  { category: '가방/보안', name: '와이어 자물쇠', note: '캐리어/숙소 보안' },
  { category: '가방/보안', name: '카라비너' },
  { category: '가방/보안', name: '가방걸이', note: '선택' },
  { category: '가방/보안', name: '보스턴백', note: '선택' },

  // ── 전자기기
  { category: '전자기기', name: '휴대폰 충전기' },
  {
    category: '전자기기',
    name: '멀티어댑터',
    note: '유럽형 C타입',
    when: europe,
  },
  {
    category: '전자기기',
    name: '멀티어댑터',
    note: '현지 콘센트 규격 확인',
    when: (c) => !europe(c),
  },
  { category: '전자기기', name: '3in1 충전기', note: '워치/에어팟 등' },
  { category: '전자기기', name: '보조배터리', note: '기내 반입 (위탁 불가)' },
  { category: '전자기기', name: '에어팟 / 이어폰' },
  { category: '전자기기', name: '에어팟 맥스' },
  { category: '전자기기', name: '카메라' },
  { category: '전자기기', name: '미니 삼각대' },
  { category: '전자기기', name: '애플워치 / 스마트워치' },
  { category: '전자기기', name: '손풍기', note: '더운 시기 필수', when: summer },

  // ── 기내 준비물
  {
    category: '기내 준비물',
    name: '가습 마스크',
    note: '장거리 비행용',
    when: (c) => c.longHaul,
  },
  { category: '기내 준비물', name: '목베개', when: (c) => c.longHaul },
  { category: '기내 준비물', name: '수면안대', when: (c) => c.longHaul },
  { category: '기내 준비물', name: '기내 보습 화장품', when: (c) => c.longHaul },
  {
    category: '기내 준비물',
    name: '종아리 압박밴드',
    when: (c) => c.longHaul,
  },

  // ── 의류
  { category: '의류', name: '상의/하의' },
  { category: '의류', name: '속옷' },
  { category: '의류', name: '양말' },
  { category: '의류', name: '잠옷' },
  { category: '의류', name: '편한 신발', note: '많이 걷는 일정' },
  { category: '의류', name: '슬리퍼' },
  { category: '의류', name: '모자' },
  { category: '의류', name: '선글라스' },
  {
    category: '의류',
    name: '큰 스카프',
    note: '성당·사원 입장 시 어깨·무릎 가림 필요',
    when: (c) => europe(c) || tropics(c),
  },
  { category: '의류', name: '양산', note: '햇빛 대비', when: summer },
  {
    category: '의류',
    name: '얇은 겉옷',
    note: '일교차 대비 — 실내 냉방도 강하다',
    when: summer,
  },
  { category: '의류', name: '히트텍 / 내복', when: winter },
  { category: '의류', name: '장갑 · 목도리', when: winter },
  { category: '의류', name: '우비 / 접이식 우산', when: tropics },

  // ── 세면/위생
  { category: '세면/위생', name: '칫솔' },
  { category: '세면/위생', name: '치약' },
  { category: '세면/위생', name: '클렌징폼' },
  { category: '세면/위생', name: '샴푸' },
  { category: '세면/위생', name: '트리트먼트' },
  { category: '세면/위생', name: '바디워시' },
  { category: '세면/위생', name: '바디타올' },
  {
    category: '세면/위생',
    name: '샤워기필터',
    note: '유럽 석회수 대비',
    when: europe,
  },
  { category: '세면/위생', name: '화장솜' },
  { category: '세면/위생', name: '면봉' },
  { category: '세면/위생', name: '머리끈 / 헤어핀' },
  { category: '세면/위생', name: '손톱깎이' },
  { category: '세면/위생', name: '제모기' },
  {
    category: '세면/위생',
    name: '휴대용 세제',
    note: '4일 이상이면 한 번은 빨래하게 된다',
    when: (c) => c.nights >= 4,
  },
  { category: '세면/위생', name: '빨래줄 + 집게', when: (c) => c.nights >= 4 },

  // ── 화장품
  { category: '화장품', name: '스킨케어' },
  { category: '화장품', name: '화장품' },
  { category: '화장품', name: '선크림', note: 'SPF50 추천' },
  { category: '화장품', name: '기내 보습제품', when: (c) => c.longHaul },
  { category: '화장품', name: '립밤', note: '건조한 실내·기내 대비' },

  // ── 상비약
  { category: '상비약', name: '감기약' },
  { category: '상비약', name: '해열진통제' },
  { category: '상비약', name: '소화제' },
  { category: '상비약', name: '지사제' },
  { category: '상비약', name: '멀미약' },
  { category: '상비약', name: '밴드' },
  { category: '상비약', name: '여성용품' },
  {
    category: '상비약',
    name: '모기퇴치제',
    note: '열대 지역은 강도 높은 제품 권장',
    when: (c) => tropics(c) || summer(c),
  },
  {
    category: '상비약',
    name: '지사제 · 정수 필요 여부 확인',
    note: '수돗물을 못 마시는 지역인지 확인',
    when: tropics,
  },

  // ── 생활용품
  { category: '생활용품', name: '물티슈' },
  { category: '생활용품', name: '지퍼백' },
  { category: '생활용품', name: '휴족시간', note: '많이 걷는 일정' },
  { category: '생활용품', name: '캐리어 저울' },
  { category: '생활용품', name: '피크닉매트', note: '선택' },
  { category: '생활용품', name: '라면' },
  {
    category: '생활용품',
    name: '텀블러 / 물통',
    note: '더운 시기엔 물값이 만만치 않다',
    when: summer,
  },
  {
    category: '생활용품',
    name: '접이식 보조가방',
    note: '도시를 옮길 때 짐이 늘어난다',
    when: (c) => c.multiCity,
  },
]

/** 카테고리 표시 순서. 템플릿에 등장하는 순서를 그대로 쓴다. */
export const CATEGORY_SEQUENCE = [
  '필수 서류',
  '금융',
  '통신',
  '가방/보안',
  '전자기기',
  '기내 준비물',
  '의류',
  '세면/위생',
  '화장품',
  '상비약',
  '생활용품',
]

export interface GeneratedItem {
  category: string
  name: string
  note?: string
  order: number
}

export function generateItems(ctx: PackingContext): GeneratedItem[] {
  const seen = new Set<string>()
  const out: GeneratedItem[] = []
  for (const t of TEMPLATE) {
    if (t.when && !t.when(ctx)) continue
    // 같은 이름이 조건에 따라 둘 있을 수 있다(멀티어댑터). 먼저 걸린 쪽만 쓴다.
    if (seen.has(t.name)) continue
    seen.add(t.name)
    out.push({
      category: t.category,
      name: t.name,
      note: t.note,
      order: out.length,
    })
  }
  return out
}

const REGION_LABEL: Record<Region, string> = {
  europe: '유럽',
  'southeast-asia': '동남아',
  japan: '일본',
  americas: '미주',
  other: '기타 지역',
}

/** 어떤 기준으로 목록이 만들어졌는지 화면에 보여준다 */
export function describeContext(ctx: PackingContext): string {
  const bits = [REGION_LABEL[ctx.region], `${ctx.month}월`, `${ctx.nights}일`]
  if (ctx.multiCity) bits.push(`${ctx.cities.length}개 도시`)
  return bits.join(' · ')
}
