'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { startTransition } from 'react'

interface TimeRangeButtonsProps {
  currentRange: string
  formAction?: string
}

const timeRanges = [
  { value: '1month', label: '1M' },
  { value: '6months', label: '6M' },
  { value: '1year', label: '1Y' },
  { value: '5years', label: '5Y' },
  { value: '10years', label: '10Y' },
  { value: '20years', label: '20Y' },
  { value: 'alltime', label: 'All' },
]

export default function TimeRangeButtons({ currentRange, formAction }: TimeRangeButtonsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleRangeChange = (range: string) => {
    startTransition(() => {
      const targetPath = formAction || '/history'
      // Preserve other search params if on home page
      if (targetPath === '/') {
        const params = new URLSearchParams(searchParams.toString())
        params.set('range', range)
        router.replace(`/?${params.toString()}`, { scroll: false })
      } else {
        // Navigate with the range parameter, clearing any custom dates
        router.replace(`${targetPath}?range=${range}`, { scroll: false })
      }
    })
  }

  return (
    <div className="card p-2 sm:p-4 mt-0">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {timeRanges.map((range) => (
          <button
            key={range.value}
            onClick={() => handleRangeChange(range.value)}
            className={`px-1 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-light transition-colors text-center ${
              currentRange === range.value
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  )
}

