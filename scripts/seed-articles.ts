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
    note: 'Strongest worst-case protection — floor holds closest to the Oct 1, 2026 baseline',
    noteTone: 'good',
  },
  'federal-plan-supply-driven': {
    label: 'Supply Driven',
    slug: 'supply-driven-plan',
    emphasis: true,
    note: 'Best recovery — highest median elevation at every long horizon',
    noteTone: 'good',
  },
  'federal-plan-enhanced-coordination': {
    label: 'Enhanced Coordination',
    slug: 'enhanced-coordination-plan',
    note: 'Balanced fallback — middling on every axis, no major weakness',
    noteTone: 'neutral',
  },
  'federal-plan-basic-coordination': {
    label: 'Basic Coordination',
    slug: 'basic-coordination-plan',
    note: 'Not recommended — median stays below min power; floor reaches dead pool',
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
  // A threshold lowered to 3470 — within ~10 ft of the Oct 1, 2026 baseline
  // (3479.6) counts as "holds the line" in a drought year. Previously this
  // was 3490 (min power pool), which was unreachable by construction once
  // the federal plan had dropped Powell below min power.
  if (lowestP10 >= 3470) return 'A'
  if (lowestP10 >= 3430) return 'B'
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
// Bad-case Ending: p10 ending elevation at 40yr — where the lake actually
// lands in the worst 10% of futures. Differs from Floor (the lowest point
// reached at any time during the simulation). A plan can dip low early
// and recover by 40yr: its Floor is low but its Ending is high.
function gradeBadCaseEnd(p10End: number): AxisGrade {
  if (p10End >= 3580) return 'A'
  if (p10End >= 3500) return 'B'
  if (p10End >= 3430) return 'C'
  if (p10End > 3370) return 'D'
  return 'F'
}

const GRADE_STYLE: Record<AxisGrade, string> = {
  A: 'background:#d1fae5; color:#065f46;',
  B: 'background:#dbeafe; color:#1e40af;',
  C: 'background:#fef3c7; color:#92400e;',
  D: 'background:#f3f4f6; color:#374151;',
  F: 'background:#fee2e2; color:#991b1b;',
}

// Overall grade supports +/- modifiers so the profile differences between
// plans that would otherwise tie on letter grade can be surfaced (e.g.,
// MOF = A, SD = A- — same letter, different floor profile).
type OverallGrade =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'D-'
  | 'F'

function gradeBaseLetter(g: AxisGrade | OverallGrade): AxisGrade {
  return g.charAt(0) as AxisGrade
}

function gradePill(g: AxisGrade | OverallGrade): string {
  const style = GRADE_STYLE[gradeBaseLetter(g)]
  return `<span style="display:inline-block; padding:0.15rem 0.7rem; border-radius:9999px; font-weight:600; font-size:0.85rem; ${style}">${g}</span>`
}

// Weighted GPA across the four visible axes. Floor is weighted 2× because
// worst-case safety has asymmetric consequences (dead pool, lost power,
// marinas closed) that recovery can't undo. Speed / Recovery / Bad-case
// End are each weighted 1×. Produces a +/- letter so plans whose profiles
// differ can be distinguished even when they round to the same base.
function computeOverallGrade(
  recovery: AxisGrade,
  floor: AxisGrade,
  badCaseEnd: AxisGrade,
  speed: AxisGrade
): OverallGrade {
  const points: Record<AxisGrade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }
  const weighted =
    points[recovery] * 1 +
    points[floor] * 2 +
    points[badCaseEnd] * 1 +
    points[speed] * 1
  const gpa = weighted / 5

  // Tuned to conventional GPA letter bands so a 3 B's + 1 A profile lands
  // at B+ (not A-). MOF and SD both sit at 3.6 → A; Enhanced at 3.2 → B+.
  if (gpa >= 3.85) return 'A+'
  if (gpa >= 3.5) return 'A'
  if (gpa >= 3.3) return 'A-'
  if (gpa >= 3.0) return 'B+'
  if (gpa >= 2.7) return 'B'
  if (gpa >= 2.3) return 'B-'
  if (gpa >= 2.0) return 'C+'
  if (gpa >= 1.7) return 'C'
  if (gpa >= 1.3) return 'C-'
  if (gpa >= 1.1) return 'D+'
  if (gpa >= 0.7) return 'D'
  if (gpa > 0) return 'D-'
  return 'F'
}

interface PlanRow {
  key: string
  meta: PlanMeta
  recovery: { grade: AxisGrade; medianEnd: number }
  floor: { grade: AxisGrade; lowestP10: number }
  badCaseEnd: { grade: AxisGrade; p10End: number }
  safety: { grade: AxisGrade; stayAboveMinPower: number }
  speed: { grade: AxisGrade; gain10yr: number }
  overallGrade: OverallGrade
}

function buildPlanRow(scenario: any): PlanRow | null {
  const meta = PLAN_META[scenario.key]
  if (!meta) return null
  const h40 = scenario.horizons.find((h: any) => h.years === 40)
  const h10 = scenario.horizons.find((h: any) => h.years === 10)
  if (!h40 || !h10) return null
  const recoveryGrade = gradeRecovery(h40.medianEnd)
  const floorGrade = gradeFloor(h40.lowestP10)
  const badCaseEndGrade = gradeBadCaseEnd(h40.p10End)
  const speedGrade = gradeSpeed(h10.gain)
  return {
    key: scenario.key,
    meta,
    recovery: { grade: recoveryGrade, medianEnd: h40.medianEnd },
    floor: { grade: floorGrade, lowestP10: h40.lowestP10 },
    badCaseEnd: { grade: badCaseEndGrade, p10End: h40.p10End },
    safety: { grade: gradeSafety(h40.stayAboveMinPower), stayAboveMinPower: h40.stayAboveMinPower },
    speed: { grade: speedGrade, gain10yr: h10.gain },
    overallGrade: computeOverallGrade(recoveryGrade, floorGrade, badCaseEndGrade, speedGrade),
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
          th('Floor', 'worst-case low point'),
          th('Bad-case End', '40yr p10 ending'),
          th('Speed', '10yr gain'),
          th('Overall'),
        ].join('')
      : [
          th('Plan', undefined, 'left'),
          th('Recovery', 'fills the lake'),
          th('Floor', 'worst-case low'),
          th('Bad-case End', 'bad-luck ending'),
          th('Speed', '10yr gain'),
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
        `<td style="padding:0.6rem 0.75rem; text-align:left;">${planNameCell(r)}</td>` +
        cell(r.recovery.grade, `${r.recovery.medianEnd.toFixed(0)} ft`) +
        cell(r.floor.grade, `${r.floor.lowestP10.toFixed(0)} ft`) +
        cell(r.badCaseEnd.grade, `${r.badCaseEnd.p10End.toFixed(0)} ft`) +
        cell(
          r.speed.grade,
          `${r.speed.gain10yr >= 0 ? '+' : ''}${r.speed.gain10yr.toFixed(0)} ft`
        ) +
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
<p><strong>If we had released just 5% less water each year since 1996, Lake Powell would sit about ${Math.round(diff95)} feet higher today.</strong></p>

<p>This is not a climate claim. It is not a drought claim. It is not a guess about the future. It is plain math. We can do it using the Bureau of Reclamation's own daily numbers. Every drop that left Glen Canyon Dam is on the books. Every drop that came in is too. The math is right there. We just have not been doing it.</p>

<p>This article asks one question: <em>how much of Lake Powell's low level is drought, and how much is math we skipped?</em></p>

<h2>The receipts</h2>

<p>On January 1, 1996, Lake Powell stood at ${COUNTERFACTUALS.actualStart.elevation.toFixed(0)} ft. That is about ${actualDrop.toFixed(0)} feet higher than today. The lake was close to full. Since then, it has dropped by that same ${actualDrop.toFixed(0)} feet.</p>

<p>We can replay those 30 years using the same inflows that really happened. The only change: release a bit less water each day. Less out means more stays in. The lake rises. Here is what it would look like under tighter rules:</p>

[[chart:counterfactual]]

<ul>
<li><strong>5% less released:</strong> Lake would be <strong>${Math.round(diff95)} feet higher</strong> today (${scenarios.find((s) => s.outflowPercent === 95)!.endingElevation.toFixed(0)} ft).</li>
<li><strong>10% less released:</strong> <strong>${Math.round(diff90)} feet higher</strong> (${scenarios.find((s) => s.outflowPercent === 90)!.endingElevation.toFixed(0)} ft).</li>
<li><strong>15% less released:</strong> <strong>${Math.round(diff85)} feet higher</strong> (${scenarios.find((s) => s.outflowPercent === 85)!.endingElevation.toFixed(0)} ft) — almost back to 1996 levels.</li>
</ul>

<p>The black line shows what really happened. The colored lines show what-if scenarios. Same water in. Less water out.</p>

<p style="font-size:0.9rem;"><a href="/simulator?tab=historical&amp;start=1996-01-01&amp;mode=percentage&amp;pct=95" style="color:#0d7377; font-weight:500;">Try the 5% less since 1996 scenario in the simulator →</a></p>

<h2>"But the drought did it"</h2>

<p>Look at the next chart. It shows each water year since 1996 as two bars. One bar is water in. The other is water out.</p>

[[chart:inflowVsOutflow]]

<p>In most years, more water went out than came in. People call this the "gap" — or the structural deficit. But it is also a choice. In wet years, we released more. In dry years, we still released a lot. Over 30 years, the gap adds up over time. And that does not count the water that evaporates.</p>

<h2>The evaporation gap</h2>

<p>Lake Powell loses about <strong>500,000 to 600,000 acre-feet a year to evaporation</strong>. That is a whole reservoir every decade or two, gone into the air.</p>

<p>Evaporation is not on the outflow books. It does not count against any state's share. It just disappears. Thirty years of it adds up to about ${((550_000 * 30) / 1_000_000).toFixed(0)} MAF. That is close to the <em>full size</em> of Lake Powell.</p>

<p>If the operating rules pretend evaporation is not real, the lake will slowly drain any time inflow is less than outflow. That is exactly what we have watched happen.</p>

<h2>What this means</h2>

<p>The post-2026 operating rules are on the table right now. This site lays out the choices in plain numbers:</p>

<ul>
<li>How each plan does under the <em>driest decade on record</em>, so no one can say "your model is too rosy."</li>
<li>What each one looks like over 10, 20, and 40 years.</li>
<li>How the Colorado River Abundance Act fits in as we build new water projects.</li>
<li>Which plans are worth pushing for, and why.</li>
</ul>

<h2>How the plans score</h2>

<p>Here is the timeline you need to keep straight:</p>

<ul>
<li><strong>Now through Sep 30, 2026:</strong> the short-term federal plan is running. Powell releases are cut. A little water is moved in from Flaming Gorge. This is a bridge, not the fix.</li>
<li><strong>Oct 1, 2026 and on:</strong> a new long-term rule takes over. The states and feds are picking that rule right now. Every plan on this site is a candidate for that long-term slot.</li>
</ul>

<p>The chart below shows how each candidate long-term plan does over the 40 years that follow. The starting point is Oct 1, 2026 — Lake Powell at the level the short-term plan leaves it. <strong>Click any plan for the full breakdown.</strong></p>

${buildScorecardGrid({ scenarios: SCORECARDS.scenarios, variant: 'preview' })}

<p style="font-size:0.85rem; color:#6b7280; font-style:italic; margin-top:-0.5rem;">A single "overall" grade hides real trade-offs. Max Operational Flexibility wins on <strong>Floor</strong> (the lowest point reached). Supply Driven wins on <strong>Recovery</strong>, <strong>Bad-case End</strong>, and <strong>Speed</strong>. The full head-to-head breaks it apart.</p>

<p><a href="/articles/plans-head-to-head" style="color:#0d7377; font-weight:500;">Full side-by-side analysis, with all four axes and speed of recovery →</a></p>

<p>The case in every one of these articles starts here: <strong>we have enough water. We just need to manage it like the water matters.</strong></p>

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
<p><em>Imagine if, starting in 1996, we had released just 5% less water each year. Lake Powell would be about 97 feet higher today. (<a href="/articles/real-problem-isnt-drought-its-math">Read the math →</a>)</em></p>

<p><strong>That is what's possible. This article asks which post-2026 plan on the table gets us closest.</strong></p>

<p>We ran the five federal plans and the current 2007 Guidelines through the same stress test. We sampled inflows from the <em>last ten years</em> — the driest decade on record. Each plan ran 2,000 times over 40 years. The starting point is Lake Powell on <strong>October 1, 2026</strong>. That is the end of the reduced-release window. By then, the states and feds will have picked a long-term operating rule, and the new plan takes over. The April 2026 federal plan may keep sending Flaming Gorge water past Sep 30, but that is not certain. So the long-run test starts from the Sep 30 mark. Everything stays the same except the operating rule.</p>

<p>Here is what each plan produced.</p>

[[chart:plansOverlay]]

<h2>The full scorecard — four axes, and the winner depends on what you value</h2>

<p>These numbers look 40 years out, under the driest inflows on record. The one-letter "overall" grade is handy shorthand. But it hides the real story. Different plans win on different axes. <strong>Click any plan name for its full article.</strong></p>

${buildScorecardGrid({ scenarios: SCORECARDS.scenarios, variant: 'full' })}

<h3>Reading the grid</h3>

<ul>
<li><strong>Recovery</strong> — median ending elevation at 40 years. How full does the lake get? <em>Supply Driven wins</em> at ${supplyH40.medianEnd} ft.</li>
<li><strong>Floor</strong> — the single lowest point hit in the worst 10% of futures. It can be brief. How bad can it get at any moment? <em>Max Operational Flexibility wins</em> at ${winnerH40.lowestP10} ft. That is only ${Math.round(SCORECARDS.startElevation - winnerH40.lowestP10)} ft below the Oct 1, 2026 start. Every other plan dips ${Math.round(SCORECARDS.startElevation - supplyH40.lowestP10)}+ ft further in bad luck.</li>
<li><strong>Bad-case End</strong> — where the lake <em>ends up</em> at year 40 in the worst 10% of futures. This is different from Floor. A plan can dip low early and climb back by the end. <em>Supply Driven wins</em> at ${supplyH40.p10End.toFixed(0)} ft. In the bad-luck case, SD still ends above MOF's bad-case end of ${winnerH40.p10End.toFixed(0)} ft. SD's low dip is brief; MOF's bad case stays flatter.</li>
<li><strong>Speed</strong> — median elevation gain in the first 10 years. Near-term climb from the Oct 1, 2026 start. <em>SD wins</em> at +${getH(supply, 10).gain} ft, just ahead of MOF at +${getH(maxFlex, 10).gain} ft.</li>
</ul>

<p>No plan wins every axis. MOF and SD split the top spots. MOF takes Floor. SD takes Recovery and Speed. At 40 years, SD's median is ${Math.round(supplyH40.medianEnd - winnerH40.medianEnd)} ft higher. MOF's floor is ${Math.round(winnerH40.lowestP10 - supplyH40.lowestP10)} ft higher. Both are real outcomes. The grid lets you weigh them side by side, not squished into one grade.</p>

<p style="font-size:0.9rem; color:#6b7280; font-style:italic;">Note on grades: the Monte Carlo starts on Oct 1, 2026 — the end of the federal reduced-release window — with Powell at about ${SCORECARDS.startElevation.toFixed(0)} ft. The Overall grade is a weighted GPA of the four axes with <strong>Floor counted 2×</strong>. Worst-case outcomes (dead pool, lost power, closed marinas) have lasting costs that recovery can't undo, so they weigh more. MOF (A on Floor and Speed) and Supply Driven (A on Recovery, Bad-case End, and Speed) both earn A Overall through different paths. MOF holds the line in bad luck. SD climbs highest in typical years.</p>

<h2>Which plan wins depends on what you value</h2>

<p>Three plans are in real contention. They win on different axes of the grid. So picking between them is a question of priorities, not rank. Here is how to choose.</p>

<h3>If you prioritize worst-case safety — Max Operational Flexibility</h3>

<p>We start from the post-Phase-1 line of ${SCORECARDS.startElevation.toFixed(0)} ft. MOF is the plan whose worst-case floor <strong>holds closest to that line</strong>: ${winnerH40.lowestP10} ft. That is only ${Math.round(SCORECARDS.startElevation - winnerH40.lowestP10)} ft below where the federal plan leaves us. Every other plan's worst 10% dips ${Math.round(SCORECARDS.startElevation - supplyH40.lowestP10)}+ feet further. Supply Driven's worst case reaches ${supplyH40.lowestP10} ft. Enhanced Coordination hits ${enhancedH40.lowestP10} ft. In plain terms: in a bad-luck decade, MOF is the plan least likely to make the drought much worse.</p>

<p><strong>Pick MOF if your top concern is:</strong> "don't let the lake drop further than it already has."</p>

<p><a href="/articles/max-operational-flexibility-plan">Full scorecard for Max Operational Flexibility →</a></p>

<h3>If you prioritize filling the lake — Supply Driven</h3>

<p>SD has the highest median elevation at every long year mark. At 40 years, it reaches <strong>${supplyH40.medianEnd} ft</strong>. That is a gain of about ${Math.round(supplyH40.medianEnd - SCORECARDS.startElevation)} feet from the post-Phase-1 start. That is near Hite territory. For anyone who cares how the lake looks on a summer weekend, this plan comes closest to "full." The tradeoff shows up in the grid. SD's worst-case floor (${supplyH40.lowestP10} ft) is ${Math.round(winnerH40.lowestP10 - supplyH40.lowestP10)} ft lower than MOF's. SD trades more downside risk for more upside.</p>

<p><strong>Pick SD if your top concern is:</strong> "get the lake as high as possible over the long run, and accept more worst-case exposure to get there."</p>

<p><a href="/articles/supply-driven-plan">Full scorecard for Supply Driven →</a></p>

<h3>If you want a balanced fallback — Enhanced Coordination</h3>

<p>Enhanced lands in the middle of the grid. It has a fair median (${enhancedH40.medianEnd} ft) and a moderate floor (${enhancedH40.lowestP10} ft), but does not lead on either axis. It stays inside the current Compact framework and avoids the worst outcomes. If neither MOF nor SD can pass politically, Enhanced is the safe pick.</p>

<p><a href="/articles/enhanced-coordination-plan">Full scorecard for Enhanced Coordination →</a></p>

<h2>Plans that don't meet the math</h2>

<p>Three plans on the table don't clear the bar. Not on feelings — just on numbers.</p>

<ul>
<li><strong>2007 Guidelines (status quo)</strong> — 40-year median of ${currentOpsH40.medianEnd} ft. That is below minimum power pool. Floor reaches dead pool (3,370 ft) in the worst 10% of futures. The core shortfall does not change.</li>
<li><strong>Basic Coordination</strong> — a small bump above the status quo. 40-year median of ${getH(basic, 40).medianEnd} ft, still below min power. Floor reaches dead pool.</li>
<li><strong>No Action</strong> — the lowest median of any plan (${noActionH40.medianEnd} ft). Floor reaches dead pool. The weakest option on the table.</li>
</ul>

<p>These are not knocks; they are what the math shows. If any of these wins, Powell's worst-case path runs into dead pool over the 40-year stress test.</p>

<p><a href="/articles/no-action-plan">More on the No Action plan →</a></p>

<h2>Where the Abundance Act fits</h2>

<p>The Colorado River Abundance Act does not compete with the operating-rule plans. <em>It stacks on top of them.</em> Augmentation is new water delivered to Lake Mead. That means Powell does not have to release as much downstream. More water stays in Powell.</p>

[[chart:augmentation]]

<p>Three things stand out in this chart.</p>

<ol>
<li><strong>Augmentation takes 15-20 years to kick in.</strong> Phase 1 comes online around 2045. Full buildout is 2055+. In the first decade, the path barely moves.</li>
<li><strong>Long-run, the lift is large.</strong> 2007 Guidelines + Full buildout lifts the 40-year median from ${currentOpsH40.medianEnd} ft to ${getH(augFull, 40).medianEnd} ft. That is close to what Max Op Flex alone gives us, but by <em>adding</em> water rather than <em>managing</em> less.</li>
<li><strong>Augmentation alone cannot fix the worst case.</strong> Even with full buildout, the bad-luck 10% floor of the combined plan still hits dead pool. The new water is not online yet when back-to-back dry years hit.</li>
</ol>

<p>The right mix is both: <strong>adopt Max Operational Flexibility (or Enhanced Coordination) for post-2026 operations, and back the Abundance Act for long-run capacity.</strong> Short-run, the operating rule protects the lake. Long-run, added water keeps us ahead as demand grows.</p>

<p><a href="/articles/colorado-river-abundance-act">Full scorecard for the Abundance Act →</a></p>

<h2>The bottom line</h2>

<p>We built this site to make the post-2026 choice clear to the people who actually use Lake Powell. The math is plain: <strong>two plans stand out for different reasons, and the status quo is not one of them.</strong></p>

<p>If you prioritize worst-case safety, push for <strong>Max Operational Flexibility</strong>. If you prioritize filling the lake, push for <strong>Supply Driven</strong>. If neither can pass politically, <strong>Enhanced Coordination</strong> is the safe fallback that still avoids the worst outcomes. Anything below those three runs Powell into dead pool in the worst 10% of futures.</p>

<p><em>Every number in this article comes from Monte Carlo runs you can redo on this site's <a href="/simulator">simulator</a>. Sources and methods are listed on the <a href="/about">About page</a>.</em></p>
`.trim()

  return {
    slug: 'plans-head-to-head',
    title: 'The Head-to-Head: Which Post-2026 Plan Actually Wins?',
    subtitle: `Two plans stand out for different reasons — Max Operational Flexibility for worst-case protection, Supply Driven for lake recovery. Which to pick depends on what you value.`,
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
    title: `${input.title}: 40-year path under the last-10-years stress test`,
    data: chartData,
    series: [
      { dataKey: 'p50', color: '#0d7377', name: 'Median (p50)' },
      { dataKey: 'p10', color: '#c99a7a', name: 'Worst 10% (p10)' },
    ],
    xKey: 'year',
    xType: 'number',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'Lake Powell elevation under the driest decade on record. The median line shows the most likely path. The worst-10% line shows the bottom 10% of bad-luck futures.',
  }

  const bodyHtml = `
<p>${input.whatItIs}</p>

[[chart:projection]]

<h2>The scorecard</h2>

<p>We tested this plan the same way we test every plan. We used inflows from the <em>last ten years</em> — the driest decade on record. We ran 2,000 Monte Carlo trials for 40 years. The starting point and inflows stay the same. Only the operating rule changes.</p>

<div style="overflow-x:auto; margin: 1.5rem 0;">
<table style="width:100%; border-collapse:collapse; font-size:0.95rem;">
<thead>
<tr style="border-bottom:2px solid #e5e7eb; text-align:left;">
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Year mark</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Median ending</th>
<th style="padding:0.75rem 1rem; font-weight:500; color:#374151;">Worst 10% floor</th>
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

<p><em>See all plans side by side in the <a href="/articles/plans-head-to-head">head-to-head verdict</a>, or read about why <a href="/articles/real-problem-isnt-drought-its-math">the real problem isn't drought — it's math</a>.</em></p>
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
    title: 'Median elevation with and without Abundance Act new water',
    data: chartData,
    series: [
      { dataKey: 'baseline', color: '#111827', name: '2007 Guidelines (no new water)' },
      { dataKey: 'phase1', color: '#0284c7', name: '+ Phase 1 (2 MAF/yr by 2045)' },
      { dataKey: 'realistic', color: '#7c3aed', name: '+ Realistic (3 MAF/yr by 2065)' },
      { dataKey: 'full', color: '#d4a574', name: '+ Full buildout (7 MAF/yr by 2055)' },
    ],
    xKey: 'year',
    xType: 'number',
    yLabel: 'Elevation (ft)',
    referenceLines: STANDARD_REF_LINES,
    caption:
      'New water flows into Mead and the Lower Basin. That cuts the releases Powell has to make. All three cases use the 2007 Guidelines as the operating rule.',
  }

  const fullH40 = getH(full, 40)
  const realisticH40 = getH(realistic, 40)
  const phase1H40 = getH(phase1, 40)
  const baselineH40 = getH(currentOps, 40)

  const bodyHtml = `
<p>The Blue Ribbon Coalition proposed the Colorado River Abundance Act in late 2026. It is not a plan to change the rules for releasing water. It is a plan to build new water supply. The idea is simple. Build desalination plants that turn ocean water into drinking water. Pipe that water into the Colorado River system. Deliver 2 to 7 million acre-feet each year to Lake Mead or Lower Basin users. That new water replaces some of what Powell has to release. So Powell stays higher. Same lake. More water. Fewer releases needed.</p>

<p>This is the long-term partner to rule reform. Post-2026 rules change <em>how</em> we release the water we have. The Abundance Act changes <em>how much water the system has</em>.</p>

<h2>What the Act proposes</h2>

<p>The Act sets up a Colorado River project to add new water in three stages. It also covers funding, public-private partnerships, and faster permits to speed up building:</p>

<ul>
<li><strong>Phase 1 (2 MAF/yr):</strong> The first plants come into service by 2045. They deliver 2 million acre-feet per year. This matches the size of Israel's entire desalination fleet.</li>
<li><strong>Realistic buildout (3 MAF/yr):</strong> A step-by-step expansion through 2065. This is enough to close the Lower Basin's yearly shortfall.</li>
<li><strong>Full buildout (7 MAF/yr):</strong> The full vision. 7 MAF/yr in service by 2055. That is about 10-13% of today's global desalination capacity. All on one coast.</li>
</ul>

<p>Our simulator adds each level on top of whatever operating rule the user picks. For the scorecards below, we used the current <strong>2007 Guidelines</strong> as the rule baseline. That way we can see the effect of the new water on its own.</p>

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

<h3>1. In the first decade, new water does almost nothing.</h3>

<p>The 10-year medians are barely different from the baseline (${baselineH40.medianEnd - getH(currentOps, 10).medianEnd < 0 ? 'difference <1 ft' : 'identical within noise'}). The model is not broken. This is the timeline. The first plants do not come into service until 2045 at the earliest. Before then, the Act gives the system nothing new. This is the honest cost of big, slow projects.</p>

<h3>2. By 20 years, the effect starts to show.</h3>

<p>Phase 1 adds <strong>${(getH(phase1, 20).medianEnd - getH(currentOps, 20).medianEnd).toFixed(0)} ft</strong> to the 20-year median. Realistic adds <strong>${(getH(realistic, 20).medianEnd - getH(currentOps, 20).medianEnd).toFixed(0)} ft</strong>. Full adds <strong>${(getH(full, 20).medianEnd - getH(currentOps, 20).medianEnd).toFixed(0)} ft</strong>. Not huge yet. But the line is bending up.</p>

<h3>3. By 40 years, the effect is large.</h3>

<p>Full buildout lifts the 40-year median from ${baselineH40.medianEnd} ft to <strong>${fullH40.medianEnd} ft</strong>. That is about ${(fullH40.medianEnd - baselineH40.medianEnd).toFixed(0)} feet of added elevation. All of it comes from making new water. Even the Realistic case adds ~${(realisticH40.medianEnd - baselineH40.medianEnd).toFixed(0)} feet. This is the case for new water as long-term insurance against rising demand.</p>

<h3>4. The worst-case floor is still dead pool.</h3>

<p>Every new-water scenario's worst 10% case still hits 3,370 ft (dead pool). Why? Because it takes 15-20 years to build these plants. In the worst 10% of futures — long runs of dry years starting soon — the lake can reach dead pool <em>before</em> the new plants deliver any water. New water is a long-run lift. It is not a short-run rescue.</p>

<h2>Strengths</h2>

<ul>
<li><strong>Works with any operating rule.</strong> New water stacks on top of the 2007 Guidelines, any DEIS option, or whatever comes next. No conflict with other reform.</li>
<li><strong>Grows with demand.</strong> The Southwest's population keeps growing. Every other plan divides a shrinking pie. This plan builds a bigger pie.</li>
<li><strong>Protects Compact and Treaty deals.</strong> The Act is clear that this new water is extra. It does not change Mexico's Treaty share. It does not shift duties between the Upper and Lower Basins.</li>
<li><strong>Long-run elevation lift is real.</strong> 40-year medians above 3,600 ft in the Realistic and Full cases, even with last-decade stressed inflows.</li>
</ul>

<h2>Weaknesses</h2>

<ul>
<li><strong>Timeline.</strong> The first plants come into service around 2045. The Carlsbad desal plant (50,000 AF/yr) took about 15 years from idea to operation. 7 MAF/yr is about 140 Carlsbads worth of plants. No coast has ever built at that scale.</li>
<li><strong>Cost.</strong> New water runs about $2,500 to $4,500 per acre-foot delivered to Lake Mead or Powell. Today's Colorado River water costs about $270/AF. The cost is worth it if the other choice is an empty reservoir. But the gap is real.</li>
<li><strong>Energy use.</strong> Full buildout at 7 MAF/yr would need 42 to 63 TWh/yr. That is 8 to 12% of the Southwest's total power. It is about 50% of Arizona's total power. The Act calls for new renewable plants. Whether we can build them fast enough is an open question.</li>
<li><strong>Cannot save the near term.</strong> For the next 15-20 years, the Act adds nothing to Powell's elevation. Only rule reform can help in that window.</li>
</ul>

<h2>Verdict</h2>

<p>The Abundance Act is a long-term play. And a strong one. It does not compete with rule reform. It partners with it. <strong>The right path is both.</strong> Pick the best operating rule for the post-2026 period. Also support the Abundance Act for long-run infrastructure. The operating rule protects the lake in the near term. New water keeps the system ahead of rising demand in the long term.</p>

<p>If you have to pick one, pick the operating rule. The simulations are clear. New water alone cannot save the worst-case futures. But supporting both is better than picking just one. The Abundance Act is the most hopeful vision on the table for the Southwest's water future. And the math works. With enough time and money, we can build our way to a reservoir that refills.</p>

<hr />

<p><em>Read the <a href="/articles/plans-head-to-head">head-to-head verdict</a> on which operating rule to pair this with, or start from <a href="/articles/real-problem-isnt-drought-its-math">the real problem isn't drought — it's math</a>.</em></p>
`.trim()

  return {
    slug: 'colorado-river-abundance-act',
    title: 'The Colorado River Abundance Act: Long-Term Insurance',
    subtitle:
      'Building new water is the Southwest\'s best long-run play. But it takes 15 to 20 years to come into service. So it cannot rescue the near term.',
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
        'Keep the 2007 Guidelines past their 2026 expiration with no changes. Earns a D at 40 years.',
      readTimeMinutes: 5,
      scenarioKey: 'federal-plan-no-action',
      whatItIs:
        'The No Action plan in the post-2026 Draft EIS is just what it sounds like. Keep using the 2007 rules past their 2026 expiration. No new coordination. No elevation-based tweaks. No new tools. This plan mainly exists as a baseline. It is what happens if Congress and Reclamation fail to agree on anything.',
      strengths: [
        'Simple. No new legal framework. No deal between the basins.',
        'Easy politics. It is easier to block change than to pass change.',
      ],
      weaknesses: [
        'Worst outcome of any plan we tested. Under the last-decade stress test, the median ends near 3,482 ft at 40 years.',
        'Worst 10% floor hits dead pool (3,370 ft). In the bottom 10% of futures, the lake is basically empty.',
        'Ignores what we have learned since 2007. Back then, rules were built for a wetter world.',
      ],
      verdict:
        "If you remember one thing from this series, remember this: <strong>doing nothing is not safe.</strong> No Action is the worst option on the table. Every other plan — even ones we don't recommend — ends up better than the status quo. The choice is not whether to change. The choice is which change to pick.",
    }),
    buildPlanArticle({
      slug: 'basic-coordination-plan',
      title: 'Basic Coordination: The Minimum Effort Plan',
      subtitle:
        'Small tweaks that smooth out the 2007 rules. Better than nothing, but not by much.',
      readTimeMinutes: 5,
      scenarioKey: 'federal-plan-basic-coordination',
      whatItIs:
        'Basic Coordination is the gentlest of the five Draft EIS plans. It keeps the broad 2007 rules. It smooths the jumps between rules so changes are gradual, not sudden. It also adds light coordination with Lake Mead elevations. Release cuts kick in a bit earlier and a bit smaller than under the current rules.',
      strengths: [
        'Small improvement over the 2007 rules at low elevations. Smooth steps avoid the cliff effect of hard boundaries.',
        'Easy politics. This plan changes the least, so it is the easiest to pass.',
        'No new dams or pipes. No new legal framework.',
      ],
      weaknesses: [
        'Does not fix the core problem. Inflow minus outflow is still negative in most years. The plan just trims a little off the top.',
        'The worst 10% floor still reaches dead pool in our stress test. The plan has no real elevation-based safety net.',
        'Earns a D across all year marks. Median ends near 3,530 ft at 40 years.',
      ],
      verdict:
        "Basic Coordination is better than No Action but worse than every other plan we tested. If it is the only plan with political support, it beats the status quo — barely. But it should not be the ceiling. Push for Max Operational Flexibility or Enhanced Coordination. Treat Basic as the floor of what's okay.",
    }),
    buildPlanArticle({
      slug: 'enhanced-coordination-plan',
      title: 'Enhanced Coordination: Letting Powell and Mead Work Together',
      subtitle:
        'Powell and Mead share their storage as one system. A solid third-place option.',
      readTimeMinutes: 6,
      scenarioKey: 'federal-plan-enhanced-coordination',
      whatItIs:
        "Enhanced Coordination treats Powell and Mead as one system, not two separate lakes with their own rules. Releases from Powell go up or down based on the combined storage of both lakes. When the system is low, both lakes ease up. When the system is fuller, releases ramp up. The goal is to keep both lakes healthy at the same time. Neither one should crash while the other sits fine.",
      strengths: [
        'Worst 10% floor stays at 3,468 ft at 40 years — almost 100 ft above dead pool (3,370 ft) even in bad-luck futures.',
        'Strong across all year marks. Earns an A at 10 and 20 years, and a B at 40 years.',
        'Adapts to real conditions. The rule responds to what is happening right now. It handles odd runs of wet and dry years better than fixed rules.',
        'Keeps the 1922 Compact agreement between the Upper and Lower Basin. It just makes smarter choices inside that framework.',
      ],
      weaknesses: [
        'Needs real coordination between Upper and Lower Basin states. The politics are harder than Basic Coordination.',
        'Median ending elevation (3,593 ft) at 40 years is a bit lower than Max Operational Flexibility (3,599 ft). Not by much — but not the top of the pack.',
        'Both basins have to agree on what "balance" means. If one side games the rule, the benefits shrink.',
      ],
      verdict:
        '<strong>Enhanced Coordination is our third-place pick.</strong> It sits behind Max Operational Flexibility and Supply Driven. Both of those do better. But if neither one can pass, Enhanced Coordination is a solid backup. It earns strong grades at every year mark. And it stays inside the 1922 Compact framework we already have.',
    }),
    buildPlanArticle({
      slug: 'max-operational-flexibility-plan',
      title: 'Max Operational Flexibility: The Clear Winner',
      subtitle:
        'Two-signal release curves and a 3,510 ft run-of-river floor. The only plan that earns an A at every year mark.',
      readTimeMinutes: 7,
      scenarioKey: 'federal-plan-max-operational-flexibility',
      whatItIs:
        "Max Operational Flexibility is the boldest of the Draft EIS plans. Releases are set by two signals at once: current storage and recent inflow. The plan uses clear release curves at three flow levels. Below 3,510 ft the plan switches to run-of-river. That means the lake releases only what nature brings in — no extra draw. This floor is the killer feature. It stops the lake from being drained past the point where power and ecology break down.",
      strengths: [
        '<strong>Only plan that keeps the worst 10% floor above the 3,490 ft minimum power pool.</strong> Even in the bottom 10% of futures, Glen Canyon Dam keeps making power.',
        'Earns an A at all three year marks — 10, 20, and 40 years — under the last-decade stress test.',
        'Run-of-river protection below 3,510 ft means the lake cannot be run into dead pool, even in extreme cases.',
        'Two-signal curves respond faster than single-signal rules. The plan handles both wet and dry runs better than fixed-tier rules.',
      ],
      weaknesses: [
        'The boldest politics. It changes the operating mindset the most. That will draw the most pushback from groups that like the current rules.',
        'Run-of-river below 3,510 ft means Lower Basin users get less water when the lake is low. In practice, that is what should happen — but it will be framed as a loss.',
        'More complex than tier rules. Operators and users have to learn a new way to make choices.',
      ],
      verdict:
        "<strong>Max Operational Flexibility is the plan we recommend pushing for.</strong> It is the only plan whose worst case keeps the dam making power. Every other plan drops to the minimum power pool or lower in the bottom 10% of futures. If you want Lake Powell to have a stable, working future — where boats launch, turbines spin, and the ecology holds — this is the plan that delivers. Back this one first. Fall back to Enhanced Coordination only if this plan is blocked.",
    }),
    buildPlanArticle({
      slug: 'supply-driven-plan',
      title: "Supply Driven: Releasing What the River Actually Gives",
      subtitle:
        'Releases follow the 3-year rolling average of natural flow. Highest median ending elevation — but a floor that can bite in back-to-back dry years.',
      readTimeMinutes: 6,
      scenarioKey: 'federal-plan-supply-driven',
      whatItIs:
        'Supply Driven is the simplest of the DEIS plans, and in some ways the most honest. The rule is: release 65% of the 3-year rolling average natural inflow, with a 4.7 MAF/yr floor and a 12 MAF/yr ceiling. In good years the lake lets out more. In dry years it lets out less. This mimics how wild rivers behave — supply-driven, not demand-driven.',
      strengths: [
        'Highest 40-year median ending elevation of any plan we tested (3,678 ft). In normal-to-good years, the lake recovers strongly.',
        'Simple rule. Easier to explain, check, and defend than multi-tier or two-signal plans.',
        'Follows the actual supply. In dry decades it tightens releases on its own. In wet decades it lets the system breathe.',
      ],
      weaknesses: [
        '<strong>The 4.7 MAF/yr minimum release floor</strong> can force water out of Powell in back-to-back dry years when releases should arguably be lower. This drags the worst 10% floor down to 3,433 ft — well below the 3,490 ft minimum power pool.',
        'The 4.7 MAF floor is a political promise to Lower Basin users, not a water-science need. It is the reason this plan only earns a B at 10 years.',
        'Releases swing a lot from year to year. Downstream users have to plan around changing deliveries, which has its own costs.',
      ],
      verdict:
        "Supply Driven is a strong plan that is held back by its floor. In median outcomes it beats every other plan. In worst-case outcomes the minimum-release rule causes breakdowns. If the floor could be set lower (say, to 4.0 MAF), this plan would be our top pick on simplicity alone. As written, it is a clear second — strong at 20 and 40 years, weaker at 10 years because of one political compromise baked into the rule.",
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
