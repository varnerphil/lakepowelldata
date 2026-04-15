'use client'

import { useEffect, useState } from 'react'

interface Section {
  href: string
  label: string
}

interface QuickJumpHeaderProps {
  elevation: number
  dailyChangeInches?: string | null
  sections: Section[]
}

/**
 * Always-visible sticky bar at the top of the page. Acts as a breadcrumb:
 * shows current elevation + daily change on the left, and a row of chips for
 * each page section. The chip matching the section currently in view is
 * highlighted via scroll-spy (IntersectionObserver on each section).
 */
export default function QuickJumpHeader({
  elevation,
  dailyChangeInches,
  sections,
}: QuickJumpHeaderProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const ids = sections.map((s) => s.href.replace('#', ''))
    const mainEl =
      (typeof document !== 'undefined' && document.querySelector('main')) || null

    // A section is "active" when its top has scrolled above this line.
    // Set it just below the sticky header (~56px) so activation matches
    // what the user visually sees at the top of the viewport.
    const ACTIVATION_LINE_PX = 80

    const compute = () => {
      let active: string | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top <= ACTIVATION_LINE_PX) active = id
      }
      setActiveId(active)
    }

    compute()
    window.addEventListener('scroll', compute, { passive: true })
    mainEl?.addEventListener('scroll', compute, { passive: true })
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', compute)
      mainEl?.removeEventListener('scroll', compute)
      window.removeEventListener('resize', compute)
    }
  }, [sections])

  const changeIsPositive = dailyChangeInches?.startsWith('+')
  const changeColor = dailyChangeInches
    ? changeIsPositive
      ? 'text-[#8b9a6b]'
      : dailyChangeInches === '0'
        ? 'text-gray-500'
        : 'text-[#c99a7a]'
    : 'text-gray-500'

  return (
    <div className="sticky top-0 z-40 -mx-3 lg:-mx-4 mb-4">
      <div className="bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="px-3 lg:px-4">
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => {
                const main = document.querySelector('main')
                if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
                else window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
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
