'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import type { TourStep } from './tour-steps'

interface TourOverlayProps {
  step: TourStep
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export default function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
}: TourOverlayProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null)
  const targetRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!step.target) {
      setTargetRect(null)
      setTooltipPosition(null)
      return
    }
    const el = document.querySelector(step.target)
    targetRef.current = el
    if (!el) {
      setTargetRect(null)
      setTooltipPosition(null)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const updateRect = () => {
      const r = el.getBoundingClientRect()
      setTargetRect(r)
      const padding = 16
      const tooltipWidth = 320
      let left = r.left + r.width / 2 - tooltipWidth / 2
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding))
      const top = step.placement === 'top' ? r.top - 220 : r.bottom + 12
      setTooltipPosition({ top, left })
    }
    updateRect()
    const t = window.setTimeout(updateRect, 400)
    return () => window.clearTimeout(t)
  }, [step.target, step.placement])

  // Re-measure on scroll/resize
  useEffect(() => {
    const handleUpdate = () => {
      if (!step.target || !targetRef.current) return
      const rect = targetRef.current.getBoundingClientRect()
      setTargetRect(rect)
      const padding = 16
      const tooltipWidth = 320
      let left = rect.left + rect.width / 2 - tooltipWidth / 2
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding))
      const top = step.placement === 'top' ? rect.top - 220 : rect.bottom + 12
      setTooltipPosition({ top, left })
    }
    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)
    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [step.target, step.placement])

  const renderBody = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g)
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-medium text-gray-900">{part}</strong> : part
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 transition-opacity"
        style={{ pointerEvents: 'none' }}
        aria-hidden
      />
      {/* Spotlight cutout */}
      {targetRect && (
        <div
          className="fixed z-[9999] rounded-lg ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)] bg-transparent transition-all duration-200"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
          aria-hidden
        />
      )}
      {/* Tooltip card */}
      <div
        className="fixed z-[10000] w-[min(320px,calc(100vw-32px)) rounded-xl bg-white shadow-xl border border-gray-200/80 p-5 transition-opacity duration-200"
        style={
          tooltipPosition
            ? { top: tooltipPosition.top, left: tooltipPosition.left }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 id="tour-title" className="text-lg font-light text-gray-900">
            {step.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close tour"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
        <p id="tour-body" className="text-sm text-gray-600 font-light leading-relaxed mb-5">
          {renderBody(step.body)}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-light">
            {stepIndex + 1} of {totalSteps}
          </span>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={onPrev}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-light text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : null}
            {stepIndex < totalSteps - 1 ? (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-light text-white bg-[var(--accent)] hover:bg-[var(--accent-dark)] rounded-lg transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-light text-white bg-[var(--accent)] hover:bg-[var(--accent-dark)] rounded-lg transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
