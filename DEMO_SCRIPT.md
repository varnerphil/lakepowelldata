# Lake Powell Data — Demo Walkthrough Script

A ~5–6 minute walkthrough for video demos. Focused on the three pages people
actually need to see: **Dashboard → Simulator → Articles** (with a brief Ramps
mention). Includes the in-app guided tour as the opener.

---

## Reference table (keep this in sync if anything moves)

If you rename a section or move a component, update both columns and the
matching `data-tour` attribute in the file. The tour reads these selectors at
runtime, so a stale entry = a broken spotlight.

| Demo section            | Page / route             | Component / file                                                       | Tour selector                          |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------- | -------------------------------------- |
| Current water level     | `/`                      | `CurrentStatus` in `frontend/app/page.tsx`                             | `[data-tour="current-status"]`         |
| Chart + spring projection | `/`                    | `HomeChartsWithFavorites` in `frontend/app/page.tsx`                   | `[data-tour="chart-and-projections"]`  |
| Volume-impact tool      | `/` (`#calculator`)      | `Phase1ProjectionSection` (`WaterAdditionCalculator.tsx`)              | `[data-tour="volume-impact"]`          |
| Storage profile         | `/` (`#storage`)         | `StorageVisualization` in `frontend/app/page.tsx`                      | *(not in tour)*                        |
| Snowpack chart          | `/` (`#snowpack`)        | `BasinPlotsChart` in `frontend/app/page.tsx`                           | *(not in tour)*                        |
| Featured articles strip | `/`                      | Second `FeaturedArticlesStrip` in `frontend/app/page.tsx`              | `[data-tour="featured-articles"]`      |
| Top nav                 | All pages                | Desktop nav in `frontend/components/layout/MobileNav.tsx`              | `[data-tour="main-nav"]`               |
| Simulator (Projections) | `/simulator`             | `SimulatorTabs` → `MonteCarloSimulator`                                | —                                      |
| Simulator (Historical)  | `/simulator?tab=historical` | `SimulatorTabs` → `OutflowSimulator`                                | —                                      |
| Boat ramps              | `/ramps`                 | `frontend/app/ramps/page.tsx`                                          | —                                      |
| Articles index          | `/articles`              | `frontend/app/articles/page.tsx`                                       | —                                      |
| Article: start here     | `/articles/real-problem-isnt-drought-its-math` | `frontend/app/articles/[slug]/`                       | —                                      |
| Article: head-to-head   | `/articles/plans-head-to-head` | `frontend/app/articles/[slug]/`                                  | —                                      |

**Tour steps live in:** `frontend/components/tour/tour-steps.ts`. Edit that
file and the `data-tour` attributes above to extend or trim the tour.

**To preview the tour without clearing localStorage:** visit `/?tour=1`.

---

## 0. Cold open (15 sec)

**Screen:** Land on `lakepowelldata.com` — top of the dashboard.

**Say:**
> "This is Lake Powell Data. It's the site I built to make sense of what's
> happening at the lake — the current level, where it's headed, and what the
> federal plans on the table would actually do. Quick tour."

---

## 1. Trigger the in-app tour (60 sec)

**Screen:** In the sticky header at the top of the homepage, click the
**"Tour"** button. (First-time visitors get the offer modal automatically; once
dismissed, the button in `QuickJumpHeader` is the way back in.)

**Say:**
> "The site has a built-in tour — one minute, six steps. Let me run it."

**Click through each step (Next, Next, Next…). Talk over the spotlight as it
moves:**

- **Welcome** — "Just an intro card."
- **Current water level** — "Today's elevation, daily change, closest ramps."
- **Chart & spring projection** — "Range selector goes back 40 years; the
  projection lines appear in season."
- **Volume impact** — "This is the killer feature — pick a federal plan, see
  the lake through April 2027."
- **Featured articles** — "The post-2026 plan series, in reading order."
- **Explore** — "Where everything else lives."

**Click Done.**

> "That's the elevator pitch. Now let me dig into the parts that matter."

---

## 2. Dashboard deep-dive: chart + range (45 sec)

**Screen:** Scroll to the elevation chart. Click through the range buttons
(`1 month → 1 year → 5 years → 40 years`).

**Click 40 years.**

**Say:**
> "Pull it back to 40 years and the story is obvious — filled in the mid-80s,
> held through the 90s, drought hit in 2000, and the trend has been mostly
> down ever since."

**Click back to 5 years.**

> "Zoom in and you see the seasonal rhythm — refill in spring, drawdown all
> summer."

---

## 3. Dashboard deep-dive: volume-impact (60 sec)

**Screen:** Scroll to the volume-impact section
(`[data-tour="volume-impact"]`, anchor `#calculator`).

**Say:**
> "This is where it gets interesting. It shows what the lake actually does
> between now and April 2027 under whatever policy you pick."

**Toggle a different plan or change the additional-water input.**

> "I overlay the actual 2022 Flaming Gorge release on the chart, shifted
> forward, so you can see how the last emergency release moved the lake. Good
> reality check on what 'half a million acre-feet' really buys you."

---

## 4. Simulator (90 sec)

**Screen:** Click **Simulator** in the top nav. Land on `/simulator`. Two tabs
visible: **Projections** (default) and **Historical**.

**Say:**
> "If you want to go past 2027 or run your own assumptions, that's the
> Simulator. Two modes."

**Click Historical.**

> "**Historical** lets you say 'what if we'd run a different policy starting
> in, say, 2000?' — it replays the last 20+ years with that policy applied to
> real inflows. You see whether Powell would have crashed earlier or held up."

**Set a start year, change the policy, watch the chart redraw.**

**Click back to Projections.**

> "**Projections** is forward-looking — Monte Carlo against the driest decade
> on record. Pick a policy, hit run, get a fan chart of where the lake ends up
> across hundreds of inflow scenarios. Every run gets a shareable link."

---

## 5. Ramps (15 sec — quick mention)

**Screen:** Click **Ramps** (or **Lake access** on mobile) in the nav. Land on
`/ramps`. Don't scroll deep.

**Say:**
> "If you actually want to launch a boat, this page tells you which ramps are
> usable today and how much margin they have before going dry. Moving on."

---

## 6. Articles (75 sec)

**Screen:** Click **Articles** in the top nav. On `/articles` you'll see a
hero, then a numbered "The series" list.

**Say:**
> "The Articles section is the long-form companion to the data. There's a
> curated series on the post-2026 plans."

**Click the first article: "The real problem isn't drought — it's math".**

**Scroll briefly through the article.**

> "Start here — explains why Powell keeps dropping even in normal years.
> Each plan then gets its own breakdown: No Action, Basic Coordination,
> Enhanced Coordination, Max Operational Flexibility, Supply Driven, and the
> Abundance Act."

**Back-button to `/articles`. Click "Head-to-head — every plan on the same
chart" (slug `plans-head-to-head`).**

> "And this is the verdict — all five plans on the same chart, graded on
> recovery, floor, bad-case ending, and speed. This is the one to send
> someone who just wants the bottom line."

---

## 7. Wrap (15 sec)

**Screen:** Click the logo to return to `/`.

**Say:**
> "That's the site. Current level at the top, projections under it, run your
> own scenarios in the Simulator, read the articles for the policy context.
> Free, no login, updates daily. Send it to anyone who cares about the lake."

---

## How to update this script when the site changes

The script is held together by the **Reference table** above. The flow:

1. **Section renamed or moved on the homepage** → update the matching row in
   the table, update the `data-tour` attribute in `frontend/app/page.tsx`,
   and (if it's a tour step) update the matching entry in
   `frontend/components/tour/tour-steps.ts`.
2. **New section added that you want in the tour** → wrap it in a
   `<div data-tour="some-id">…</div>` in `page.tsx`, add a row to the table,
   add a step to `tour-steps.ts`. Tour steps and `data-tour` attributes are
   the only contract; everything else is prose you can rewrite.
3. **Page renamed or removed** → update the row's `Page / route` column and
   the matching click cue in the section below.
4. **Want to preview the tour after editing it** → visit `/?tour=1`. Clears
   no state, just force-shows the offer modal.
5. **Want to reset the "already offered" flag** → in DevTools console:
   `localStorage.removeItem('lakepowelldata-tour-offered')`.

## Pacing variants

- **Total runtime:** ~5–6 minutes at a normal pace.
- **3-minute version:** sections 1 (tour) + 3 (volume-impact) + 4
  (Simulator: Projections only) + 6 (Articles index only).
- **For boaters:** spend more time on section 5 (Ramps) — open the page
  fully, point at a specific ramp's status. Skip section 4.
- **For policy/wonk audiences:** lean into 3, 4, and 6. Skip 5.
- **Keep the cursor moving.** Silent stretches with no clicks read as dead
  air on video. If you're talking >15 seconds without clicking, scroll
  slowly.
- **Read real numbers off the screen** instead of saying "around 3,550."
