'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface TimeRangeButtonsProps {
  currentRange: string
  formAction?: string
}

const timeRanges = [
  { value: 'alltime', label: 'All-Time' },
  { value: '20years', label: '20 Years' },
  { value: '10years', label: '10 Years' },
  { value: '5years', label: '5 Years' },
  { value: '1year', label: '1 Year' },
]

export default function TimeRangeButtons({ currentRange, formAction }: TimeRangeButtonsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleRangeChange = (range: string) => {
    const targetPath = formAction || '/history'
    // Preserve other search params if on home page
    if (targetPath === '/') {
      const params = new URLSearchParams(searchParams.toString())
      params.set('range', range)
      router.push(`/?${params.toString()}`)
    } else {
      // Navigate with the range parameter, clearing any custom dates
      router.push(`${targetPath}?range=${range}`)
    }
  }

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <span className="text-[10px] sm:text-xs uppercase tracking-wider text-gray-500 font-light">Time Range:</span>
        {timeRanges.map((range) => (
          <button
            key={range.value}
            onClick={() => handleRangeChange(range.value)}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-light transition-colors ${
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

