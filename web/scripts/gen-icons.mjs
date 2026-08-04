/**
 * PWA 아이콘 생성기 — 외부 의존성 없이 PNG를 직접 인코딩한다.
 *
 * 모티프: 기준선 위의 점 3개를 아치 2개가 잇는 형태.
 * 일정의 정거장(Item)과 그 사이를 잇는 구간(Leg) = "leg + hop".
 *
 *   node scripts/gen-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePNG, hex } from './png.mjs'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

// ---------- 도형 (좌표는 0..1 정규화) ----------

const BG = hex('#0f172a')
const ARC = hex('#38bdf8')
const DOT = hex('#f8fafc')
const DEST = hex('#34d399')

// PTS 간격의 절반이 곧 아치 반지름이어야 아치 끝이 점 위에 정확히 내려앉는다.
const PTS = [0.19, 0.5, 0.81]
const R_ARC = (PTS[1] - PTS[0]) / 2
const STROKE = 0.042
const R_DOT = 0.068
// 시각적 무게중심(아치 꼭대기 ~ 점 아래끝)을 캔버스 중앙에 맞춘다
const BASE_Y = 0.5 + (R_ARC + STROKE / 2 - R_DOT) / 2

function insideRoundedRect(x, y, pad, radius) {
  const lo = pad
  const hi = 1 - pad
  if (x < lo || x > hi || y < lo || y > hi) return false
  const cx = Math.min(Math.max(x, lo + radius), hi - radius)
  const cy = Math.min(Math.max(y, lo + radius), hi - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/** 위쪽 반원 스트로크 */
function onArc(x, y, cx) {
  if (y > BASE_Y) return false
  const d = Math.hypot(x - cx, y - BASE_Y)
  return Math.abs(d - R_ARC) <= STROKE / 2
}

function sampleColor(x, y, maskable) {
  const pad = maskable ? 0 : 0.055
  const radius = maskable ? 0 : 0.22

  const inBg = maskable ? true : insideRoundedRect(x, y, pad, radius)
  if (!inBg) return null

  for (let i = 0; i < PTS.length; i++) {
    if (Math.hypot(x - PTS[i], y - BASE_Y) <= R_DOT) {
      return i === PTS.length - 1 ? DEST : DOT
    }
  }
  if (onArc(x, y, (PTS[0] + PTS[1]) / 2)) return ARC
  if (onArc(x, y, (PTS[1] + PTS[2]) / 2)) return ARC

  return BG
}

function render(size, maskable) {
  const SS = 4 // 슈퍼샘플링 — 계단 현상 제거
  const rgba = Buffer.alloc(size * size * 4)

  // maskable은 안전 영역(중앙 80%) 안에 들어가도록 축소한다
  const scale = maskable ? 1 / 0.78 : 1
  const shift = maskable ? (1 - 0.78) / 2 / 0.78 : 0

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (px + (sx + 0.5) / SS) / size
          const uy = (py + (sy + 0.5) / SS) / size
          const c = sampleColor(ux / scale + shift, uy / scale + shift, maskable)
          if (c) {
            r += c[0]
            g += c[1]
            b += c[2]
            a += 255
          }
        }
      }
      const n = SS * SS
      const i = (py * size + px) * 4
      if (a > 0) {
        // 알파 가중 평균 — 투명 배경과 섞일 때 색이 어두워지지 않게
        const cov = a / n / 255
        rgba[i] = Math.round(r / (n * cov))
        rgba[i + 1] = Math.round(g / (n * cov))
        rgba[i + 2] = Math.round(b / (n * cov))
        rgba[i + 3] = Math.round(a / n)
      }
    }
  }
  return encodePNG(size, size, rgba)
}

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]

for (const [name, size, maskable] of targets) {
  const png = render(size, maskable)
  writeFileSync(join(OUT_DIR, name), png)
  console.log(`${name.padEnd(24)} ${size}×${size}  ${(png.length / 1024).toFixed(1)}KB`)
}
