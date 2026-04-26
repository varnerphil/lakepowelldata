import { getPublishedArticles } from '@/lib/db'
import Link from 'next/link'
import ShareButton from '@/components/ui/ShareButton'

export const dynamic = 'force-dynamic'

/** Articles we wrote as a curated series — shown in reading order regardless of publish date. */
const SERIES_SLUGS = [
  'real-problem-isnt-drought-its-math',
  'no-action-plan',
  'basic-coordination-plan',
  'enhanced-coordination-plan',
  'max-operational-flexibility-plan',
  'supply-driven-plan',
  'colorado-river-abundance-act',
  'plans-head-to-head',
]

const SERIES_META: Record<string, { badge?: string; badgeColor?: string }> = {
  'real-problem-isnt-drought-its-math': { badge: 'Start here', badgeColor: 'bg-teal-100 text-teal-800' },
  // Two co-equal top picks, badged with the dimension each plan does best —
  // we point at both and let readers decide which trade-off matters more for
  // them rather than crowning a single winner. Same visual weight on both,
  // and the wording matches what the homepage's featured-article cards use.
  'max-operational-flexibility-plan': { badge: 'Top pick · Power & Storage', badgeColor: 'bg-emerald-100 text-emerald-800' },
  'supply-driven-plan': { badge: 'Top pick · Best Recovery', badgeColor: 'bg-emerald-100 text-emerald-800' },
  'plans-head-to-head': { badge: 'The verdict', badgeColor: 'bg-gray-900 text-white' },
}

export default async function ArticlesPage() {
  const allPublished = await getPublishedArticles()
  const publishedBySlug = new Map(allPublished.map((a) => [a.slug, a]))

  // Split into series (in order) and everything else (by publish date)
  const seriesArticles = SERIES_SLUGS
    .map((slug) => publishedBySlug.get(slug))
    .filter(Boolean) as typeof allPublished
  const seriesSlugsSet = new Set(SERIES_SLUGS)
  const otherArticles = allPublished.filter((a) => !seriesSlugsSet.has(a.slug))

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      {/* Hero */}
      <div className="max-w-3xl mx-auto mb-12 sm:mb-16">
        <h1
          className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-4 sm:mb-6"
          style={{ color: '#1a1a1a' }}
        >
          Understanding the future of Lake Powell
        </h1>
        <p className="text-base sm:text-lg text-gray-600 font-light leading-relaxed mb-4">
          The post-2026 operating rules for the Colorado River are being decided
          right now. These articles break down what each proposal actually means
          for the lake — in feet of water, over time, under real conditions.
        </p>
        <p className="text-base sm:text-lg text-gray-600 font-light leading-relaxed">
          Every number comes from Monte Carlo simulations stress-tested against the
          driest decade on record. No spin, no fear tactics — just the data and
          what it means for the people and families who love this place.
        </p>
        <div className="mt-4">
          <ShareButton label="Share" />
        </div>
      </div>

      {/* Series guide */}
      {seriesArticles.length > 0 && (
        <div className="max-w-3xl mx-auto mb-16">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-light text-gray-900">
              The series
            </h2>
            <span className="text-xs text-gray-400 font-light">
              {seriesArticles.length} articles · read in order or jump around
            </span>
          </div>

          <ol className="space-y-3">
            {seriesArticles.map((article, i) => {
              const meta = SERIES_META[article.slug]
              return (
                <li key={article.id}>
                  <Link
                    href={`/articles/${article.slug}`}
                    className="group card flex items-start gap-4 p-4 sm:p-5 hover:shadow-md transition-shadow"
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-light text-gray-500 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-light text-gray-900 group-hover:text-teal-700 transition-colors leading-snug">
                          {article.title}
                        </h3>
                        {meta?.badge && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${meta.badgeColor}`}
                          >
                            {meta.badge}
                          </span>
                        )}
                      </div>
                      {article.subtitle && (
                        <p className="text-sm text-gray-500 font-light mt-1 line-clamp-2">
                          {article.subtitle}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-400 font-light mt-2">
                        {article.read_time_minutes && (
                          <span>{article.read_time_minutes} min read</span>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1 flex-shrink-0">
                      &rarr;
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Other articles */}
      {otherArticles.length > 0 && (
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-light text-gray-900 mb-6">
            More articles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {otherArticles.map((article) => (
              <Link key={article.id} href={`/articles/${article.slug}`}>
                <article className="card p-5 hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                  <h3 className="text-base font-light text-gray-900 mb-2 leading-snug">
                    {article.title}
                  </h3>
                  {article.subtitle && (
                    <p className="text-sm text-gray-500 font-light mb-3 line-clamp-2">
                      {article.subtitle}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-3 text-xs text-gray-400 font-light">
                    {article.read_time_minutes && (
                      <span>{article.read_time_minutes} min read</span>
                    )}
                    {article.published_at && (
                      <span>
                        {new Date(article.published_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      )}

      {allPublished.length === 0 && (
        <div className="card p-8 sm:p-12 text-center max-w-3xl mx-auto">
          <p className="text-gray-400 font-light">No articles published yet. Check back soon.</p>
        </div>
      )}
    </div>
  )
}
