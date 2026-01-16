'use client'

import { ReactNode } from 'react'
import Link from 'next/link'

interface StatsTabsProps {
  activeTab: string
  children: ReactNode
}

export default function StatsTabs({ activeTab, children }: StatsTabsProps) {
  const tabs = [
    { id: 'current', label: 'Current Data' },
    { id: 'historical', label: 'Historical Data' },
    { id: 'analysis', label: 'Statistical Analysis' },
    { id: 'runoff', label: 'Projected Runoff' },
    { id: 'storage', label: 'Storage Analysis' },
  ]

  return (
    <div>
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/stats?tab=${tab.id}`}
              className={`
                py-4 px-1 border-b-2 font-light text-sm transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content - children should handle their own visibility */}
      <div>
        {children}
      </div>
    </div>
  )
}

