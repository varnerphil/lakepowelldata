import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, PlayCircle } from 'lucide-react'

/**
 * Big CTA that pushes readers from the home-page water-math section over to the
 * simulator, where they can see how each post-2026 federal plan plays out over
 * the long term.
 */
export default function SimulatorPromoCard({
  variant = 'wide',
}: {
  variant?: 'wide' | 'inline'
}) {
  if (variant === 'inline') {
    return (
      <Link
        href="/simulator"
        className="group inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 font-medium"
      >
        <PlayCircle className="w-4 h-4" />
        See how each plan plays out over the long term
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    )
  }

  return (
    <Link
      href="/simulator"
      className="group block relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-sky-600 text-white shadow-md hover:shadow-lg transition-shadow"
    >
      {/* Background image (Lake Powell aerial) — loads behind the gradient
           tint. Gradient overlay keeps text legible on any device. */}
      <Image
        src="/lp-pictures/lake-aerial-panorama.jpg"
        alt=""
        fill
        sizes="(max-width: 1024px) 100vw, 1024px"
        className="object-cover opacity-55 group-hover:opacity-65 transition-opacity"
        priority={false}
      />
      {/* Dark-teal gradient overlay for contrast — left side darker so the
           copy stays readable; fades to lighter on the right. */}
      <div className="absolute inset-0 bg-gradient-to-r from-teal-900/80 via-teal-700/55 to-sky-700/40" />

      <div className="relative p-5 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-teal-100 font-medium mb-1 drop-shadow">
            Go deeper
          </div>
          <h3 className="text-lg sm:text-2xl font-light leading-tight mb-2 drop-shadow !text-white">
            See how each federal plan plays out for Powell
          </h3>
          <p className="text-sm text-teal-50/95 font-light leading-relaxed max-w-lg drop-shadow-sm">
            The April 2026 rescue is a patch. The real question is which
            long-term plan holds Powell up over the next 5–40 years. Run the
            simulator, tweak inflows and policies, and watch the outcomes.
          </p>
        </div>
        <div className="flex-shrink-0">
          <span className="inline-flex items-center gap-2 bg-white/20 group-hover:bg-white/30 border border-white/40 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors">
            Open simulator
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </Link>
  )
}
