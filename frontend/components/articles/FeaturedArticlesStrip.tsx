'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

export interface FeaturedArticle {
  slug: string
  title: string
  subtitle: string
  badge?: string
  badgeColor?: string
  /** Tailwind gradient classes, e.g. 'from-sky-400 to-amber-300' — shown
   *  behind the image (or as the full backdrop when no image is set). */
  gradient: string
  /** Optional hero image (e.g. '/lp-pictures/foo.jpg'). Takes precedence over
   *  the gradient when provided; gradient remains as a load-time fallback. */
  imageUrl?: string
  /** Short alt text for the image. */
  imageAlt?: string
  readMinutes?: number
}

/**
 * Mobile: horizontal snap-scroll row so cards feel like a swipeable carousel.
 * Tablet+: a 2/4-column grid so everything is visible at once.
 *
 * Each card uses a CSS gradient backdrop evoking Lake Powell (water + sandstone)
 * instead of raster hero images so the strip stays fast and doesn't require
 * image hosting. Replace with real imagery later by swapping the gradient div
 * for <img> or next/image.
 */
export default function FeaturedArticlesStrip({
  articles,
  heading,
  kicker,
}: {
  articles: FeaturedArticle[]
  heading?: string
  kicker?: string
}) {
  return (
    <section className="mt-8 lg:mt-12">
      {(heading || kicker) && (
        <div className="mb-4 sm:mb-5 px-1">
          {kicker && (
            <div className="text-[11px] uppercase tracking-wider text-teal-700/70 font-medium mb-1">
              {kicker}
            </div>
          )}
          {heading && (
            <h2 className="text-lg sm:text-xl lg:text-2xl font-light text-gray-900">
              {heading}
            </h2>
          )}
        </div>
      )}

      {/* Mobile: scroll-snap row. Desktop (sm+): grid. */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 pb-2 no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        {articles.map((a) => (
          <Link
            key={a.slug}
            href={`/articles/${a.slug}`}
            className="group snap-start flex-shrink-0 w-[78%] sm:w-auto bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
          >
            {/* Hero — image when available, gradient otherwise (also visible
                 while the image is loading). Images are optimized via next/image. */}
            <div
              className={`relative h-28 sm:h-32 bg-gradient-to-br ${a.gradient} overflow-hidden`}
            >
              {a.imageUrl && (
                <Image
                  src={a.imageUrl}
                  alt={a.imageAlt ?? ''}
                  fill
                  sizes="(max-width: 640px) 78vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover"
                  priority={false}
                />
              )}
              {a.badge && (
                <span
                  className={`absolute top-2 left-2 z-10 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm ${
                    a.badgeColor ?? 'bg-white/90 text-gray-900'
                  }`}
                >
                  {a.badge}
                </span>
              )}
            </div>
            <div className="p-3 sm:p-4 flex-1 flex flex-col">
              <h3 className="text-sm sm:text-base font-medium text-gray-900 leading-snug mb-1 line-clamp-2">
                {a.title}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 font-light leading-snug line-clamp-2 mb-3 flex-1">
                {a.subtitle}
              </p>
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                {a.readMinutes ? <span>{a.readMinutes} min read</span> : <span />}
                <span className="inline-flex items-center gap-0.5 text-teal-600 font-medium group-hover:gap-1.5 transition-all">
                  Read <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
