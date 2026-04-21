/**
 * Automated article-review checks.
 *
 * Run any time the article rubric, Monte Carlo start date, or underlying
 * scorecard JSON changes. Emits a Markdown report with:
 *   - Readability (Flesch-Kincaid grade — target 6–8 for general audience)
 *   - Stale-term flagging (dates/phrases that changed and may still linger)
 *   - Key numbers extracted (to cross-check against scorecards.json)
 *   - A manual-review checklist per article
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/review-articles.ts > review-report.md
 *
 * See scripts/review-articles/README.md for the full review workflow.
 */

import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(__dirname, 'article-data')
const SCORECARDS = JSON.parse(readFileSync(join(DATA_DIR, 'scorecards.json'), 'utf8'))

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 2,
})

// ─── HTML → plain text ────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Readability (Flesch-Kincaid) ────────────────────────────────

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (word.length === 0) return 0
  if (word.length <= 3) return 1
  // Remove trailing silent 'e'
  word = word.replace(/e$/, '')
  const matches = word.match(/[aeiouy]+/g)
  return matches ? Math.max(1, matches.length) : 1
}

interface Readability {
  wordCount: number
  sentences: number
  wordsPerSentence: number
  syllablesPerWord: number
  fleschEase: number
  fleschKincaidGrade: number
}

function computeReadability(text: string): Readability {
  const sentences = Math.max(1, (text.match(/[.!?]+(?:\s|$)/g) || []).length)
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w))
  const wordCount = words.length
  if (wordCount === 0) {
    return {
      wordCount: 0,
      sentences,
      wordsPerSentence: 0,
      syllablesPerWord: 0,
      fleschEase: 0,
      fleschKincaidGrade: 0,
    }
  }
  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0)
  const wordsPerSentence = wordCount / sentences
  const syllablesPerWord = syllableCount / wordCount
  const fleschEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord
  const fleschKincaidGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59
  return {
    wordCount,
    sentences,
    wordsPerSentence: +wordsPerSentence.toFixed(1),
    syllablesPerWord: +syllablesPerWord.toFixed(2),
    fleschEase: +fleschEase.toFixed(1),
    fleschKincaidGrade: +fleschKincaidGrade.toFixed(1),
  }
}

function gradeBand(grade: number): string {
  if (grade <= 6) return '✅ elementary (below target — may be too simple for complex topics)'
  if (grade <= 8) return '✅ junior-high (target: average US reader)'
  if (grade <= 10) return '⚠️  high-school (above target — try to simplify)'
  if (grade <= 12) return '⚠️  high-school (senior, too advanced)'
  if (grade <= 16) return '❌ college level (rewrite required)'
  return '❌ graduate/academic (major rewrite required)'
}

// ─── Stale-term detection ────────────────────────────────────────

// Phrases that used to be accurate but may no longer be. Add new entries
// here whenever the rubric or MC start date shifts so future reviews catch
// articles that missed the rewrite.
const STALE_PATTERNS: Array<{ pattern: RegExp; note: string }> = [
  {
    pattern: /April\s+30,?\s+2027|Apr\s+30,?\s+2027/gi,
    note: 'MC start was moved to Oct 1, 2026 (Sep 30 phase1End). Verify this reference is about the federal plan itself, not the MC start.',
  },
  {
    pattern: /post-federal-plan\s+baseline/gi,
    note: 'Replaced with "Oct 1, 2026 baseline" or "post-Phase-1 baseline".',
  },
  {
    pattern: /Flaming Gorge transfers? through April 2027/gi,
    note: 'Factually still accurate (the plan announces that), but confirm it does not imply the MC start is Apr 2027.',
  },
  {
    pattern: /100 feet higher/gi,
    note: 'Counterfactual is now ~97 ft (5% less since 1996). Verify against counterfactuals.json.',
  },
  {
    pattern: /worst[-\s]case floor stays above min(?:imum)? power/gi,
    note: 'No longer true under current drought baseline — floors are now below 3490 for every plan.',
  },
  {
    pattern: /only plan whose (?:p10 |bottom-10%\s*|bad-case\s*|worst-case\s*)?floor stays above/gi,
    note: 'Previous framing — verify against current Floor grades.',
  },
  {
    pattern: /stays above minimum power pool in the worst 10% of futures/gi,
    note: 'Only true in non-drought years. Verify wording fits current data.',
  },
]

// ─── Key numbers for cross-checking ──────────────────────────────

function keyNumbersSummary(): string[] {
  const out: string[] = []
  out.push(`Monte Carlo start: **${SCORECARDS.startDate} @ ${SCORECARDS.startElevation.toFixed(1)} ft**`)
  out.push(`Today (actual): ${SCORECARDS.actualDate} @ ${SCORECARDS.actualElevation.toFixed(1)} ft`)
  if (SCORECARDS.federalPhase1) {
    const p1 = SCORECARDS.federalPhase1
    out.push(
      `Phase 1 applied: ${p1.startElevation.toFixed(1)} → ${p1.mcStartElevationP50.toFixed(1)} ft by ${p1.mcStartDate}`
    )
  }
  out.push('')
  out.push('40-year grades (current rubric):')
  const keyOrder = [
    'federal-plan-max-operational-flexibility',
    'federal-plan-supply-driven',
    'federal-plan-enhanced-coordination',
    'federal-plan-basic-coordination',
    'current-operations-2007-guidelines',
    'federal-plan-no-action',
  ]
  for (const key of keyOrder) {
    const s = SCORECARDS.scenarios.find((x: any) => x.key === key)
    if (!s) continue
    const h40 = s.horizons.find((h: any) => h.years === 40)
    if (!h40) continue
    out.push(
      `  - ${s.label}: 40yr med=${h40.medianEnd} ft, floor=${h40.lowestP10} ft, p10End=${h40.p10End} ft, grade **${h40.grade}**`
    )
  }
  return out
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const articles = await pool.query(
    `SELECT slug, title, subtitle, body_html, read_time_minutes, status
       FROM articles
       ORDER BY id ASC`
  )

  const report: string[] = []
  report.push('# Article Review Report')
  report.push(`Generated: ${new Date().toISOString()}`)
  report.push(`Scorecards: ${SCORECARDS.generatedAt}`)
  report.push('')
  report.push('## Current key numbers (for cross-checking)')
  report.push('')
  for (const line of keyNumbersSummary()) report.push(line)
  report.push('')
  report.push('---')
  report.push('')

  for (const a of articles.rows) {
    const plainText = stripHtml(a.body_html)
    const r = computeReadability(plainText)

    const stale: string[] = []
    for (const { pattern, note } of STALE_PATTERNS) {
      const matches = a.body_html.match(pattern) as RegExpMatchArray | null
      if (matches && matches.length > 0) {
        const unique = [...new Set(matches.map((m: string) => m.trim()))]
        stale.push(`  - \`${unique.join('`, `')}\` (${matches.length}×) — ${note}`)
      }
    }

    report.push(`## ${a.title}`)
    report.push(`\`${a.slug}\` · ${a.status} · ~${a.read_time_minutes} min read · ${r.wordCount} words`)
    if (a.subtitle) report.push(`> ${a.subtitle.replace(/\n/g, ' ')}`)
    report.push('')

    report.push('### Readability')
    report.push(`- **Flesch-Kincaid Grade: ${r.fleschKincaidGrade}** → ${gradeBand(r.fleschKincaidGrade)}`)
    report.push(`- Flesch Reading Ease: ${r.fleschEase} (60–70 = plain English, 70+ = easy)`)
    report.push(`- ${r.sentences} sentences · avg ${r.wordsPerSentence} words/sentence · ${r.syllablesPerWord} syllables/word`)
    report.push('')

    if (stale.length > 0) {
      report.push('### ⚠️  Possibly-stale terms')
      for (const s of stale) report.push(s)
      report.push('')
    } else {
      report.push('### ✅  No known stale terms detected')
      report.push('')
    }

    report.push('### Manual checklist')
    report.push('- [ ] Scorecard numbers match `scripts/article-data/scorecards.json` (MC start, 40yr medians, floors, p10End)')
    report.push('- [ ] Grade letters match current rubric (Floor-weighted GPA with +/- modifiers)')
    report.push('- [ ] Chart captions reference Oct 1, 2026 as MC start (not Apr 30, 2027)')
    report.push('- [ ] 4-axis scorecard grid is present where the old 2-col table was')
    report.push('- [ ] Per-plan "Best for…" note is factually correct vs current numbers')
    report.push('- [ ] Jargon simplified — no "p10", "bottom decile", "stochastic", etc. without a gloss')
    report.push('- [ ] Reading level at or below grade 8 (junior-high target)')
    report.push('')
    report.push('---')
    report.push('')
  }

  console.log(report.join('\n'))
  await pool.end()
}

main().catch((err) => {
  console.error('Fatal:', err)
  pool.end()
  process.exit(1)
})
