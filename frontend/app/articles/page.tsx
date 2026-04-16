import { getPublishedArticles } from '@/lib/db'
import Link from 'next/link'
import ShareButton from '@/components/ui/ShareButton'

export const dynamic = 'force-dynamic'

export default async function ArticlesPage() {
  const articles = await getPublishedArticles()

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          Articles
        </h1>
        <p className="text-sm sm:text-lg text-gray-500 font-light max-w-2xl mx-auto">
          Data-driven analysis and answers to common questions about Lake Powell
        </p>
        <div className="mt-3">
          <ShareButton label="Share" />
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <p className="text-gray-400 font-light">No articles published yet. Check back soon.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {articles.map((article) => (
            <Link key={article.id} href={`/articles/${article.slug}`}>
              <article className="card p-5 sm:p-6 hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                <h2 className="text-lg sm:text-xl font-light text-gray-900 mb-2 leading-snug">
                  {article.title}
                </h2>
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
      )}
    </div>
  )
}
