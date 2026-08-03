/**
 * 붙여넣기 내용을 표와 산문으로 갈라낸다.
 *
 * 엑셀·구글시트는 클립보드에 `text/html`로 진짜 <table>을 얹어준다. 그걸 쓰면
 * 열 구조가 정확히 남으므로 LLM을 부를 이유가 없다 — 비용도 지연도 0이다.
 * HTML이 없으면 탭 구분을 보고, 그것도 아니면 산문으로 넘긴다.
 */

export interface TableData {
  kind: 'table'
  headers: string[] | null
  rows: string[][]
}

export interface ProseData {
  kind: 'prose'
  lines: string[]
}

export type ParsedClipboard = TableData | ProseData

const HEADER_HINTS = [
  '장소', '이름', '상호', '명칭', 'name', 'place',
  '메모', '비고', '설명', 'note', 'memo',
  '분류', '카테고리', '유형', 'category', 'type',
  '소요', '시간', 'duration', '체류',
  '시각', '출발', '도착', 'start', 'time',
  '주소', 'address',
]

function cleanCell(v: string): string {
  // 엑셀 클립보드 HTML은 빈칸을 &nbsp;로 보낸다
  return v.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function tableFromHtml(html: string): TableData | null {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }
  const table = doc.querySelector('table')
  if (!table) return null

  const rows: string[][] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('th,td')).map((td) =>
      cleanCell(td.textContent ?? ''),
    )
    if (cells.some(Boolean)) rows.push(cells)
  }
  if (rows.length === 0) return null
  return withHeaders(rows)
}

function tableFromTabs(text: string): TableData | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return null

  // 탭이 과반에 있어야 표로 본다. 쉼표는 쓰지 않는다 — 주소에 쉼표가 흔해서
  // CSV로 오인하면 열이 엉망으로 쪼개진다.
  const tabbed = lines.filter((l) => l.includes('\t')).length
  if (tabbed * 2 < lines.length) return null

  const rows = lines.map((l) => l.split('\t').map(cleanCell))
  return withHeaders(rows)
}

function withHeaders(rows: string[][]): TableData {
  const first = rows[0] ?? []
  const looksLikeHeader =
    rows.length > 1 &&
    first.some((c) => {
      const lower = c.toLowerCase()
      return HEADER_HINTS.some((h) => lower.includes(h))
    }) &&
    // 숫자만 든 칸이 있으면 헤더가 아니라 데이터다
    !first.some((c) => c !== '' && /^[\d.,]+$/.test(c))

  return looksLikeHeader
    ? { kind: 'table', headers: first, rows: rows.slice(1) }
    : { kind: 'table', headers: null, rows }
}

/** 목록 기호와 앞머리 시각을 떼어낸다. "09:40 공항 도착" → "공항 도착" */
export function stripLinePrefix(line: string): { text: string; startAt?: string } {
  let text = line.trim().replace(/^[-*•·▪◦]\s*/, '').replace(/^\d+[.)]\s*/, '')
  let startAt: string | undefined

  const time = /^(\d{1,2}):(\d{2})\s*(?:~\s*\d{1,2}:\d{2})?\s*/.exec(text)
  if (time) {
    const h = Number(time[1])
    const m = Number(time[2])
    if (h <= 23 && m <= 59) {
      startAt = `${String(h).padStart(2, '0')}:${time[2]}`
      text = text.slice(time[0].length)
    }
  }
  return { text: text.trim(), startAt }
}

function splitProse(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export function parseClipboard(html: string, text: string): ParsedClipboard {
  const fromHtml = html ? tableFromHtml(html) : null
  if (fromHtml) return fromHtml

  const fromTabs = tableFromTabs(text)
  if (fromTabs) return fromTabs

  return { kind: 'prose', lines: splitProse(text) }
}

// ---------- 열 매핑 ----------

export type ColumnRole =
  | 'name'
  | 'note'
  | 'category'
  | 'durationMin'
  | 'startAt'
  | 'ignore'

export const COLUMN_ROLE_LABEL: Record<ColumnRole, string> = {
  name: '장소명',
  note: '메모',
  category: '분류',
  durationMin: '소요(분)',
  startAt: '시각',
  ignore: '무시',
}

const ROLE_HINTS: [ColumnRole, string[]][] = [
  ['name', ['장소', '이름', '상호', '명칭', 'name', 'place']],
  ['note', ['메모', '비고', '설명', 'note', 'memo']],
  ['category', ['분류', '카테고리', '유형', 'category', 'type']],
  ['durationMin', ['소요', '체류', 'duration']],
  ['startAt', ['시각', '출발', '도착', 'start', 'time']],
]

/**
 * 헤더가 있으면 이름으로 맞추고, 없으면 첫 열을 장소명·둘째 열을 메모로 둔다.
 * 어차피 사용자가 화면에서 고칠 수 있으니 추측은 과감하게 한다.
 */
export function guessColumns(table: TableData): ColumnRole[] {
  const width = Math.max(...table.rows.map((r) => r.length), table.headers?.length ?? 0)
  const roles: ColumnRole[] = Array.from({ length: width }, () => 'ignore')

  if (table.headers) {
    table.headers.forEach((h, i) => {
      const lower = h.toLowerCase()
      const hit = ROLE_HINTS.find(([, hints]) => hints.some((x) => lower.includes(x)))
      if (hit && !roles.includes(hit[0])) roles[i] = hit[0]
    })
  }

  if (!roles.includes('name')) roles[0] = 'name'
  if (width > 1 && !roles.includes('note')) {
    const free = roles.findIndex((r, i) => r === 'ignore' && i > 0)
    if (free > 0) roles[free] = 'note'
  }
  return roles
}
