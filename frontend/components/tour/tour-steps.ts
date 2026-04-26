export interface TourStep {
  id: string
  target: string // selector e.g. [data-tour="current-status"]
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * Dashboard tour. Six short steps. The tour lives entirely on the home page —
 * it doesn't navigate, it just spotlights sections and points at the nav at
 * the end so people know Simulator, Ramps, and Articles exist.
 *
 * Each `target` selector is a `data-tour` attribute attached to a wrapper in
 * `frontend/app/page.tsx` (or `MobileNav.tsx` for the nav step). If you
 * rename or remove a section, update the matching `data-tour` attribute.
 * The reference table at the top of `DEMO_SCRIPT.md` mirrors this mapping.
 */
export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '',
    title: 'Welcome to Lake Powell Data',
    body: 'A one-minute tour: today’s water level, the spring projection, the April 2026 federal plan, and the post-2026 plan articles.',
    placement: 'bottom',
  },
  {
    id: 'current-status',
    target: '[data-tour="current-status"]',
    title: 'Current water level',
    body: 'Today’s elevation, storage, daily change, and the closest lake-access points with their margin to the surface — straight from the Bureau of Reclamation feed.',
    placement: 'bottom',
  },
  {
    id: 'chart-and-projections',
    target: '[data-tour="chart-and-projections"]',
    title: 'Elevation chart & spring projection',
    body: 'Elevation over time with selectable ranges (1 month → 40 years). In season, the chart also shows the projected spring low and the snowpack-based refill curve.',
    placement: 'top',
  },
  {
    id: 'volume-impact',
    target: '[data-tour="volume-impact"]',
    title: 'What the April 2026 federal plan does',
    body: 'The day-by-day projection of where Lake Powell lands through April 2027 with the federal plan — release cuts plus Flaming Gorge water — compared to without it. The 2022 Flaming Gorge release is overlaid as a reality check.',
    placement: 'top',
  },
  {
    id: 'featured-articles',
    target: '[data-tour="featured-articles"]',
    title: 'The post-2026 plan series',
    body: 'Long-form breakdowns of each federal plan — what it does, who wins, who loses, and how it scores on recovery, floor, and bad-case ending.',
    placement: 'top',
  },
  {
    id: 'nav',
    target: '[data-tour="main-nav"]',
    title: 'Explore the rest of the site',
    body: 'Use **Simulator** for what-if scenarios, **Lake access** for boat ramps and lake cut-offs, and **Articles** for the full post-2026 series. Resources has History, Storage, Snowpack, Stats, and About.',
    placement: 'bottom',
  },
]
