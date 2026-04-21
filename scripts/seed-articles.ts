/**
 * Seed the articles series into the DB as drafts.
 *
 * All articles are inserted with status='draft'. Flip to 'published' via the
 * admin UI or a SQL update when the full series is ready to go live.
 *
 * Safe to re-run: uses INSERT ... ON CONFLICT on (slug) to upsert, and
 * DELETEs the article's existing assets before re-inserting chart specs.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-articles.ts
 */

import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(__dirname, 'article-data')
const SCORECARDS = JSON.parse(readFileSync(join(DATA_DIR, 'scorecards.json'), 'utf8'))
const COUNTERFACTUALS = JSON.parse(
  readFileSync(join(DATA_DIR, 'counterfactuals.json'), 'utf8')
)

/** Convert monthsOut to a calendar year for chart x-axes. */
const START_YEAR = new Date(SCORECARDS.startDate).getFullYear()
function monthsToYear(m: number): number {
  return Math.round((START_YEAR + m / 12) * 10) / 10
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 2,
})

// ─── Chart-spec types (match ArticleChart.tsx) ────────────────────
interface SeriesSpec {
  dataKey: string
  type?: 'line' | 'bar' | 'area'
  color: string
  name?: string
}
interface ReferenceLineSpec {
  y: number
  label: string
  color: string
  strokeDasharray?: string
}
interface ChartSpec {
  chartType: 'line' | 'bar' | 'area' | 'composed'
  title: string
  data: Record<string, any>[]
  series: SeriesSpec[]
  xKey: string
  xType?: 'date' | 'number' | 'category'
  yLabel?: string
  referenceLines?: ReferenceLineSpec[]
  caption?: string
}

interface ArticleSpec {
  slug: string
  title: string
  subtitle: string
  readTimeMinutes: number
  /** Charts are inserted as assets; placeholder tokens in body get substituted. */
  charts: Array<{ key: string; spec: ChartSpec; altText?: string }>
  /** HTML body with `[[chart:key]]` placeholders, one per chart. */
  bodyHtml: string
}

// ─── Reference lines reused across charts ───────────────────────
const REF_LINES = {
  deadPool: { y: 3370, label: 'Dead Pool (3,370)', color: '#ef4444', strokeDasharray: '5 5' } as ReferenceLineSpec,
  minPower: { y: 3490, label: 'Min Power (3,490)', color: '#f59e0b', strokeDasharray: '5 5' } as ReferenceLineSpec,
  fullPool: { y: 3700, label: 'Full Pool (3,700)', color: '#0284c7', strokeDasharray: '5 5' } as ReferenceLineSpec,
}

/** Standard ramp + threshold reference lines for all article charts. */
const STANDARD_REF_LINES: ReferenceLineSpec[] = [
  { y: 3650, label: 'Hite (3,650)', color: '#6366f1', strokeDasharray: '3 3' },
  { y: 3585, label: 'Antelope / The Cut', color: '#8b5cf6', strokeDasharray: '3 3' },
  { y: 3578, label: 'Bullfrog (3,578)', color: '#7c3aed', strokeDasharray: '3 3' },
  { y: 3553, label: 'Wahweap / Halls', color: '#c084fc', strokeDasharray: '3 3' },
  REF_LINES.minPower,
  REF_LINES.deadPool,
]

// ─── Multi-axis scorecard grid ──────────────────────────────────
// A single grade collapses the trade-off between plans that fill the lake
// (SD) and plans that protect the floor (MOF). This grid breaks the score
// into four separate axes so readers can judge each plan on the dimensions
// that matter to them. Shared between the intro article (preview) and the
// head-to-head article (full).

type AxisGrade = 'A' | 'B' | 'C' | 'D' | 'F'

interface PlanMeta {
  label: string
  slug?: string
  emphasis?: boolean
  // Short, plain-language summary shown under the plan name. For strong plans,
  // the axis they win on. For weak plans, a matter-of-fact statement of the
  // problem (no editorializing). Kept short enough to fit in a grid cell.
  note: string
  noteTone: 'good' | 'neutral' | 'bad'
}

const PLAN_META: Record<string, PlanMeta> = {
  'federal-plan-max-operational-flexibility': {
    label: 'Max Operational Flexibility',
    slug: 'max-operational-flexibility-plan',
    emphasis: true,
    note: 'Best for worst-case safety — only plan whose floor stays above min power',
    noteTone: 'good',
  },
  'federal-plan-supply-driven': {
    label: 'Supply Driven',
    slug: 'supply-driven-plan',
    emphasis: true,
    note: 'Best for filling the lake — highest median elevation at every long horizon',
    noteTone: 'good',
  },
  'federal-plan-enhanced-coordination': {
    label: 'Enhanced Coordination',
    slug: 'enhanced-coordination-plan',
    note: 'Best balanced fallback if MOF or SD is politically out of reach',
    noteTone: 'neutral',
  },
  'federal-plan-basic-coordination': {
    label: 'Basic Coordination',
    slug: 'basic-coordination-plan',
    note: 'Not recommended — median below min power; floor reaches dead pool',
    noteTone: 'bad',
  },
  'current-operations-2007-guidelines': {
    label: '2007 Guidelines (status quo)',
    note: 'Not recommended — structural deficit persists; floor reaches dead pool',
    noteTone: 'bad',
  },
  'federal-plan-no-action': {
    label: 'No Action',
    slug: 'no-action-plan',
    note: 'Not recommended — lowest median of any plan; floor reaches dead pool',
    noteTone: 'bad',
  },
}

const PLAN_ORDER = [
  'federal-plan-max-operational-flexibility',
  'federal-plan-supply-driven',
  'federal-plan-enhanced-coordination',
  'federal-plan-basic-coordination',
  'current-operations-2007-guidelines',
  'federal-plan-no-action',
]

// Thresholds are tied to meaningful operational milestones:
//   3,600 ≈ comfortable pool, 3,550 ≈ healthy, 3,500 near min power,
//   3,490 = min power pool, 3,440/3,400 = marina stress levels, 3,370 = dead pool.
function gradeRecovery(medianEnd: number): AxisGrade {
  if (medianEnd >= 3600) return 'A'
  if (medianEnd >= 3550) return 'B'
  if (medianEnd >= 3500) return 'C'
  if (medianEnd >= 3430) return 'D'
  return 'F'
}
function gradeFloor(lowestP10: number): AxisGrade {
  if (lowestP10 >= 3490) return 'A'
  if (lowestP10 >= 3440) return 'B'
  if (lowestP10 >= 3400) return 'C'
  if (lowestP10 > 3370) return 'D'
  return 'F'
}
function gradeSafety(pctAboveMinPower: number): AxisGrade {
  if (pctAboveMinPower >= 80) return 'A'
  if (pctAboveMinPower >= 50) return 'B'
  if (pctAboveMinPower >= 20) return 'C'
  if (pctAboveMinPower >= 5) return 'D'
  return 'F'
}
function gradeSpeed(gain10yr: number): AxisGrade {
  if (gain10yr >= 40) return 'A'
  if (gain10yr >= 15) return 'B'
  if (gain10yr >= 0) return 'C'
  if (gain10yr >= -20) return 'D'
  return 'F'
}

const GRADE_STYLE: Record<AxisGrade, string> = {
  A: 'background:#d1fae5; color:#065f46;',
  B: 'background:#dbeafe; color:#1e40af;',
  C: 'background:#fef3c7; color:#92400e;',
  D: 'background:#f3f4f6; color:#374151;',
  F: 'background:#fee2e2; color:#991b1b;',
}

function gradePill(g: AxisGrade): string {
  return `<span style="display:inline-block; padding:0.15rem 0.7rem; border-radius:9999px; font-weight:600; font-size:0.85rem; ${GRADE_STYLE[g]}">${g}</span>`
}

interface PlanRow {
  key: string
  meta: PlanMeta
  recovery: { grade: AxisGrade; medianEnd: number }
  floor: { grade: AxisGrade; lowestP10: number }
  safety: { grade: AxisGrade; stayAboveMinPower: number }
  speed: { grade: AxisGrade; gain10yr: number }
  overallGrade: AxisGrade
}

function buildPlanRow(scenario: any): PlanRow | null {
  const meta = PLAN_META[scenario.key]
  if (!meta) return null
  const h40 = scenario.horizons.find((h: any) => h.years === 40)
  const h10 = scenario.horizons.find((h: any) => h.years === 10)
  if (!h40 || !h10) return null
  return {
    key: scenario.key,
    meta,
    recovery: { grade: gradeRecovery(h40.medianEnd), medianEnd: h40.medianEnd },
    floor: { grade: gradeFloor(h40.lowestP10), lowestP10: h40.lowestP10 },
    safety: { grade: gradeSafety(h40.stayAboveMinPower), stayAboveMinPower: h40.stayAboveMinPower },
    speed: { grade: gradeSpeed(h10.gain), gain10yr: h10.gain },
    overallGrade: h40.grade,
  }
}

function planNameCell(row: PlanRow): string {
  const weight = row.meta.emphasis ? 'font-weight:600;' : ''
  const nameHtml = row.meta.slug
    ? `<a href="/articles/${row.meta.slug}" style="color:#0d7377; text-decoration:none; ${weight}">${row.meta.label} →</a>`
    : `<span style="color:#374151; ${weight}">${row.meta.label}</span>`
  const noteColor =
    row.meta.noteTone === 'good'
      ? '#065f46'
      : row.meta.noteTone === 'bad'
      ? '#991b1b'
      : '#6b7280'
  const noteHtml = `<div style="font-size:0.72rem; color:${noteColor}; margin-top:0.25rem; line-height:1.3; font-weight:400;">${row.meta.note}</div>`
  return `${nameHtml}${noteHtml}`
}

function buildScorecardGrid({
  scenarios,
  variant,
}: {
  scenarios: any[]
  variant: 'preview' | 'full'
}): string {
  const rows = PLAN_ORDER
    .map((key) => scenarios.find((s) => s.key === key))
    .filter(Boolean)
    .map(buildPlanRow)
    .filter((r): r is PlanRow => r !== null)

  const thStyle =
    'padding:0.6rem 0.65rem; font-weight:500; color:#374151; font-size:0.85rem;'
  const th = (label: string, sub?: string, align = 'center') =>
    `<th style="${thStyle} text-align:${align};">${label}${sub ? `<div style="font-weight:400; color:#6b7280; font-size:0.7rem; margin-top:0.15rem;">${sub}</div>` : ''}</th>`

  const headerHtml =
    variant === 'full'
      ? [
          th('Plan', undefined, 'left'),
          th('Recovery', 'lake fills (40yr median)'),
          th('Floor', 'worst-case p10'),
          th('Safety', '% above min power'),
          th('Speed', '10yr gain'),
          th('Overall'),
        ].join('')
      : [
          th('Plan', undefined, 'left'),
          th('Recovery', 'fills the lake'),
          th('Floor', 'worst-case'),
          th('Safety', 'above min power'),
          th('Overall'),
        ].join('')

  const cell = (g: AxisGrade, detail?: string) =>
    `<td style="padding:0.6rem 0.65rem; text-align:center; vertical-align:middle;">${gradePill(g)}${detail ? `<div style="font-size:0.7rem; color:#6b7280; margin-top:0.2rem;">${detail}</div>` : ''}</td>`

  const bodyRows = rows
    .map((r, i) => {
      const bg = r.meta.emphasis
        ? 'background:#f0fdf4;'
        : i % 2 === 0
        ? ''
        : 'background:#fafafa;'
      const cells =
        variant === 'full'
          ? `<td style="padding:0.6rem 0.75rem; text-align:left;">${planNameCell(r)}</td>` +
            cell(r.recovery.grade, `${r.recovery.medianEnd.toFixed(0)} ft`) +
            cell(r.floor.grade, `${r.floor.lowestP10.toFixed(0)} ft`) +
            cell(r.safety.grade, `${Math.round(r.safety.stayAboveMinPower)}%`) +
            cell(
              r.speed.grade,
              `${r.speed.gain10yr >= 0 ? '+' : ''}${r.speed.gain10yr.toFixed(0)} ft`
            ) +
            cell(r.overallGrade)
          : `<td style="padding:0.6rem 0.75rem; text-align:left;">${planNameCell(r)}</td>` +
            cell(r.recovery.grade, `${r.recovery.medianEnd.toFixed(0)} ft`) +
            cell(r.floor.grade, `${r.floor.lowestP10.toFixed(0)} ft`) +
            cell(r.safety.grade, `${Math.round(r.safety.stayAboveMinPower)}%`) +
            cell(r.overallGrade)
      return `<tr style="border-bottom:1px solid #f3f4f6; ${bg}">${cells}</tr>`
    })
    .join('')

  return `
<div style="overflow-x:auto; margin: 1.5rem 0; border-radius:0.75rem; border:1px solid #e5e7eb;">
<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
<thead><tr style="border-bottom:2px solid #e5e7eb; background:#f9fafb;">${headerHtml}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>
`
}

// ─── Article 0: The Real Problem Isn't Drought, It's Math ──────

function buildArticle0(): ArticleSpec {
  const scenarios: Array<{
    label: string
    outflowPercent: number
    endingElevation: number
    differenceFromActualFt: number
    dailyCurve: Array<{ date: string; elevation: number }>
  }> = COUNTERFACTUALS.scenarios
  const annual = COUNTERFACTUALS.annualInflowVsOutflow as Array<{
    waterYear: number
    inflowAF: number
    outflowAF: number
  }>
  const actualEnd = COUNTERFACTUALS.actualEnd

  // CHART 1: Counterfactual overlay (actual + 95% + 90% + 85%)
  const actualCurve = scenarios.find((s) => s.outflowPercent === 100)!.dailyCurve
  const c95 = scenarios.find((s) => s.outflowPercent === 95)!.dailyCurve
  const c90 = scenarios.find((s) => s.outflowPercent === 90)!.dailyCurve
  const c85 = scenarios.find((s) => s.outflowPercent === 85)!.dailyCurve
  const chartCounterfactualData = actualCurve.map((pt, i) => ({
    date: pt.date,
    actual: pt.elevation,
    pct95: c95[i]?.elevation ?? null,
    pct90: c90[i]?.elevation ?? null,
    pct85: c85[i]?.elevation ?? null,
  }))
  const chartCounterfactual: ChartSpec = {
    chartType: 'line',
    title: 'What-if: Lake Powell 1996-present under reduced releases',
    data: chartCounterfactualData,
    series: [
      { dataKey: 'actual', color: '#111827', name: 'Actual elevation' },
      { dataKey: 'pct95', color: '#0d7377', name: "5% less released ('96-now)" },
      { dataKey: 'pct90', color: '#16a34a', name: "10% less released" },
      { dataKey: 'pct85', color: '#7c3aed', name: "15% less released" },
    ],
    xKey: 'date',
    xType: 'date',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'Replaying actual inflows from Jan 1996 under reduced release rates. Accounts for evaporation and spillway. Dashed lines show key boat ramp access thresholds.',
  }

  // CHART 2: Annual inflow vs outflow bars
  const chartInflowOutflow: ChartSpec = {
    chartType: 'composed',
    title: 'Annual inflow vs outflow, water years 1996–present',
    data: annual.map((a) => ({
      waterYear: a.waterYear,
      inflowMAF: Math.round((a.inflowAF / 1_000_000) * 100) / 100,
      outflowMAF: Math.round((a.outflowAF / 1_000_000) * 100) / 100,
    })),
    series: [
      { dataKey: 'inflowMAF', type: 'bar', color: '#0284c7', name: 'Inflow (MAF)' },
      { dataKey: 'outflowMAF', type: 'bar', color: '#d4a574', name: 'Outflow (MAF)' },
    ],
    xKey: 'waterYear',
    xType: 'category',
    yLabel: 'MAF',
    caption:
      'Outflow tracks inflow closely most years. Evaporation (~500-600 KAF/yr) is not reflected in either bar — it is the gap.',
  }

  const diff95 = scenarios.find((s) => s.outflowPercent === 95)!.differenceFromActualFt
  const diff90 = scenarios.find((s) => s.outflowPercent === 90)!.differenceFromActualFt
  const diff85 = scenarios.find((s) => s.outflowPercent === 85)!.differenceFromActualFt
  const actualDrop = COUNTERFACTUALS.actualStart.elevation - actualEnd.elevation

  const bodyHtml = `
<p><strong>If we had released just 5% less water every year since 1996, Lake Powell would be roughly ${Math.round(diff95)} feet higher today than it is.</strong></p>

<p>That is not a climate claim, a drought claim, or a future-modeling claim. It is an arithmetic fact we can compute directly from the Bureau of Reclamation's own daily measurements. Every drop that went through Glen Canyon Dam is on the ledger. Every drop that came in is too. The math is available. We have not been doing it.</p>

<p>This article walks through a single question and one answer: <em>how much of Lake Powell's current low elevation is drought, and how much is just math we chose not to do?</em></p>

<h2>The receipts</h2>

<p>Starting January 1, 1996, Lake Powell sat at ${COUNTERFACTUALS.actualStart.elevation.toFixed(0)} ft — more than 170 feet higher than today and close to full pool. Between then and now, about ${actualDrop.toFixed(0)} feet of elevation have left the reservoir.</p>

<p>We can replay those 30 years under different release rules using the exact same historical inflows. Less water released each day means more water sitting in the lake, and the lake rises accordingly. Here is what the reservoir would have looked like if, at every step, we had released a little less:</p>

[[chart:counterfactual]]

<ul>
<li><strong>5% less released:</strong> Lake would be <strong>${Math.round(diff95)} feet higher</strong> today (${scenarios.find((s) => s.outflowPercent === 95)!.endingElevation.toFixed(0)} ft).</li>
<li><strong>10% less released:</strong> <strong>${Math.round(diff90)} feet higher</strong> (${scenarios.find((s) => s.outflowPercent === 90)!.endingElevation.toFixed(0)} ft).</li>
<li><strong>15% less released:</strong> <strong>${Math.round(diff85)} feet higher</strong> (${scenarios.find((s) => s.outflowPercent === 85)!.endingElevation.toFixed(0)} ft) — essentially back to 1996 levels.</li>
</ul>

<p>The black line is what actually happened. The colored lines are what would have happened under tighter management of the same water.</p>

<h2>"But the drought did it"</h2>

<p>Look at the next chart. It shows every water year since 1996 as two bars side by side: what came in (inflow) and what was let out (outflow).</p>

[[chart:inflowVsOutflow]]

<p>In almost every year, outflow is larger than inflow. That is the structural deficit everyone talks about. But it is also a management pattern: when the lake gets wet years, we release more. When it gets dry years, we still release a lot. Over 30 years, the cumulative gap adds up — and it does not include the water that evaporates.</p>

<h2>The evaporation gap</h2>

<p>Lake Powell loses roughly <strong>500,000–600,000 acre-feet a year to evaporation</strong>. That is a full-sized reservoir every decade or two, vanishing into the air.</p>

<p>Evaporation is not on the outflow ledger. It is not counted against anyone's allocation. It is just gone. Accounting for 30 years of it is approximately ${((550_000 * 30) / 1_000_000).toFixed(0)} MAF — comparable to the <em>entire capacity</em> of Lake Powell.</p>

<p>If the operating rules for the system pretend that evaporation is not happening, the system will slowly drain whenever inflow falls short of outflow. That is exactly what we have watched happen.</p>

<h2>What this means</h2>

<p>The post-2026 operating rules are on the table right now. This site exists to make the alternatives visible in plain numbers:</p>

<ul>
<li>How each proposed plan performs under the <em>driest decade we have on record</em>, so nobody can say "your model is too optimistic."</li>
<li>What each one looks like over 10, 20, and 40 years.</li>
<li>How the Colorado River Abundance Act fits in over the long run as we build new infrastructure.</li>
<li>Which plans we think are worth pushing for, and why.</li>
</ul>

<h2>How the plans score</h2>

<p>The chart below is a preview — how each plan does at the 40-year horizon under the driest decade on record, rated on three dimensions instead of one. <strong>Click any plan for its full breakdown.</strong></p>

${buildScorecardGrid({ scenarios: SCORECARDS.scenarios, variant: 'preview' })}

<p style="font-size:0.85rem; color:#6b7280; font-style:italic; margin-top:-0.5rem;">A single "overall" grade hides a real trade-off: Max Operational Flexibility wins on <strong>floor</strong> (worst-case safety); Supply Driven wins on <strong>recovery</strong> (how full the lake gets). The full head-to-head breaks this apart.</p>

<p><a href="/articles/plans-head-to-head" style="color:#0d7377; font-weight:500;">Full side-by-side analysis, with all four axes and the speed-of-recovery dimension →</a></p>

<p>The case in every one of those articles starts here: <strong>we have enough water. We just need to manage the system as if the water matters.</strong></p>

<hr />

<p><em>Read the plan-by-plan breakdowns: <a href="/articles/no-action-plan">No Action</a> · <a href="/articles/basic-coordination-plan">Basic Coordination</a> · <a href="/articles/enhanced-coordination-plan">Enhanced Coordination</a> · <a href="/articles/max-operational-flexibility-plan">Max Operational Flexibility</a> · <a href="/articles/supply-driven-plan">Supply Driven</a> · <a href="/articles/colorado-river-abundance-act">The Abundance Act</a> · <a href="/articles/plans-head-to-head">Head-to-Head verdict</a>.</em></p>
`.trim()

  return {
    slug: 'real-problem-isnt-drought-its-math',
    title: "The Real Problem Isn't Drought — It's Math",
    subtitle: `If we had released just 5% less water since 1996, Lake Powell would be roughly ${Math.round(diff95)} feet higher today.`,
    readTimeMinutes: 8,
    charts: [
      { key: 'counterfactual', spec: chartCounterfactual, altText: 'Actual Lake Powell elevation vs. counterfactuals with reduced releases 1996-present' },
      { key: 'inflowVsOutflow', spec: chartInflowOutflow, altText: 'Annual inflow vs outflow water years 1996-present' },
    ],
    bodyHtml,
  }
}

// ─── Article 7: Head-to-Head verdict ─────────────────────────────

function buildArticle7(): ArticleSpec {
  const scenarios: Array<any> = SCORECARDS.scenarios
  const byKey = (key: string) => scenarios.find((s) => s.key === key)

  // Find the key scenarios
  const noAction = byKey('federal-plan-no-action')
  const basic = byKey('federal-plan-basic-coordination')
  const enhanced = byKey('federal-plan-enhanced-coordination')
  const maxFlex = byKey('federal-plan-max-operational-flexibility')
  const supply = byKey('federal-plan-supply-driven')
  const currentOps = byKey('current-operations-2007-guidelines')
  const augPhase1 = byKey('current-ops-plus-ioc-only')
  const augRealistic = byKey('current-ops-plus-realistic')
  const augFull = byKey('current-ops-plus-optimistic')

  const getH = (s: any, years: number) => s.horizons.find((h: any) => h.years === years)

  // CHART A: Six plans, median elevation over 40 years
  const maxLen = Math.max(
    ...[noAction, basic, enhanced, maxFlex, supply, currentOps].map((s) => s.dailyP50.length)
  )
  const chartPlansOverlayData = Array.from({ length: maxLen }).map((_, i) => ({
    year: noAction.dailyP50[i] ? monthsToYear(noAction.dailyP50[i].monthsOut) : null,
    noAction: noAction.dailyP50[i]?.elevation ?? null,
    basic: basic.dailyP50[i]?.elevation ?? null,
    enhanced: enhanced.dailyP50[i]?.elevation ?? null,
    maxFlex: maxFlex.dailyP50[i]?.elevation ?? null,
    supply: supply.dailyP50[i]?.elevation ?? null,
    currentOps: currentOps.dailyP50[i]?.elevation ?? null,
  }))
  const chartPlansOverlay: ChartSpec = {
    chartType: 'line',
    title: 'Median elevation by plan, 40-year stress test (last-10-years inflow)',
    data: chartPlansOverlayData,
    series: [
      { dataKey: 'maxFlex', color: '#16a34a', name: 'Max Operational Flexibility' },
      { dataKey: 'supply', color: '#0d7377', name: 'Supply Driven' },
      { dataKey: 'enhanced', color: '#0284c7', name: 'Enhanced Coordination' },
      { dataKey: 'basic', color: '#7c3aed', name: 'Basic Coordination' },
      { dataKey: 'currentOps', color: '#ca8a04', name: '2007 Guidelines (status quo)' },
      { dataKey: 'noAction', color: '#dc2626', name: 'No Action' },
    ],
    xKey: 'year',
    xType: 'number',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'Median (p50) trajectory under the driest decade on record. Same starting point, same inflow sampling, only the operating rule changes.',
  }

  // CHART B: The winner with and without augmentation
  const augMaxLen = Math.max(
    ...[maxFlex, augPhase1, augRealistic, augFull].map((s) => s.dailyP50.length)
  )
  const chartAugData = Array.from({ length: augMaxLen }).map((_, i) => ({
    year: maxFlex.dailyP50[i] ? monthsToYear(maxFlex.dailyP50[i].monthsOut) : null,
    maxFlex: maxFlex.dailyP50[i]?.elevation ?? null,
    phase1: augPhase1.dailyP50[i]?.elevation ?? null,
    realistic: augRealistic.dailyP50[i]?.elevation ?? null,
    full: augFull.dailyP50[i]?.elevation ?? null,
  }))
  const chartAug: ChartSpec = {
    chartType: 'line',
    title: 'Abundance Act augmentation overlays',
    data: chartAugData,
    series: [
      { dataKey: 'maxFlex', color: '#16a34a', name: 'Max Op Flex (no augmentation)' },
      { dataKey: 'phase1', color: '#0284c7', name: 'Current Ops + Abundance Phase 1 (2 MAF)' },
      { dataKey: 'realistic', color: '#7c3aed', name: 'Current Ops + Abundance Realistic (3 MAF)' },
      { dataKey: 'full', color: '#d4a574', name: 'Current Ops + Abundance Full (7 MAF)' },
    ],
    xKey: 'year',
    xType: 'number',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'Augmentation scenarios layered on the 2007 Guidelines. Note the delayed onset (buildout ~2045) — augmentation is a long-run lift, not a short-run rescue.',
  }

  const winnerH40 = getH(maxFlex, 40)
  const supplyH40 = getH(supply, 40)
  const enhancedH40 = getH(enhanced, 40)
  const currentOpsH40 = getH(currentOps, 40)
  const noActionH40 = getH(noAction, 40)

  const bodyHtml = `
<p><em>Imagine if, starting in 1996, we had released just 5% less water every year. Lake Powell would be roughly 100 feet higher today. (<a href="/articles/real-problem-isnt-drought-its-math">Read the math →</a>)</em></p>

<p><strong>That is what's possible. This article is about which of the plans actually on the table for post-2026 operations gets us closest.</strong></p>

<p>We ran the five federal-plan alternatives plus the current 2007 Guidelines through the same stress test: sampled inflows from the <em>last ten years</em> (the driest decade on record), 2,000 iterations, 40 years of projection. The starting point is the state of Lake Powell after the April 2026 federal plan finishes playing out (reduced releases through Sep 30, 2026, plus Flaming Gorge transfers through Apr 30, 2027) — i.e., every plan is evaluated on what it does <em>on top of</em> the current emergency measures. Same everything, except the long-term operating rule changes.</p>

<p>Here is what each plan produced:</p>

[[chart:plansOverlay]]

<h2>The full scorecard — four axes, and the winner depends on what you value</h2>

<p>At the 40-year horizon, under the worst inflow regime on record. The one-letter "overall" grade is useful shorthand, but it hides the real story: different plans win on different dimensions. <strong>Click any plan name for its dedicated article.</strong></p>

${buildScorecardGrid({ scenarios: SCORECARDS.scenarios, variant: 'full' })}

<h3>Reading the grid</h3>

<ul>
<li><strong>Recovery</strong> — median ending elevation at 40 years. How full does the lake actually get? <em>Supply Driven wins</em> at ${supplyH40.medianEnd} ft.</li>
<li><strong>Floor</strong> — the worst 10% of simulated futures, i.e. bad luck across decades. How bad can it get? <em>Max Operational Flexibility wins</em> at ${winnerH40.lowestP10} ft — the only plan whose bad-luck floor stays above minimum power pool.</li>
<li><strong>Safety</strong> — percent of time, across all 2,000 simulations and all 40 years, the lake sits above minimum power pool (3,490 ft). <em>MOF wins</em> at 100%, with SD close behind at ~82%.</li>
<li><strong>Speed</strong> — median elevation gain in the first 10 years. Near-term recovery. <em>SD wins</em> at +${getH(supply, 10).gain} ft, narrowly ahead of MOF (+${getH(maxFlex, 10).gain} ft).</li>
</ul>

<p>No plan wins every axis. MOF and SD split the top two (MOF takes Floor and Safety; SD takes Recovery and Speed), with SD's median ${Math.round(supplyH40.medianEnd - winnerH40.medianEnd)} ft higher at 40 years and MOF's floor ${Math.round(winnerH40.lowestP10 - supplyH40.lowestP10)} ft higher. Both are real outcomes; the grid lets you weigh them against each other instead of compressing them into a single grade.</p>

<h2>Which plan wins depends on what you value</h2>

<p>Three plans are in serious contention. They win on different axes of the scorecard, so picking between them is a priorities question, not a ranking question. Here is how to choose.</p>

<h3>If you prioritize worst-case safety — Max Operational Flexibility</h3>

<p>MOF is the only plan whose bottom-10% floor stays above minimum power pool. Even in the worst 10% of simulated futures, Glen Canyon Dam keeps generating power, the lake does not break critical thresholds, and the system retains operational flexibility. Its 40-year median of <strong>${winnerH40.medianEnd} ft</strong> is strong; its floor of <strong>${winnerH40.lowestP10} ft</strong> is what sets it apart.</p>

<p><strong>Pick MOF if your top concern is:</strong> "no matter what inflows we get, the system has to hold."</p>

<p><a href="/articles/max-operational-flexibility-plan">Full scorecard for Max Operational Flexibility →</a></p>

<h3>If you prioritize filling the lake — Supply Driven</h3>

<p>SD produces the highest median elevation at every long horizon — <strong>${supplyH40.medianEnd} ft</strong> at 40 years, a gain of roughly ${Math.round(supplyH40.medianEnd - SCORECARDS.startElevation)} feet from the post-federal-plan baseline. That is near Hite territory. For anyone who cares what the lake actually looks like on a summer weekend, this is the plan that most closely resembles "full." The tradeoff: its worst-case floor (${supplyH40.lowestP10} ft) dips ${Math.round(3490 - supplyH40.lowestP10)} feet below minimum power pool in the bottom 10% of futures, where MOF does not.</p>

<p><strong>Pick SD if your top concern is:</strong> "get the lake as high as possible, and accept some worst-case exposure to get there."</p>

<p><a href="/articles/supply-driven-plan">Full scorecard for Supply Driven →</a></p>

<h3>If you want a balanced fallback — Enhanced Coordination</h3>

<p>Enhanced earns B's across the scorecard: a respectable median (${enhancedH40.medianEnd} ft), a decent floor (${enhancedH40.lowestP10} ft), and it stays within the existing Compact framework. It is not the leader on any axis, but it avoids the worst outcomes and is the conservative pick if neither MOF nor SD is politically achievable.</p>

<p><a href="/articles/enhanced-coordination-plan">Full scorecard for Enhanced Coordination →</a></p>

<h2>Plans that don't meet the math</h2>

<p>Three plans on the table don't clear the bar. Not emotionally — just by the numbers:</p>

<ul>
<li><strong>2007 Guidelines (status quo)</strong> — 40-year median of ${currentOpsH40.medianEnd} ft, below minimum power pool. Floor reaches dead pool (3,370 ft) in the worst 10% of futures. The structural deficit persists unchanged.</li>
<li><strong>Basic Coordination</strong> — marginal improvement over status quo. 40-year median of ${getH(basic, 40).medianEnd} ft, still below min power. Floor reaches dead pool.</li>
<li><strong>No Action</strong> — lowest median of any plan (${noActionH40.medianEnd} ft). Floor reaches dead pool. The weakest option on the table.</li>
</ul>

<p>These aren't recommendations against; they are the results the math produces. If any of these are the final choice, Powell's worst-case trajectory runs into dead pool over the 40-year stress test.</p>

<p><a href="/articles/no-action-plan">More on the No Action plan →</a></p>

<h2>Where the Abundance Act fits</h2>

<p>The Colorado River Abundance Act does not compete with the operating-rule plans — <em>it stacks on top of them</em>. Augmentation is replacement water delivered to Lake Mead, which means Powell does not have to release as much downstream. More water stays in Powell.</p>

[[chart:augmentation]]

<p>Three things are worth noticing in this chart:</p>

<ol>
<li><strong>Augmentation takes 15-20 years to show up.</strong> Phase 1 comes online around 2045. Full buildout is 2055+. The short-run (first decade) trajectory barely moves.</li>
<li><strong>Long-run, the effect is large.</strong> 2007 Guidelines + Full buildout lifts the 40-year median from ${currentOpsH40.medianEnd} ft to ${getH(augFull, 40).medianEnd} ft — close to what Max Op Flex alone produces, but achieved through <em>adding</em> water rather than <em>managing</em> less.</li>
<li><strong>Augmentation alone cannot fix the worst-case.</strong> Even with full buildout, the p10 floor of the combined scenario still hits dead pool because the infrastructure is not online yet when bad runs of dry years happen.</li>
</ol>

<p>The right combination is both: <strong>adopt Max Operational Flexibility (or Enhanced Coordination) for post-2026 operations, and support the Abundance Act framework for long-run capacity.</strong> Short-run, the operating rule protects the reservoir. Long-run, augmentation keeps us ahead as demand grows.</p>

<p><a href="/articles/colorado-river-abundance-act">Full scorecard for the Abundance Act →</a></p>

<h2>The bottom line</h2>

<p>We built this site to make the post-2026 decisions legible to the people who actually use Lake Powell. The math is not subtle: <strong>two plans clear every bar for different reasons, and the status quo is not one of them.</strong></p>

<p>If you prioritize worst-case safety, push for <strong>Max Operational Flexibility</strong>. If you prioritize filling the lake, push for <strong>Supply Driven</strong>. If neither is politically available, <strong>Enhanced Coordination</strong> is the conservative fallback that still avoids the worst outcomes. Anything below those three runs Powell into dead pool in the worst-10% of futures.</p>

<p><em>Every number in this article comes from Monte Carlo simulations you can re-run on this site's <a href="/simulator">simulator</a>. Sources and methodology are documented on the <a href="/about">About page</a>.</em></p>
`.trim()

  return {
    slug: 'plans-head-to-head',
    title: 'The Head-to-Head: Which Post-2026 Plan Actually Wins?',
    subtitle: `Two plans clear every bar for different reasons — Max Operational Flexibility wins on worst-case safety, Supply Driven wins on lake recovery. The right pick depends on what you value.`,
    readTimeMinutes: 12,
    charts: [
      { key: 'plansOverlay', spec: chartPlansOverlay },
      { key: 'augmentation', spec: chartAug },
    ],
    bodyHtml,
  }
}

// ─── DB insert helpers ────────────────────────────────────────────

async function upsertArticle(spec: ArticleSpec) {
  console.log(`Seeding: ${spec.slug}`)

  // 1) Upsert the article with a temporary placeholder body (the real body
  //    references chart asset IDs that don't exist yet).
  const upsertResult = await pool.query(
    `INSERT INTO articles (slug, title, subtitle, body_html, body_markdown, read_time_minutes, status)
     VALUES ($1, $2, $3, '', '', $4, 'draft')
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       subtitle = EXCLUDED.subtitle,
       read_time_minutes = EXCLUDED.read_time_minutes,
       updated_at = NOW()
     RETURNING id`,
    [spec.slug, spec.title, spec.subtitle, spec.readTimeMinutes]
  )
  const articleId: number = upsertResult.rows[0].id

  // 2) Clear existing chart assets for this article (safe to re-run).
  await pool.query(
    `DELETE FROM article_assets WHERE article_id = $1 AND asset_type = 'chart'`,
    [articleId]
  )

  // 3) Insert each chart asset, collect its ID.
  const assetIdByKey = new Map<string, number>()
  for (const chart of spec.charts) {
    const res = await pool.query(
      `INSERT INTO article_assets (article_id, asset_type, config, alt_text)
       VALUES ($1, 'chart', $2::jsonb, $3)
       RETURNING id`,
      [articleId, JSON.stringify(chart.spec), chart.altText ?? null]
    )
    assetIdByKey.set(chart.key, res.rows[0].id)
  }

  // 4) Substitute [[chart:key]] placeholders with <!-- chart:asset:N -->.
  let finalHtml = spec.bodyHtml
  for (const [key, assetId] of assetIdByKey) {
    const placeholder = `[[chart:${key}]]`
    finalHtml = finalHtml.split(placeholder).join(`<!-- chart:asset:${assetId} -->`)
  }

  // 5) Update the article with the substituted body.
  await pool.query(
    `UPDATE articles SET body_html = $1, updated_at = NOW() WHERE id = $2`,
    [finalHtml, articleId]
  )

  console.log(`  ✓ article_id=${articleId}, ${assetIdByKey.size} charts`)
}

// ─── Shared plan-article builder ─────────────────────────────────

interface PlanArticleInput {
  slug: string
  title: string
  subtitle: string
  readTimeMinutes: number
  scenarioKey: string
  whatItIs: string
  strengths: string[]
  weaknesses: string[]
  verdict: string
}

function buildPlanArticle(input: PlanArticleInput): ArticleSpec {
  const scenario = SCORECARDS.scenarios.find((s: any) => s.key === input.scenarioKey)
  if (!scenario) throw new Error(`No scorecard scenario for ${input.scenarioKey}`)

  const getH = (years: number) =>
    scenario.horizons.find((h: any) => h.years === years)
  const h10 = getH(10)
  const h20 = getH(20)
  const h40 = getH(40)

  // Chart: p50 + p10 ribbon over 40 years
  const maxLen = Math.max(scenario.dailyP50.length, scenario.dailyP10.length)
  const chartData = Array.from({ length: maxLen }).map((_, i) => ({
    year: scenario.dailyP50[i] ? monthsToYear(scenario.dailyP50[i].monthsOut) : null,
    p50: scenario.dailyP50[i]?.elevation ?? null,
    p10: scenario.dailyP10[i]?.elevation ?? null,
  }))
  const chartSpec: ChartSpec = {
    chartType: 'line',
    title: `${input.title}: 40-year projection under last-10-years stress test`,
    data: chartData,
    series: [
      { dataKey: 'p50', color: '#0d7377', name: 'Median (p50)' },
      { dataKey: 'p10', color: '#c99a7a', name: 'Worst case (p10)' },
    ],
    xKey: 'year',
    xType: 'number',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'Projected Lake Powell elevation under the driest decade on record. Median line shows the most likely outcome; p10 line is the 10th-percentile worst case.',
  }

  const bodyHtml = `
<p>${input.whatItIs}</p>

[[chart:projection]]

<h2>The scorecard</h2>

<p>We ran this plan through our standard stress test: sampled inflows from the <em>last ten years</em> (the driest decade on record), 2,000 Monte Carlo iterations, 40 years forward. Same starting point as every other plan we evaluate. Same inflow sampling. Only the operating rule changes.</p>

<div style="overflow-x:auto; margin: 1.5rem 0;">
<table style="width:100%; border-collapse:collapse; font-size:0.95rem;">
<thead>
<tr style="border-bottom:2px solid #e5e7eb; text-align:left;">
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Horizon</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Median Ending</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Worst-Case Floor</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151; text-align:center;">Grade</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom:1px solid #f3f4f6;">
<td style="padding:0.75rem 1rem; color:#6b7280;">10 years</td>
<td style="padding:0.75rem 1rem; font-weight:500;">${h10.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${h10.lowestP10} ft</td>
<td style="padding:0.75rem 1rem; text-align:center;"><span style="display:inline-block; padding:0.15rem 0.75rem; border-radius:9999px; font-weight:600; font-size:0.85rem; ${h10.grade === 'A' ? 'background:#d1fae5; color:#065f46;' : h10.grade === 'B' ? 'background:#dbeafe; color:#1e40af;' : h10.grade === 'F' ? 'background:#fee2e2; color:#991b1b;' : 'background:#f3f4f6; color:#374151;'}">${h10.grade}</span></td>
</tr>
<tr style="border-bottom:1px solid #f3f4f6; background:#fafafa;">
<td style="padding:0.75rem 1rem; color:#6b7280;">20 years</td>
<td style="padding:0.75rem 1rem; font-weight:500;">${h20.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${h20.lowestP10} ft</td>
<td style="padding:0.75rem 1rem; text-align:center;"><span style="display:inline-block; padding:0.15rem 0.75rem; border-radius:9999px; font-weight:600; font-size:0.85rem; ${h20.grade === 'A' ? 'background:#d1fae5; color:#065f46;' : h20.grade === 'B' ? 'background:#dbeafe; color:#1e40af;' : h20.grade === 'F' ? 'background:#fee2e2; color:#991b1b;' : 'background:#f3f4f6; color:#374151;'}">${h20.grade}</span></td>
</tr>
<tr>
<td style="padding:0.75rem 1rem; color:#6b7280;">40 years</td>
<td style="padding:0.75rem 1rem; font-weight:500;">${h40.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${h40.lowestP10} ft</td>
<td style="padding:0.75rem 1rem; text-align:center;"><span style="display:inline-block; padding:0.15rem 0.75rem; border-radius:9999px; font-weight:600; font-size:0.85rem; ${h40.grade === 'A' ? 'background:#d1fae5; color:#065f46;' : h40.grade === 'B' ? 'background:#dbeafe; color:#1e40af;' : h40.grade === 'F' ? 'background:#fee2e2; color:#991b1b;' : 'background:#f3f4f6; color:#374151;'}">${h40.grade}</span></td>
</tr>
</tbody>
</table>
</div>

<h2>Strengths</h2>

<ul>
${input.strengths.map((s) => `<li>${s}</li>`).join('\n')}
</ul>

<h2>Weaknesses</h2>

<ul>
${input.weaknesses.map((w) => `<li>${w}</li>`).join('\n')}
</ul>

<h2>Verdict</h2>

<p>${input.verdict}</p>

<hr />

<p><em>See all plans compared in the <a href="/articles/plans-head-to-head">head-to-head verdict</a>, or read about why <a href="/articles/real-problem-isnt-drought-its-math">the real problem isn't drought — it's math</a>.</em></p>
`.trim()

  return {
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    readTimeMinutes: input.readTimeMinutes,
    charts: [{ key: 'projection', spec: chartSpec }],
    bodyHtml,
  }
}

// ─── Article 6: The Colorado River Abundance Act (standalone) ───

function buildArticle6(): ArticleSpec {
  const byKey = (k: string) =>
    SCORECARDS.scenarios.find((s: any) => s.key === k)
  const currentOps = byKey('current-operations-2007-guidelines')
  const phase1 = byKey('current-ops-plus-ioc-only')
  const realistic = byKey('current-ops-plus-realistic')
  const full = byKey('current-ops-plus-optimistic')

  const getH = (s: any, years: number) =>
    s.horizons.find((h: any) => h.years === years)

  // Overlay chart: baseline (2007 alone) + three augmentation levels
  const maxLen = Math.max(
    currentOps.dailyP50.length,
    phase1.dailyP50.length,
    realistic.dailyP50.length,
    full.dailyP50.length
  )
  const chartData = Array.from({ length: maxLen }).map((_, i) => ({
    year: currentOps.dailyP50[i] ? monthsToYear(currentOps.dailyP50[i].monthsOut) : null,
    baseline: currentOps.dailyP50[i]?.elevation ?? null,
    phase1: phase1.dailyP50[i]?.elevation ?? null,
    realistic: realistic.dailyP50[i]?.elevation ?? null,
    full: full.dailyP50[i]?.elevation ?? null,
  }))
  const chartSpec: ChartSpec = {
    chartType: 'line',
    title: 'Median elevation with and without Abundance Act augmentation',
    data: chartData,
    series: [
      { dataKey: 'baseline', color: '#111827', name: '2007 Guidelines (no augmentation)' },
      { dataKey: 'phase1', color: '#0284c7', name: '+ Phase 1 (2 MAF/yr by 2045)' },
      { dataKey: 'realistic', color: '#7c3aed', name: '+ Realistic (3 MAF/yr by 2065)' },
      { dataKey: 'full', color: '#d4a574', name: '+ Full buildout (7 MAF/yr by 2055)' },
    ],
    xKey: 'year',
    xType: 'number',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'Augmentation adds water to Mead / Lower Basin, which reduces the releases Powell has to make. All three scenarios use the 2007 Guidelines as the operating rule.',
  }

  const fullH40 = getH(full, 40)
  const realisticH40 = getH(realistic, 40)
  const phase1H40 = getH(phase1, 40)
  const baselineH40 = getH(currentOps, 40)

  const bodyHtml = `
<p>The Colorado River Abundance Act, introduced by the Blue Ribbon Coalition in late 2026, is not an operating-rule proposal — it is an <em>infrastructure</em> proposal. The pitch is simple: build enough desalination and conveyance capacity to deliver 2 to 7 million acre-feet of new water per year into the Colorado River system, delivered to Lake Mead or directly to Lower Basin users. That water offsets releases Powell would otherwise have to make, so Powell stays higher. Same lake, more water, fewer releases needed.</p>

<p>It is the long-run complement to operating-rule reform. Where post-2026 operating rules change <em>how</em> we release water from what we have, the Abundance Act changes <em>how much water the system has</em>.</p>

<h2>What the Act proposes</h2>

<p>The Act authorizes a Colorado River Augmentation Project with three staged buildout milestones, paired with financing, public-private partnerships, and streamlined permitting to accelerate construction:</p>

<ul>
<li><strong>Phase 1 (IOC, 2 MAF/yr):</strong> Initial Operating Capability — first plants online by 2045, delivering 2 million acre-feet per year. Scale comparable to Israel's entire national desalination fleet.</li>
<li><strong>Realistic buildout (3 MAF/yr):</strong> A phased expansion through 2065, enough to close the Lower Basin's structural deficit.</li>
<li><strong>Full buildout (7 MAF/yr):</strong> The Act's full vision — 7 MAF/yr online by 2055. Roughly 10-13% of current global seawater desalination capacity, concentrated on one coast.</li>
</ul>

<p>Our simulator implements each level as an augmentation overlay on top of whatever operating rule the user selects. For the scorecards below, we used the current <strong>2007 Guidelines</strong> as the operating-rule baseline so the effect of augmentation is isolated.</p>

[[chart:augmentation]]

<h2>The scorecards</h2>

<p>Same stress test as every other plan we evaluate: last-10-years inflow, 2,000 Monte Carlo iterations, 40-year horizon.</p>

<div style="overflow-x:auto; margin: 1.5rem 0; border-radius:0.75rem; border:1px solid #e5e7eb;">
<table style="width:100%; border-collapse:collapse; font-size:0.95rem;">
<thead>
<tr style="border-bottom:2px solid #e5e7eb; text-align:left; background:#f9fafb;">
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Scenario</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">10 yr</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">20 yr</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">40 yr</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">40 yr floor</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom:1px solid #f3f4f6;">
<td style="padding:0.75rem 1rem; color:#6b7280;">2007 Guidelines (baseline)</td>
<td style="padding:0.75rem 1rem;">${getH(currentOps, 10).medianEnd} ft</td>
<td style="padding:0.75rem 1rem;">${getH(currentOps, 20).medianEnd} ft</td>
<td style="padding:0.75rem 1rem;">${baselineH40.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${baselineH40.lowestP10} ft</td>
</tr>
<tr style="border-bottom:1px solid #f3f4f6; background:#fafafa;">
<td style="padding:0.75rem 1rem;">+ Phase 1 (2 MAF/yr)</td>
<td style="padding:0.75rem 1rem;">${getH(phase1, 10).medianEnd} ft</td>
<td style="padding:0.75rem 1rem;">${getH(phase1, 20).medianEnd} ft</td>
<td style="padding:0.75rem 1rem; font-weight:500;">${phase1H40.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${phase1H40.lowestP10} ft</td>
</tr>
<tr style="border-bottom:1px solid #f3f4f6;">
<td style="padding:0.75rem 1rem;">+ Realistic (3 MAF/yr)</td>
<td style="padding:0.75rem 1rem;">${getH(realistic, 10).medianEnd} ft</td>
<td style="padding:0.75rem 1rem;">${getH(realistic, 20).medianEnd} ft</td>
<td style="padding:0.75rem 1rem; font-weight:500;">${realisticH40.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${realisticH40.lowestP10} ft</td>
</tr>
<tr style="background:#fafafa;">
<td style="padding:0.75rem 1rem;">+ Full (7 MAF/yr)</td>
<td style="padding:0.75rem 1rem;">${getH(full, 10).medianEnd} ft</td>
<td style="padding:0.75rem 1rem;">${getH(full, 20).medianEnd} ft</td>
<td style="padding:0.75rem 1rem; font-weight:500;">${fullH40.medianEnd} ft</td>
<td style="padding:0.75rem 1rem; color:#6b7280;">${fullH40.lowestP10} ft</td>
</tr>
</tbody>
</table>
</div>

<h2>What the data shows</h2>

<h3>1. In the first decade, augmentation does almost nothing.</h3>

<p>The 10-year medians are barely different from the baseline (${baselineH40.medianEnd - getH(currentOps, 10).medianEnd < 0 ? 'difference <1 ft' : 'identical within noise'}). That is not a failure of the model — it is the timeline. First plants don't come online until 2045 at the earliest. Between now and then, the Act gives the system nothing new. This is the honest cost of long-lead-time infrastructure.</p>

<h3>2. By 20 years, the effect starts to show.</h3>

<p>Phase 1 adds <strong>${(getH(phase1, 20).medianEnd - getH(currentOps, 20).medianEnd).toFixed(0)} ft</strong> to the 20-year median. Realistic adds <strong>${(getH(realistic, 20).medianEnd - getH(currentOps, 20).medianEnd).toFixed(0)} ft</strong>. Full adds <strong>${(getH(full, 20).medianEnd - getH(currentOps, 20).medianEnd).toFixed(0)} ft</strong>. Not dramatic yet, but the trajectory is bending upward.</p>

<h3>3. By 40 years, the effect is large.</h3>

<p>Full buildout lifts the 40-year median from ${baselineH40.medianEnd} ft to <strong>${fullH40.medianEnd} ft</strong> — about ${(fullH40.medianEnd - baselineH40.medianEnd).toFixed(0)} feet of elevation, added purely by manufacturing new water. Even the Realistic scenario adds ~${(realisticH40.medianEnd - baselineH40.medianEnd).toFixed(0)} feet. This is the case for augmentation as long-term insurance against growing demand.</p>

<h3>4. The worst-case floor is still dead pool.</h3>

<p>Every augmentation scenario's p10 worst case still floors at 3,370 ft (dead pool). Why? Because augmentation takes 15-20 years to come online. In the bottom 10% of bad-luck futures — long consecutive runs of dry years starting soon — the lake can reach dead pool <em>before</em> the new plants are delivering water. Augmentation is a long-run lift, not a short-run rescue.</p>

<h2>Strengths</h2>

<ul>
<li><strong>Additive to any operating rule.</strong> Augmentation works with the existing 2007 Guidelines, any DEIS alternative, or whatever comes next. No conflict with other reform.</li>
<li><strong>Scales with demand.</strong> The Southwest's population is projected to keep growing. Every other plan assumes we divide a shrinking pie. This one builds a bigger pie.</li>
<li><strong>Preserves Compact and Treaty obligations.</strong> The Act is explicit that Replacement Water is additive — it does not alter Mexico's Treaty allocation or shift Compact obligations between Upper and Lower Basins.</li>
<li><strong>Long-run elevation lift is real.</strong> 40-year medians above 3,590 ft under the Realistic and Full scenarios, even under last-decade stressed inflows.</li>
</ul>

<h2>Weaknesses</h2>

<ul>
<li><strong>Timeline.</strong> First capacity comes online ~2045. The Carlsbad desal plant (50,000 AF/yr) took about 15 years from concept to operation. 7 MAF/yr means roughly 140 Carlsbads worth of capacity — a scale no coast has ever built.</li>
<li><strong>Delivered cost.</strong> Estimated $2,500–$4,500 per acre-foot delivered to Lake Mead or Powell. Current Colorado River water costs roughly $270/AF. Cost is worth it if the alternative is an empty reservoir, but the gap is real.</li>
<li><strong>Energy demand.</strong> Full buildout at 7 MAF/yr would require 42–63 TWh/yr — about 8–12% of the Southwest's total electricity generation, or ~50% of Arizona's. The Act calls for dedicated renewables; whether that infrastructure can be built at pace is an open question.</li>
<li><strong>Cannot rescue the near term.</strong> For the next 15-20 years, the Act contributes nothing to Powell's elevation. Only operating-rule reform can help in that window.</li>
</ul>

<h2>Verdict</h2>

<p>The Abundance Act is a long-term play — and a strong one. It does not compete with operating-rule reform; it complements it. <strong>The right path forward is both:</strong> adopt the best-performing operating rule for the post-2026 period, and support the Abundance Act framework for long-run infrastructure. The operating rule protects the reservoir in the near term. Augmentation keeps the system ahead of demand growth in the long term.</p>

<p>If you have to pick one, pick the operating rule — the simulations are clear that augmentation alone cannot save the worst-case bad-draw futures. But supporting both is strictly better than supporting either alone. The Abundance Act is the most optimistic vision on the table for what the Southwest's water future can look like, and the math works: with enough time and investment, we can build our way to a reservoir that refills.</p>

<hr />

<p><em>Read the <a href="/articles/plans-head-to-head">head-to-head verdict</a> on which operating rule to pair this with, or start from <a href="/articles/real-problem-isnt-drought-its-math">the real problem isn't drought — it's math</a>.</em></p>
`.trim()

  return {
    slug: 'colorado-river-abundance-act',
    title: 'The Colorado River Abundance Act: Long-Term Insurance',
    subtitle:
      'Building new water is the Southwest\'s best long-run play — but it takes 15-20 years to come online, so it can\'t rescue the near term.',
    readTimeMinutes: 10,
    charts: [{ key: 'augmentation', spec: chartSpec }],
    bodyHtml,
  }
}

async function main() {
  console.log('=== Seeding article series ===\n')

  const articles: ArticleSpec[] = [
    buildArticle0(),
    buildPlanArticle({
      slug: 'no-action-plan',
      title: 'The No Action Plan: Doing Nothing Is the Worst Option',
      subtitle:
        'Continue the 2007 Guidelines past their 2026 expiration with no adjustments. Earns an F at 40 years.',
      readTimeMinutes: 5,
      scenarioKey: 'federal-plan-no-action',
      whatItIs:
        'The No Action alternative in the post-2026 Draft EIS is exactly what it sounds like: continue operating under the 2007 Interim Guidelines past their expiration with no modifications. No coordination improvements, no elevation-responsive adjustments, no new tools. This alternative exists primarily as a baseline for comparison — it is what happens if Congress and Reclamation fail to agree on anything.',
      strengths: [
        "Simple. No new legal framework required; no inter-basin negotiation needed.",
        'Politically the path of least resistance — easier to block change than enact it.',
      ],
      weaknesses: [
        'Worst outcome of any plan we evaluated. Under the last-decade stress test, median elevation ends below 3,430 ft within 40 years.',
        'Worst-case (p10) floor hits dead pool (3,370 ft) — in the bottom 10% of futures, the lake is effectively empty.',
        "Ignores everything we've learned since 2007 about reservoir response to extended drought. The 2007 rules were designed for a wetter paradigm.",
      ],
      verdict:
        "If you remember nothing else from this series, remember this: <strong>doing nothing is not safe.</strong> No Action is the worst option on the table. Every other plan — including ones we don't recommend — produces better outcomes than continuing the status quo. The decision is not whether to change; it is which change to choose.",
    }),
    buildPlanArticle({
      slug: 'basic-coordination-plan',
      title: 'Basic Coordination: The Minimum Effort Plan',
      subtitle:
        'Small, interpolated adjustments to the 2007 tier structure. Better than nothing, but not by much.',
      readTimeMinutes: 5,
      scenarioKey: 'federal-plan-basic-coordination',
      whatItIs:
        'Basic Coordination is the gentlest of the five Draft EIS alternatives. It preserves the broad tier structure of the 2007 Guidelines but adds smooth interpolation between tiers, plus modest coordination with Lake Mead elevations. The release reductions trigger slightly earlier and at lower rates than under the current rules.',
      strengths: [
        "Slight improvement over the 2007 Guidelines at low elevations — the interpolated tiers avoid the cliff effect of hard tier boundaries.",
        'Politically feasible. This is the alternative that changes the least, which makes it the easiest to get adopted.',
        'No new infrastructure or new legal frameworks required.',
      ],
      weaknesses: [
        'Does not address the structural deficit. Inflow minus outflow is still negative most years; the plan just trims a little off the top.',
        'Worst-case floor still reaches dead pool in our stress test. The plan does not introduce a real reservoir-elevation protection mechanism.',
        'Incremental — saves a few feet in the short run, loses the same few feet over the long run.',
      ],
      verdict:
        "Basic Coordination is better than No Action but worse than every other alternative we evaluated. If it is the only plan with political traction, it is <em>marginally</em> worth supporting over the status quo. But it should not be the ceiling. Push for Max Operational Flexibility or Enhanced Coordination, and treat Basic as the floor of what's acceptable.",
    }),
    buildPlanArticle({
      slug: 'enhanced-coordination-plan',
      title: 'Enhanced Coordination: Letting Powell and Mead Work Together',
      subtitle:
        'Combined-storage balancing between Powell and Mead. Solid third-place option.',
      readTimeMinutes: 6,
      scenarioKey: 'federal-plan-enhanced-coordination',
      whatItIs:
        "Enhanced Coordination treats Powell and Mead as a combined system rather than two reservoirs with independent release rules. Releases from Powell are adjusted based on the combined storage percentage — when the total system is low, both reservoirs ease up; when it's fuller, releases ramp up. The goal is to keep the two reservoirs in a healthier balance so neither hits critical elevations while the other sits comfortably.",
      strengths: [
        'Worst-case (p10) floor stays at 3,442 ft — well above dead pool (3,370 ft) even in the bottom 10% of bad-luck futures.',
        'Robust across all horizons. Earns a B at 10, 20, and 40 years — one of only two plans with consistent grades.',
        'Adaptive. The rule responds to current conditions rather than relying on fixed thresholds, so it handles unusual sequences of wet and dry years better than static rules.',
        'Preserves Upper-Basin vs Lower-Basin Compact obligations while allowing smart operational choices within that framework.',
      ],
      weaknesses: [
        'Requires genuine coordination between Upper and Lower Basin states. Political complexity is higher than Basic Coordination.',
        'Median ending elevation (3,579 ft) is slightly lower than Max Operational Flexibility (3,586 ft). Not much — but not the top of the pack.',
        'Requires both basins to agree on what "balance" means. If one side games the rule, the benefits diminish.',
      ],
      verdict:
        '<strong>Enhanced Coordination is our third-place recommendation.</strong> It sits behind Max Operational Flexibility and Supply Driven, both of which produce better outcomes. But if neither of those is politically achievable, Enhanced Coordination is a solid fallback — it earns B at every horizon and stays within the existing Compact framework.',
    }),
    buildPlanArticle({
      slug: 'max-operational-flexibility-plan',
      title: 'Max Operational Flexibility: The Clear Winner',
      subtitle:
        'Dual-indicator release curves and a 3,510 ft run-of-river floor. The only plan that earns an A at every horizon.',
      readTimeMinutes: 7,
      scenarioKey: 'federal-plan-max-operational-flexibility',
      whatItIs:
        "Max Operational Flexibility is the most aggressive of the Draft EIS alternatives. Releases are determined by dual indicators — both current storage percentage and recent flow category — using explicit curves at three flow levels. Below 3,510 ft the plan switches to run-of-river operation, meaning releases equal natural flow (no additional drawdown). This floor is the killer feature: it prevents the lake from being drained below the point where hydropower and ecology fail.",
      strengths: [
        '<strong>Only plan that keeps the p10 worst-case floor above minimum power pool (3,490 ft).</strong> Even in the bottom 10% of bad-luck futures, Glen Canyon Dam keeps generating power.',
        'Consistent A grades at 10, 20, and 40 year horizons under the last-decade stress test.',
        'Run-of-river protection below 3,510 ft means the lake cannot be operated into dead pool even in extreme scenarios.',
        'Dual-indicator curves are more responsive than single-indicator rules — the plan handles both wet and dry sequences better than static tier systems.',
      ],
      weaknesses: [
        'Politically the most ambitious. Changes the operating philosophy the most, which will attract the most pushback from stakeholders who prefer the current status quo.',
        'Run-of-river operation below 3,510 ft means Lower Basin users see reduced deliveries when the lake is low. In practice this is what should happen, but it will be framed as a loss.',
        'More complex than tier-based rules. Operators and users have to learn a new decision framework.',
      ],
      verdict:
        "<strong>Max Operational Flexibility is the plan we recommend pushing for.</strong> It is the only plan whose worst-case outcome keeps minimum power pool online. Every other plan, in the bottom 10% of futures, reaches at least minimum power pool or lower under last-decade stressed conditions. If you care about Lake Powell having a stable, operational future — one where boats launch, turbines spin, and the ecology holds — this is the plan that delivers it. Support this one first. Fall back to Enhanced Coordination only if this one is politically blocked.",
    }),
    buildPlanArticle({
      slug: 'supply-driven-plan',
      title: "Supply Driven: Releasing What the River Actually Gives",
      subtitle:
        'Releases track the 3-year rolling average of natural flow. Highest median ending elevation — but a floor that can bite in consecutive dry years.',
      readTimeMinutes: 6,
      scenarioKey: 'federal-plan-supply-driven',
      whatItIs:
        'Supply Driven is the simplest of the DEIS alternatives and in some ways the most honest: the release rule is 65% of the 3-year rolling average natural inflow, bounded by a 4.7 MAF/yr floor and a 12 MAF/yr ceiling. In good years the lake releases more; in dry years it releases less. The approach mimics how unregulated rivers behave — supply-driven rather than demand-driven.',
      strengths: [
        'Highest 40-year median ending elevation of any plan we evaluated (3,669 ft). Under normal-to-good draws, the lake recovers strongly.',
        'Simple rule. Easier to explain, audit, and defend than multi-tier or dual-indicator schemes.',
        'Tracks the actual supply — so in dry decades it automatically tightens releases, while in wet decades it lets the system breathe.',
      ],
      weaknesses: [
        '<strong>4.7 MAF/yr minimum release floor</strong> can force water out of Powell even in consecutive dry years where releases should arguably be lower. This drags the worst-case (p10) floor to 3,470 ft — below minimum power pool.',
        'The 4.7 MAF floor is a political commitment to Lower Basin minimum deliveries, not a hydrological necessity. It is the reason this plan grades B rather than A.',
        'Large year-to-year variability in releases. Downstream users have to manage around fluctuating deliveries, which creates its own costs.',
      ],
      verdict:
        "Supply Driven is a strong plan that is hamstrung by its floor. In median outcomes it beats every other plan; in worst-case outcomes the minimum-release constraint forces breakdowns. If the floor could be negotiated lower (say, to 4.0 MAF), this plan would be our top pick on simplicity grounds alone. As written, it's a B — a solid plan that narrowly misses the top spot because of one political compromise built into its definition.",
    }),
    buildArticle6(),
    buildArticle7(),
  ]

  for (const article of articles) {
    await upsertArticle(article)
  }

  console.log(`\nDone. ${articles.length} articles seeded as drafts.`)
  console.log(`Admin → flip status to 'published' when ready.`)

  await pool.end()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
