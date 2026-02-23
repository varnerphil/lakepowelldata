'use client'

import { useState, useCallback } from 'react'
import { Share2, Check, Loader2 } from 'lucide-react'

type ShareVariant = 'inline' | 'compact'

interface ShareButtonProps {
  /** Build the URL to share. Receives the current origin. Return null to use window.location.href. */
  getShareUrl?: (origin: string) => Promise<string> | string
  variant?: ShareVariant
  label?: string
  className?: string
}

export default function ShareButton({
  getShareUrl,
  variant = 'inline',
  label = 'Share',
  className = '',
}: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'working' | 'copied'>('idle')

  const handleShare = useCallback(async () => {
    setStatus('working')
    try {
      const url = getShareUrl
        ? await getShareUrl(window.location.origin)
        : window.location.href

      await navigator.clipboard.writeText(url)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('idle')
    }
  }, [getShareUrl])

  if (variant === 'compact') {
    return (
      <button
        onClick={handleShare}
        disabled={status === 'working'}
        title={status === 'copied' ? 'Link copied!' : label}
        className={`inline-flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 ${className}`}
      >
        {status === 'copied' ? (
          <Check className="w-4 h-4 text-emerald-500" />
        ) : status === 'working' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Share2 className="w-4 h-4" />
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      disabled={status === 'working'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-light rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 ${className}`}
    >
      {status === 'copied' ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-emerald-600">Link copied!</span>
        </>
      ) : status === 'working' ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Copying...</span>
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  )
}
