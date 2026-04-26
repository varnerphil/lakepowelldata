'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TrendingUp, PlayCircle, MapPin, BookOpen } from 'lucide-react'

const navItems = [
  {
    href: '/',
    label: 'Dashboard',
    icon: TrendingUp
  },
  {
    href: '/simulator',
    label: 'Simulator',
    icon: PlayCircle
  },
  {
    href: '/ramps',
    label: 'Lake access',
    icon: MapPin
  },
  {
    href: '/articles',
    label: 'Articles',
    icon: BookOpen
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 xl:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
      {/* Portal slot for page-specific content that sits directly above the
          nav buttons (e.g., the simulator's chip-footer). Pages use
          createPortal(node, #bottom-nav-slot) to render into here — keeping
          them inside the same fixed container as the nav buttons so there is
          never a gap or overlap between the two. */}
      <div id="bottom-nav-slot" />
      <div className="flex items-center justify-around h-16 pb-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? 'text-gray-900'
                  : 'text-gray-500 active:text-gray-700'
              }`}
            >
              <Icon 
                className={`w-6 h-6 mb-1.5 ${isActive ? 'text-gray-900' : 'text-gray-500'}`}
                strokeWidth={1.5}
              />
              <span className={`text-xs font-light ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

