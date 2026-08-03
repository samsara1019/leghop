import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsHeaders, runParse, type ParseBody, type ParseEnv } from '../lib/parse.js'

function env(): ParseEnv {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const e = env()
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  const cors = corsHeaders(origin, e)
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  // 허용 목록에 없는 출처는 여기서 끊는다. CORS는 브라우저만 막아주므로
  // 서버 쪽에서도 한 번 더 확인해야 키가 남용되지 않는다.
  if (!cors['Access-Control-Allow-Origin']) {
    res.status(403).json({ error: 'origin_not_allowed' })
    return
  }

  // Vercel은 Content-Type이 JSON이면 req.body를 파싱해 준다.
  // 문자열로 오는 경우(다른 Content-Type)도 대비한다.
  let body: ParseBody
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as ParseBody
    } catch {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body as ParseBody
  } else {
    res.status(400).json({ error: 'invalid_json' })
    return
  }

  const result = await runParse(body, e)
  res.status(result.status).json(result.body)
}
