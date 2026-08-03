/**
 * Gemini 중계 로직 (DESIGN.md §8).
 *
 * 브라우저가 Gemini를 직접 부르면 API 키가 노출된다. 이 프록시는 키를 감추는 것
 * 하나만 담당한다. Google Maps 쪽(Places/Directions/Maps JS)은 브라우저가 referrer
 * 제한된 키로 직접 호출하므로 여기로 오지 않는다.
 *
 * **왜 Cloudflare Workers가 아니라 Vercel인가**
 * Workers는 한국에서 호출해도 홍콩(HKG) 콜로에서 실행되고, 홍콩은 Gemini
 * 미지원 지역이라 `User location is not supported`(400)가 난다. Smart Placement로도
 * 안 바뀌었다. Vercel Functions는 Node 런타임에서 `regions`로 실행 지역을
 * 고정할 수 있어서 이 문제를 확실히 피한다 (vercel.json: iad1 = 미국 동부).
 * Edge 런타임을 쓰면 지역 고정이 안 되므로 같은 문제가 재현된다.
 */

export interface ParseEnv {
  GEMINI_API_KEY?: string
  /** 쉼표 구분. 비우면 localhost만 허용 */
  ALLOWED_ORIGINS?: string
  GEMINI_MODEL?: string
}

export const DEFAULT_MODEL = 'gemini-3.6-flash'

/** 요청으로 바꿔 끼울 수 있는 모델. 임의 문자열을 그대로 넘기지 않는다. */
const ALLOWED_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
]

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
const MAX_INPUT_CHARS = 8000

/**
 * 응답 스키마. Gemini는 OpenAPI 서브셋을 쓰고 타입명이 대문자다.
 *
 * 필드 의미를 **description에 둔다.** 시스템 지시문에만 적어두면 모델이 사고를
 * 끈 상태에서 출력을 폭주시켜 MAX_TOKENS로 잘린다.
 *
 * description에 **구체적 예시를 넣지 않는다.** 예시가 값으로 복사된다 —
 * "09:40 BCN 공항 도착"을 넣었더니 title에 예시문 "입국 심사 및 짐 찾기"가 나왔다.
 */
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      kind: {
        type: 'STRING',
        enum: ['stop', 'activity', 'transfer'],
        description:
          'stop=방문하는 장소, activity=이동 없는 활동(입국심사·체크인·휴식), transfer=이동 수단만 적힌 구간',
      },
      query: {
        type: 'STRING',
        description:
          'kind=stop일 때만. 메모에 적힌 장소 이름을 구글맵 검색어로. 알면 현지 표기, 모르면 적힌 대로. 조사와 동작(에서/먹기/가기)은 뺀다. 도시명은 붙이지 않는다.',
      },
      title: {
        type: 'STRING',
        description:
          'kind=activity일 때만. 메모에 적힌 활동 표현을 짧게 그대로. 부연 설명 금지.',
      },
      modeHints: {
        type: 'ARRAY',
        items: {
          type: 'STRING',
          enum: ['transit', 'walking', 'driving', 'bicycling'],
        },
        description:
          'kind=transfer일 때만. 버스·지하철·기차=transit, 택시·렌터카=driving, 도보=walking, 자전거=bicycling. 여러 수단이 적혀 있으면 모두 담는다.',
      },
      startAt: {
        type: 'STRING',
        description:
          '메모에 시각이 적혀 있을 때만. HH:MM 24시간제. 적혀 있지 않으면 생략한다.',
      },
      durationMin: {
        type: 'INTEGER',
        description:
          '분 단위 체류 시간. 메모에 적혀 있으면 그 값, 없으면 활동 성격에 맞는 추정치. transfer에는 넣지 않는다.',
      },
      note: {
        type: 'STRING',
        description: '메모에 적힌 사용자 의도를 몇 단어로. 메모에 없으면 생략한다.',
      },
    },
    required: ['kind'],
    propertyOrdering: [
      'kind',
      'query',
      'title',
      'modeHints',
      'startAt',
      'durationMin',
      'note',
    ],
  },
}

const SYSTEM_INSTRUCTION = `여행 메모를 일정 항목 배열로 바꾼다. 메모에 적힌 순서를 유지한다.

각 필드는 스키마의 description대로 채운다. 값만 쓴다 — 설명, 근거, 대안 검토를 값 안에 넣지 마라.
메모에 없는 내용을 만들지 마라. 스키마 설명은 형식 안내일 뿐이며, 그 안의 표현을 값으로 옮겨 쓰면 안 된다.
한 줄에 여러 항목이 섞여 있으면 나눈다.

시간이 적혀 있지 않을 때 쓰는 체류 시간 기준(분): 공항 입국 절차 80, 숙소 체크인 30, 식사 90, 박물관·미술관·성당 120, 그 외 60.`

export function allowedOrigins(env: ParseEnv): string[] {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ORIGINS
}

export function corsHeaders(
  origin: string | undefined,
  env: ParseEnv,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

/** 실행 지역. Gemini 지역 제한 진단의 유일한 단서다 — 반드시 응답에 남긴다. */
export function whereAmI(): { region?: string } {
  return { region: process.env.VERCEL_REGION ?? 'local' }
}

export interface ParseBody {
  text?: unknown
  cityHint?: unknown
  model?: unknown
  thinkingLevel?: unknown
}

export interface ParseResult {
  status: number
  body: Record<string, unknown>
}

export async function runParse(
  body: ParseBody,
  env: ParseEnv,
): Promise<ParseResult> {
  if (!env.GEMINI_API_KEY) {
    return { status: 500, body: { error: 'missing_api_key' } }
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return { status: 400, body: { error: 'empty_text' } }
  if (text.length > MAX_INPUT_CHARS) {
    return {
      status: 413,
      body: { error: 'text_too_long', max: MAX_INPUT_CHARS },
    }
  }

  const cityHint = typeof body.cityHint === 'string' ? body.cityHint.trim() : ''
  const requested = typeof body.model === 'string' ? body.model : ''
  const model = ALLOWED_MODELS.includes(requested)
    ? requested
    : env.GEMINI_MODEL || DEFAULT_MODEL

  const prompt = cityHint
    ? `도시: ${cityHint}\n\n여행 메모:\n${text}`
    : `여행 메모:\n${text}`

  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
            // 사고 토큰도 출력 예산을 먹는다
            maxOutputTokens: 4096,
            // 사고를 켜두면 추론이 출력 필드로 새어 들어온다. 단순 추출이라 필요 없다.
            // (thinkingBudget은 Gemini 3에서 400 — thinkingLevel이 맞는 필드)
            thinkingConfig: {
              thinkingLevel: body.thinkingLevel === 'high' ? 'high' : 'low',
            },
          },
        }),
      },
    )
  } catch (err) {
    return {
      status: 502,
      body: { error: 'upstream_unreachable', detail: String(err), meta: { model, ...whereAmI() } },
    }
  }

  if (!upstream.ok) {
    return {
      status: 502,
      body: {
        error: 'upstream_error',
        status: upstream.status,
        detail: await upstream.text(),
        meta: { model, ...whereAmI() },
      },
    }
  }

  const payload = (await upstream.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] }
      finishReason?: string
    }[]
    usageMetadata?: Record<string, number>
  }
  const candidate = payload.candidates?.[0]
  const raw = candidate?.content?.parts?.[0]?.text
  // finishReason이 MAX_TOKENS면 응답이 잘린 것이고, 그게 대개 이상한 결과의 원인이다
  const meta = {
    model,
    finishReason: candidate?.finishReason,
    usage: payload.usageMetadata,
    ...whereAmI(),
  }

  if (!raw) return { status: 502, body: { error: 'empty_response', meta, payload } }

  // responseSchema를 걸었으므로 파싱은 사실상 실패하지 않지만,
  // 안전 필터로 잘린 응답이 오면 여기로 떨어진다.
  try {
    return { status: 200, body: { items: JSON.parse(raw), meta } }
  } catch {
    return { status: 502, body: { error: 'unparseable_response', meta, raw } }
  }
}
