'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronDown } from 'lucide-react'

const mainNavLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/ramps', label: 'Ramps' },
]

const resourcesLinks = [
  { href: '/history', label: 'History' },
  { href: '/storage', label: 'Storage' },
  { href: '/snowpack', label: 'Snowpack' },
  { href: '/stats', label: 'Stats' },
  { href: '/about', label: 'About' },
]

export default function MobileNav({ bebasNeueFont }: { bebasNeueFont?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isResourcesOpen, setIsResourcesOpen] = useState(false)
  const pathname = usePathname()
  const resourcesRef = useRef<HTMLDivElement>(null)

  // Check if current path is in resources
  const isResourcesActive = resourcesLinks.some(link => pathname === link.href)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resourcesRef.current && !resourcesRef.current.contains(event.target as Node)) {
        setIsResourcesOpen(false)
      }
    }

    if (isResourcesOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isResourcesOpen])

  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 sm:h-24 lg:h-20">
          {/* Logo */}
          <Link 
            href="/" 
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img 
              src="/logotest1.png"
              alt="Lake Powell Data" 
              className="h-16 sm:h-20 lg:h-20 w-auto"
            />
            <div className={`flex flex-col pt-2 sm:pt-2.5 lg:pt-2 ${bebasNeueFont || ''}`}>
              <span className="text-xl sm:text-2xl lg:text-3xl font-light text-gray-900 leading-tight tracking-wide uppercase">LAKE POWELL</span>
              <span className="text-xl sm:text-2xl lg:text-3xl font-light text-gray-600 leading-tight tracking-wide uppercase">
                DATA<span className="text-base sm:text-lg lg:text-xl">.COM</span>
              </span>
            </div>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-6 xl:gap-8">
            {mainNavLinks.map(link => (
              <Link 
                key={link.href}
                href={link.href} 
                className={`text-sm font-light transition-colors ${
                  pathname === link.href 
                    ? 'text-gray-900' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
            
            {/* Resources Dropdown */}
            <div className="relative" ref={resourcesRef}>
              <button
                onClick={() => setIsResourcesOpen(!isResourcesOpen)}
                className={`flex items-center gap-1 text-sm font-light transition-colors ${
                  isResourcesActive
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Resources
                <ChevronDown 
                  className={`w-4 h-4 transition-transform ${isResourcesOpen ? 'rotate-180' : ''}`}
                  strokeWidth={1.5}
                />
              </button>
              
              {isResourcesOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  {resourcesLinks.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsResourcesOpen(false)}
                      className={`block px-4 py-2 text-sm font-light transition-colors ${
                        pathname === link.href
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? (
              <X className="w-6 h-6" strokeWidth={1.5} />
            ) : (
              <Menu className="w-6 h-6" strokeWidth={1.5} />
            )}
          </button>
        </div>
        
        {/* Mobile Navigation Menu */}
        {isOpen && (
          <div className="lg:hidden border-t border-gray-100 py-4">
            <div className="flex flex-col space-y-1">
              {mainNavLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-light transition-colors ${
                    pathname === link.href
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              
              {/* Resources Section */}
              <div>
                <button
                  onClick={() => setIsResourcesOpen(!isResourcesOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-light transition-colors ${
                    isResourcesActive
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  Resources
                  <ChevronDown 
                    className={`w-4 h-4 transition-transform ${isResourcesOpen ? 'rotate-180' : ''}`}
                    strokeWidth={1.5}
                  />
                </button>
                
                {isResourcesOpen && (
                  <div className="pl-4 mt-1 space-y-1">
                    {resourcesLinks.map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => {
                          setIsOpen(false)
                          setIsResourcesOpen(false)
                        }}
                        className={`block px-4 py-2 rounded-lg text-sm font-light transition-colors ${
                          pathname === link.href
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}


