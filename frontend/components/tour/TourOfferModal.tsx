'use client'

interface TourOfferModalProps {
  onStart: () => void
  onDismiss: () => void
}

export default function TourOfferModal({ onStart, onDismiss }: TourOfferModalProps) {
  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 transition-opacity duration-200"
      role="dialog"
      aria-labelledby="tour-offer-title"
      aria-describedby="tour-offer-desc"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200/80 p-6 sm:p-8 transition-transform duration-200">
        <div className="text-center mb-6">
          <h2 id="tour-offer-title" className="text-xl sm:text-2xl font-light text-gray-900 mb-2">
            Take a quick tour?
          </h2>
          <p id="tour-offer-desc" className="text-sm sm:text-base text-gray-600 font-light leading-relaxed">
            See where to find current water levels, projections, lake access, and more—in about a minute.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onStart}
            className="px-5 py-2.5 text-sm font-light text-white bg-[var(--accent)] hover:bg-[var(--accent-dark)] rounded-lg transition-colors"
          >
            Start tour
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-5 py-2.5 text-sm font-light text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
