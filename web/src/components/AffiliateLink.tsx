import { useState } from 'react'
import { DISCLOSURE } from '../lib/packing'
import { trackEvent } from '../lib/analytics'

const ACK_KEY = 'leghop:affiliate-ack'

function acknowledged(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === '1'
  } catch {
    // 시크릿 모드 등에서 localStorage가 막히면 매번 보여주는 쪽이 안전하다
    return false
  }
}

function remember() {
  try {
    localStorage.setItem(ACK_KEY, '1')
  } catch {
    /* 저장 못 해도 동작에는 지장 없다 */
  }
}

/**
 * 제휴 링크 배지.
 *
 * 처음 누를 때 대가성 고지를 한 번 띄운다. **매번 띄우지는 않는다** —
 * 고지 문구는 목록 위에 항상 보이게 두었으므로 반복 확인은 방해만 된다.
 *
 * 중요: 확인 버튼을 `<a href>`로 둔다. 클릭을 가로챈 뒤 스크립트로 창을 열면
 * 사용자 제스처가 끊겨 팝업 차단에 걸린다. 확인 버튼 자체가 링크여야 한다.
 */
export function AffiliateLink({
  href,
  item,
  label = '추천템',
}: {
  href: string
  /** 준비물 항목 이름. GA 리포트에서 URL보다 이게 읽기 쉽다 */
  item: string
  label?: string
}) {
  const [asking, setAsking] = useState(false)

  const badge =
    'shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'

  return (
    <>
      <a
        href={href}
        target="_blank"
        // 제휴 링크에는 sponsored가 필요하다. 없으면 검색엔진이 유료 링크를
        // 자연 링크로 오인해 사이트 평가에 불리하게 작용한다.
        rel="sponsored nofollow noopener noreferrer"
        className={badge}
        onClick={(e) => {
          trackEvent('affiliate_click', { item })
          if (acknowledged()) return
          e.preventDefault()
          setAsking(true)
        }}
      >
        {label}
      </a>

      {asking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="제휴 링크 안내"
          onClick={() => setAsking(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium">쿠팡 파트너스 링크입니다</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {DISCLOSURE}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              구매 가격은 달라지지 않습니다. 이 안내는 처음 한 번만 표시됩니다.
            </p>
            <div className="mt-4 flex gap-2">
              <a
                href={href}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => {
                  remember()
                  setAsking(false)
                }}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
              >
                확인하고 이동
              </a>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="rounded-lg px-4 py-2.5 text-sm text-slate-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
