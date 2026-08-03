import type { VercelRequest, VercelResponse } from '@vercel/node'
import { corsHeaders, whereAmI, type ParseEnv } from '../lib/parse.js'

/** 배포 직후 키·실행 지역을 확인하는 용도. 지역이 미국이 아니면 Gemini가 막힌다. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const e: ParseEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  }
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
  for (const [k, v] of Object.entries(corsHeaders(origin, e))) res.setHeader(k, v)
  res.status(200).json({
    ok: true,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    ...whereAmI(),
  })
}
