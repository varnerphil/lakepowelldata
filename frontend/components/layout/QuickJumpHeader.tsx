'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Section {
  href: string
  label: string
}

interface QuickJumpHeaderProps {
  elevation: number
  dailyChangeInches?: string | null
  sections: Section[]
}

export default function QuickJumpHeader({
  elevation,
  dailyChangeInches,
  sections,
}: QuickJumpHeaderProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const clickLockRef = useRef<string | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToId = useCallback(
    (id: string | null) => {
      // Lock scroll-spy for 1.2s so the click target stays highlighted
      // during smooth-scroll animation
      clickLockRef.current = id
      setActiveId(id)
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
      lockTimerRef.current = setTimeout(() => {
        clickLockRef.current = null
      }, 1200)

      if (id === null) {
        const main = document.querySelector('main')
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
        else window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    []
  )

  useEffect(() => {
    const ids = sections.map((s) => s.href.replace('#', ''))
    const mainEl =
      (typeof document !== 'undefined' && document.querySelector('main')) || null

    const compute = () => {
      // Don't override during a click-initiated scroll
      if (clickLockRef.current !== null) return

      const scrollContainer = mainEl || document.documentElement
      const scrollTop = mainEl ? mainEl.scrollTop : window.scrollY

      // "At top" = scrolled less than 100px
      if (scrollTop < 100) {
        setActiveId(null)
        return
      }

      let active: string | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        // Use offsetTop relative to scroll container
        const elTop = el.offsetTop
        if (elTop <= scrollTop + 160) active = id
      }
      setActiveId(active)
    }

    compute()
    window.addEventListener('scroll', compute, { passive: true })
    mainEl?.addEventListener('scroll', compute, { passive: true })
    return () => {
      window.removeEventListener('scroll', compute)
      mainEl?.removeEventListener('scroll', compute)
    }
  }, [sections])

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    }
  }, [])

  const changeIsPositive = dailyChangeInches?.startsWith('+')
  const changeColor = dailyChangeInches
    ? changeIsPositive
      ? 'text-[#8b9a6b]'
      : dailyChangeInches === '0'
        ? 'text-gray-500'
        : 'text-[#c99a7a]'
    : 'text-gray-500'

  return (
    <div className="sticky top-0 z-40 mb-4">
      <div className="bg-white/95 backdrop-blur-md border-b border-gray-200 rounded-lg">
        <div className="px-3 lg:px-4">
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => scrollToId(null)}
              aria-label="Scroll to top"
              className={`inline-flex items-baseline gap-1.5 flex-shrink-0 px-3 py-1 rounded-full transition-colors whitespace-nowrap ${
                activeId === null
                  ? 'bg-gray-900 text-white hover:bg-gray-800 active:bg-black'
                  : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
              }`}
            >
              <span
                className={`text-xs lg:text-sm font-light tabular-nums ${
                  activeId === null ? 'text-white' : 'text-gray-900'
                }`}
              >
                {elevation.toFixed(2)}
                <span
                  className={`text-[10px] lg:text-xs ml-0.5 ${
                    activeId === null ? 'text-white/70' : 'text-gray-500'
                  }`}
                >
                  ft
                </span>
              </span>
              {dailyChangeInches && (
                <span
                  className={`text-[11px] lg:text-xs font-light ${
                    activeId === null ? 'text-white/90' : changeColor
                  }`}
                >
                  {dailyChangeInches}
                </span>
              )}
            </button>
            <nav aria-label="Jump to section" className="flex-1 min-w-0">
              <ul className="flex items-center justify-end gap-1 overflow-x-auto no-scrollbar">
                {sections.map((s) => {
                  const id = s.href.replace('#', '')
                  const active = activeId === id
                  return (
                    <li key={s.href}>
                      <a
                        href={s.href}
                        onClick={() => scrollToId(id)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] lg:text-xs font-light transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-gray-900 text-white'
                            : 'text-gray-600 bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
                        }`}
                      >
                        {s.label}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>
  )
}
