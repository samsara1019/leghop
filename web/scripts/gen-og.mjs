/**
 * 공유 미리보기 이미지(1200×630). 아이콘과 같은 모티프를 쓴다.
 * 텍스트는 넣지 않는다 — 폰트 없이 한글을 그리려면 글리프를 직접 찍어야 하고,
 * 그 품질로는 안 넣는 편이 낫다. 제목은 og:title이 담당한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePNG, hex } from './png.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const W = 1200
const H = 630

const BG = hex('#0f172a')
const ARC = hex('#38bdf8')
const DOT = hex('#f8fafc')
const DEST = hex('#34d399')

// 가로가 넓으므로 점 4개로 늘려 여정 느낌을 준다
const PTS = [0.2, 0.4, 0.6, 0.8]
const R_ARC = (PTS[1] - PTS[0]) / 2
const STROKE = 0.014
const R_DOT = 0.024
const BASE_Y = 0.56

const aspect = W / H

function sample(x, y) {
  // y를 가로 기준으로 정규화해 원이 찌그러지지 않게 한다
  const ny = (y - BASE_Y) * (1 / aspect) + BASE_Y
  for (let i = 0; i < PTS.length; i++) {
    if (Math.hypot(x - PTS[i], (ny - BASE_Y)) <= R_DOT) {
      return i === PTS.length - 1 ? DEST : DOT
    }
  }
  for (let i = 0; i < PTS.length - 1; i++) {
    const cx = (PTS[i] + PTS[i + 1]) / 2
    if (ny <= BASE_Y) {
      const d = Math.hypot(x - cx, ny - BASE_Y)
      if (Math.abs(d - R_ARC) <= STROKE / 2) return ARC
    }
  }
  return BG
}

const SS = 3
const rgba = Buffer.alloc(W * H * 4)
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    let r = 0, g = 0, b = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample((px + (sx + 0.5) / SS) / W, (py + (sy + 0.5) / SS) / H)
        r += c[0]; g += c[1]; b += c[2]
      }
    }
    const n = SS * SS
    const i = (py * W + px) * 4
    rgba[i] = Math.round(r / n)
    rgba[i + 1] = Math.round(g / n)
    rgba[i + 2] = Math.round(b / n)
    rgba[i + 3] = 255
  }
}
mkdirSync(OUT, { recursive: true })
const png = encodePNG(W, H, rgba)
writeFileSync(join(OUT, 'og.png'), png)
console.log(`og.png${' '.repeat(28)}${W}×${H}  ${(png.length / 1024).toFixed(1)}KB`)
