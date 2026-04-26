'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import TourOverlay from './TourOverlay'
import TourOfferModal from './TourOfferModal'
import { DASHBOARD_TOUR_STEPS, type TourStep } from './tour-steps'

const TOUR_OFFERED_KEY = 'lakepowelldata-tour-offered'

type TourState = 'idle' | 'offer' | 'running'

interface TourContextValue {
  startTour: () => void
  showOffer: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour() {
  const ctx = useContext(TourContext)
  return ctx
}

interface TourProviderProps {
  children: React.ReactNode
  /**
   * Paths where the offer modal should auto-show on first visit (gated by
   * localStorage so it only appears once per browser). The tour itself only
   * works on the home page since the steps target home-page sections — keep
   * this list to `['/']` unless you add steps for other pages.
   */
  autoOfferPaths?: string[]
}

export default function TourProvider({ children, autoOfferPaths = [] }: TourProviderProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const tourParam = searchParams.get('tour') === '1'

  const [state, setState] = useState<TourState>('idle')
  const [stepIndex, setStepIndex] = useState(0)

  const steps = DASHBOARD_TOUR_STEPS
  const currentStep: TourStep | undefined = steps[stepIndex]

  const openOffer = useCallback(() => {
    setState('offer')
  }, [])

  const markOffered = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(TOUR_OFFERED_KEY, 'true')
      } catch {}
    }
  }, [])

  const startTour = useCallback(() => {
    markOffered()
    setState('running')
    setStepIndex(0)
  }, [markOffered])

  const dismissOffer = useCallback(() => {
    setState('idle')
    markOffered()
  }, [markOffered])

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      setState('idle')
      setStepIndex(0)
      return
    }
    setStepIndex((i) => i + 1)
  }, [stepIndex, steps.length])

  const goPrev = useCallback(() => {
    if (stepIndex <= 0) return
    setStepIndex((i) => i - 1)
  }, [stepIndex])

  const closeTour = useCallback(() => {
    setState('idle')
    setStepIndex(0)
  }, [])

  const value = useMemo(() => ({ startTour, showOffer: openOffer }), [startTour, openOffer])

  // Auto-show the offer once: either ?tour=1 (always, for preview) or first
  // visit to an `autoOfferPaths` route (gated by localStorage).
  const [hasAutoShownOffer, setHasAutoShownOffer] = useState(false)
  useEffect(() => {
    if (state !== 'idle' || hasAutoShownOffer) return

    if (tourParam) {
      setHasAutoShownOffer(true)
      setState('offer')
      return
    }

    if (autoOfferPaths.includes(pathname)) {
      let alreadyOffered = false
      try {
        alreadyOffered = window.localStorage.getItem(TOUR_OFFERED_KEY) === 'true'
      } catch {}
      if (!alreadyOffered) {
        setHasAutoShownOffer(true)
        setState('offer')
      }
    }
  }, [tourParam, state, hasAutoShownOffer, pathname, autoOfferPaths])

  return (
    <TourContext.Provider value={value}>
      {children}
      {state === 'offer' && (
        <TourOfferModal onStart={startTour} onDismiss={dismissOffer} />
      )}
      {state === 'running' && currentStep && (
        <TourOverlay
          step={currentStep}
          stepIndex={stepIndex}
          totalSteps={steps.length}
          onNext={goNext}
          onPrev={goPrev}
          onClose={closeTour}
        />
      )}
    </TourContext.Provider>
  )
}
