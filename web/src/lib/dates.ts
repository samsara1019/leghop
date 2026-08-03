/**
 * 날짜 문자열(YYYY-MM-DD)은 전부 **로컬 시간 기준**으로 만든다.
 *
 * `new Date().toISOString().slice(0, 10)`은 UTC로 변환한 날짜를 준다.
 * KST(+9)에서 로컬 자정은 UTC로 전날 15시라서, 그대로 쓰면 날짜가 하루 밀린다.
 * 여행 일정은 여행자의 로컬 날짜가 정본이므로 UTC를 거치면 안 된다.
 */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/** 'YYYY-MM-DD' → 로컬 자정 Date. 문자열에 Z가 없어야 로컬로 파싱된다. */
export function fromISODate(v: string): Date {
  return new Date(`${v}T00:00:00`)
}

/** start부터 end까지 하루씩. 뒤집혀 있으면 start 하루만 준다. */
export function eachDateISO(start: string, end: string): string[] {
  const cur = fromISODate(start)
  const last = fromISODate(end)
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) {
    return [start]
  }
  const out: string[] = []
  // 무한 루프 방어 — 여행이 이만큼 길 일은 없다
  for (let i = 0; i < 400 && cur <= last; i++) {
    out.push(toISODate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
