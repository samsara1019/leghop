/**
 * Leghop Worker — Gemini 중계 전용 (DESIGN.md §6).
 *
 * 브라우저가 Gemini를 직접 부르면 API 키가 노출된다. 이 Worker는 키를 감추는 것
 * 하나만 담당하고, Google Maps 쪽(Places/Directions/Maps JS)은 브라우저가 referrer
 * 제한된 키로 직접 호출한다 — 그래서 여기로 넘어오지 않는다.
 */

export interface Env {
  GEMINI_API_KEY: string
  /** 쉼표 구분. 비우면 localhost만 허용 */
  ALLOWED_ORIGINS?: string
  /** 기본 gemini-3.6-flash. 품질이 모자라면 gemini-3.5-flash로 승급 */
  GEMINI_MODEL?: string
}

const DEFAULT_MODEL = 'gemini-3.6-flash'
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
const MAX_INPUT_CHARS = 8000

/** DESIGN.md §8의 응답 스키마. Gemini는 OpenAPI 서브셋을 쓰고 타입명이 대문자다. */
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      kind: { type: 'STRING', enum: ['stop', 'activity', 'transfer'] },
      query: { type: 'STRING' },
      title: { type: 'STRING' },
      modeHints: {
        type: 'ARRAY',
        items: {
          type: 'STRING',
          enum: ['transit', 'walking', 'driving', 'bicycling'],
        },
      },
      durationMin: { type: 'INTEGER' },
      note: { type: 'STRING' },
    },
    required: ['kind'],
  },
}

const SYSTEM_INSTRUCTION = `너는 여행 메모를 일정 데이터로 바꾸는 파서다. 설명이나 인사말 없이 JSON 배열만 낸다.

입력은 사람이 손으로 쓴 여행 계획 메모다. 줄 단위로 읽되, 한 줄에 여러 항목이 섞여 있으면 나눠라.
항목을 메모에 적힌 순서 그대로 배열에 담는다.

각 항목의 kind는 셋 중 하나다.

- "stop": 실제로 방문하는 장소. query에 구글맵에서 검색될 만한 이름을 넣는다.
  현지 표기를 우선한다. "라 플라우타" → query: "La Flauta".
  한국어 음차만 있고 원어를 모르면 음차 그대로 둔다.
  도시명은 기본적으로 붙이지 마라 — 호출부가 지역 편향을 이미 걸어둔다.
  단, 메모에 주어진 도시와 다른 지역이 언급되면 그 지역명을 query에 붙여라.
  ("몬세라트 수도원" 같은 근교 일정이 여기 해당한다)
- "activity": 장소 이동이 아닌 활동. 공항 입국심사, 짐 찾기, 체크인, 휴식 등.
  title에 활동명을 넣는다. query는 넣지 않는다.
- "transfer": 이동 수단이 명시된 구간. modeHints에 후보를 넣는다.
  공항버스/버스/지하철/기차 → "transit", 택시/렌터카 → "driving", 도보 → "walking", 자전거 → "bicycling".
  "A 또는 B"처럼 여러 수단이 적혀 있으면 모두 담는다.

durationMin은 메모에 시간이 적혀 있으면 그 값을, 없으면 상식적인 추정치를 넣는다.
입국심사+짐찾기 80, 호텔 체크인 30, 식사 90, 미술관/성당 관람 120 정도가 기준이다.
transfer에는 durationMin을 넣지 마라 — 실제 소요시간은 Directions API가 계산한다.

note에는 메모에 적힌 사용자의 의도를 짧게 남긴다. "꿀대구", "사전 예약 필요" 같은 것.
없으면 생략한다.

메모에 없는 장소를 지어내지 마라.`

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ORIGINS

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function json(body: unknown, status: number, extra: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(origin, env)
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (url.pathname === '/health') {
      return json({ ok: true, hasKey: Boolean(env.GEMINI_API_KEY) }, 200, cors)
    }

    if (url.pathname !== '/parse') {
      return json({ error: 'not_found' }, 404, cors)
    }

    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors)
    }

    // 허용 목록에 없는 출처는 여기서 끊는다. CORS는 브라우저만 막아주므로
    // 서버 쪽에서도 한 번 더 확인해야 키가 남용되지 않는다.
    if (!cors['Access-Control-Allow-Origin']) {
      return json({ error: 'origin_not_allowed' }, 403, cors)
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: 'missing_api_key' }, 500, cors)
    }

    let body: { text?: unknown; cityHint?: unknown }
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid_json' }, 400, cors)
    }

    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) {
      return json({ error: 'empty_text' }, 400, cors)
    }
    if (text.length > MAX_INPUT_CHARS) {
      return json({ error: 'text_too_long', max: MAX_INPUT_CHARS }, 413, cors)
    }

    const cityHint = typeof body.cityHint === 'string' ? body.cityHint.trim() : ''
    const model = env.GEMINI_MODEL || DEFAULT_MODEL

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
            },
          }),
        },
      )
    } catch (err) {
      return json(
        { error: 'upstream_unreachable', detail: String(err) },
        502,
        cors,
      )
    }

    if (!upstream.ok) {
      const detail = await upstream.text()
      return json(
        { error: 'upstream_error', status: upstream.status, detail },
        502,
        cors,
      )
    }

    const payload = (await upstream.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text

    if (!raw) {
      return json({ error: 'empty_response', payload }, 502, cors)
    }

    // responseSchema를 걸었으므로 파싱은 사실상 실패하지 않지만,
    // 안전 필터로 잘린 응답이 오면 여기로 떨어진다.
    try {
      return json({ items: JSON.parse(raw) }, 200, cors)
    } catch {
      return json({ error: 'unparseable_response', raw }, 502, cors)
    }
  },
}
