'use client'

import { useMemo } from 'react'
import ArticleChart, { type ChartSpec } from '@/components/articles/ArticleChart'

interface Props {
  html: string
  chartAssets: Record<number, ChartSpec>
}

const CHART_PLACEHOLDER = /<!-- chart:asset:(\d+) -->/g

export default function ArticleContent({ html, chartAssets }: Props) {
  const segments = useMemo(() => {
    const parts: Array<{ type: 'html'; content: string } | { type: 'chart'; assetId: number }> = []
    let lastIndex = 0

    const matches = [...html.matchAll(CHART_PLACEHOLDER)]

    if (matches.length === 0) {
      return [{ type: 'html' as const, content: html }]
    }

    for (const match of matches) {
      const before = html.slice(lastIndex, match.index)
      if (before) {
        parts.push({ type: 'html', content: before })
      }
      parts.push({ type: 'chart', assetId: parseInt(match[1]) })
      lastIndex = match.index! + match[0].length
    }

    const after = html.slice(lastIndex)
    if (after) {
      parts.push({ type: 'html', content: after })
    }

    return parts
  }, [html])

  const proseClasses = `prose prose-gray prose-lg max-w-none font-light
    prose-headings:font-light prose-headings:tracking-tight
    prose-h2:mt-10 prose-h2:mb-4 prose-h3:mt-8 prose-h3:mb-3
    prose-p:text-gray-600 prose-p:leading-relaxed
    prose-a:text-[#d4a574] prose-a:no-underline hover:prose-a:underline
    prose-strong:text-gray-800 prose-strong:font-normal
    prose-table:text-sm prose-th:text-left prose-th:py-2 prose-th:px-3
    prose-td:py-2 prose-td:px-3 prose-td:border-b prose-td:border-gray-100
    prose-li:text-gray-600`

  if (segments.length === 1 && segments[0].type === 'html') {
    return (
      <div
        className={proseClasses}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.type === 'html') {
          return (
            <div
              key={i}
              className={proseClasses}
              dangerouslySetInnerHTML={{ __html: seg.content }}
            />
          )
        }

        const spec = chartAssets[seg.assetId]
        if (!spec) return null

        return <ArticleChart key={i} spec={spec} />
      })}
    </div>
  )
}
