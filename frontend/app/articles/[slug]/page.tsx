import { Metadata } from 'next'
import { getArticleBySlug, getArticleAssets, getArticleHeroImage } from '@/lib/db'
import { notFound } from 'next/navigation'
import ShareButton from '@/components/ui/ShareButton'
import ArticleContent from './ArticleContent'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) return {}

  return {
    title: article.seo_title || article.title,
    description: article.meta_description || article.subtitle || undefined,
    keywords: article.keywords || undefined,
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)

  if (!article) return notFound()

  const [assets, heroImageUrl] = await Promise.all([
    article.id ? getArticleAssets(article.id) : [],
    article.id ? getArticleHeroImage(article.id) : null,
  ])
  const chartAssets = assets
    .filter(a => a.asset_type === 'chart' && a.config)
    .reduce((acc, a) => {
      acc[a.id] = a.config
      return acc
    }, {} as Record<number, any>)

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16 max-w-3xl">
      <article>
        {heroImageUrl && (
          <div className="mb-6 sm:mb-8 -mx-4 sm:mx-0 rounded-none sm:rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageUrl}
              alt={article.title}
              className="w-full h-48 sm:h-64 lg:h-80 object-cover"
            />
          </div>
        )}
        <header className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-light tracking-tight text-gray-900 mb-3 sm:mb-4 leading-tight">
            {article.title}
          </h1>
          {article.subtitle && (
            <p className="text-base sm:text-lg text-gray-500 font-light mb-4">
              {article.subtitle}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-400 font-light">
            {article.read_time_minutes && (
              <span>{article.read_time_minutes} min read</span>
            )}
            {article.published_at && (
              <span>
                {new Date(article.published_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
            {article.status === 'unpublished' && (
              <span className="text-amber-500 bg-amber-50 px-2 py-0.5 rounded text-xs">
                Preview
              </span>
            )}
            <ShareButton variant="compact" />
          </div>
        </header>

        <ArticleContent
          html={article.body_html || ''}
          chartAssets={chartAssets}
        />

        <footer className="mt-12 pt-8 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <a href="/articles" className="text-sm text-gray-400 font-light hover:text-gray-600 transition-colors">
              ← All Articles
            </a>
            <ShareButton label="Share this article" />
          </div>
        </footer>
      </article>
    </div>
  )
}
