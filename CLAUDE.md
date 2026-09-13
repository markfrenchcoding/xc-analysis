# Chute — Oregon 6A cross country state odds

Monte Carlo simulator for OSAA 6A cross country. Simulates whole seasons —
seven league meets, at-large selection, then the state meet at Lane — and
reports each team's odds of qualifying, placing and winning.

Live: https://chutexc.vercel.app
Repo: github.com/markfrenchcoding/xc-analysis (Vercel project is named `chutexc`)

## Shape of the thing

**One file.** `index.html` at the repo root, ~125KB, no build step, no
dependencies, no backend. Vercel serves it statically. Everything — data, CSS,
simulation, UI — is in that file.

This is deliberate. The owner works through GitHub's web UI and does not use a
terminal or git CLI. Any change must survive being uploaded as a single file via
drag-and-drop. **Do not split this into modules, add a bundler, or introduce
npm.** If you need to work on it locally, edit the file directly.

The Vercel project framework preset is **Other**. It must stay that way — it was
set to Python for a while and every deploy failed in two seconds looking for an
entrypoint that did not exist.

## Data

Embedded as CSV in `<script id="seed" type="text/plain">` near the top of the
file. Columns: `gender,athlete,mark,grade,team,dist`.

- `gender` is `M`/`F`, `dist` is `5000` or `3000`
- one row per athlete per mark; duplicates are the point, not a mistake
- 1,074 rows currently: the full 2026 6A division as of Sep 11

Updating the database means replacing that block and committing. There is no
admin UI and there should not be — the app is customer-facing.

**Scraping.** athletic.net renders in JavaScript, so it needs a real browser.
The rankings list is paginated and `?page=N` works on direct navigation:

```
athletic.net/CrossCountry/rankings/list/{divisionId}/{m|f}/{5000|3000}?page=N
```

2026 6A division is `87405`; 2025 is `81499`. Roughly 9 boys and 6 girls pages
at 5,000m, 10 and 7 at 3,000m. Accumulate across navigations in `sessionStorage`
and reduce to top-7-per-team in the browser before extracting — the raw set is
too large to move around otherwise.

**Known gap.** The rankings list only publishes each athlete's *season best*, so
every athlete currently has exactly one mark. The top-3 sampling below is wired
and correct but idle: with one mark the weights renormalise to 100%. Real
second and third marks live only on **meet result pages**
(`/CrossCountry/meet/{id}/results/{raceId}`), which parse cleanly from
`document.body.innerText` with:

```js
/(\d{1,3})\n(?:[A-Z]{2,3}\n)?([^\n]+)\n([^\n]+)\n(\d{1,2}:\d{2}\.\d{1,2})\n/g
```

Moving the weekly pull to meet results is the single highest-value next step.
About seven completed 6A meets so far, two varsity races each.

## How the simulation works

One "season" is: draw times → score seven league meets → allocate 14 automatic
and 2 at-large berths → **redraw all times** → score the 16-team state meet.

The redraw matters. A team that got hot at districts starts again from its
marks. Carrying one draw through both would amplify luck instead of averaging it.

**Sampling.** Each race draws from an athlete's top three marks at 25/50/25,
renormalised when fewer exist (`MARK_W`, `pickMark`).

**Noise.** `time = mark × (1 + teamShock + individual)`. 30% of variance is
shared across a squad (`TEAM_SHARE`); variances add, so the two components are
`√0.30` and `√0.70` of the dial. Independent draws cancel inside a five-runner
sum and made favourites look far safer than they are.

Individual noise is right-skewed (`skew()`): slow half stretched ×1.45, fast
half compressed ×0.75, then recentred and rescaled so the dial still means one
standard deviation. Good days are capped by fitness; bad ones are not.

There is deliberately **no meet-wide shock**. Multiplying everyone in a race by
the same factor cannot change finishing order.

**Calibration** (`CAL`). Default spread is 2.3%, from 2025 athletes who ran both
a fair-course meet and the state meet at Lane:

| reference | date | n | state ÷ ref | spread |
|---|---|---|---|---|
| Rose City GC | Oct 10 | 208 | 1.009 | 2.16% |
| Blue Lake | Sep 26 | 85 | 1.007 | 2.44% |
| Ultimook (Hydrangea) | Sep 6 | 66 | 0.937 | 4.40% |

Ultimook is excluded and must stay excluded — Hydrangea Ranch is effectively an
obstacle course and that 4.4% measured terrain, not athletes. The two fair
courses agree closely and are six weeks apart, which says fitness gains and
Lane's extra difficulty roughly cancel over the back half of the season. The
ratio itself never enters the model; only the spread does.

**Scoring** (`scoreMeet`). NFHS: top five score, six and seven displace without
scoring, ties break on the sixth runner, a team without a sixth loses any tie.
Teams that cannot field five are removed before places are assigned.

**Qualification** (`playDistricts`). Top two per league auto-qualify. Third-place
teams enter the at-large pool ranked by scoring-five average; a fourth-place
team is only eligible once its own league's third is taken. Two at-large spots.

## Worlds

`oneSeason(model, worlds, sigma, times, shock, tmp)` scores N parallel worlds
against **one set of draws**. A world is `{adj, byIdx}` — second-offsets plus its
own tally. This is what makes every comparison paired: differences between
worlds are the adjustments, never the luck.

- Odds tab: one world
- What-if: baseline + combined + one per adjusted runner
- Solver: current plan + seven `+5s` variants, all in one pass

Running candidates in separate passes let sampling noise pick the winner. That
bug once handed 80 seconds to a team's fastest runner.

## Solver

Greedy, 5s at a time, stops at 50% probability (`GOAL_P`). Caps: 45s per runner,
180s total, 30 steps.

Two things it needs to keep working:

**Pre-checks.** If the team already clears the target, say so. If the goal is
at-large but they auto-qualify, explain that at-large is the third-place route
and point elsewhere. Without these it hunts for routes that cannot exist.

**Surrogate chain** (`CHAIN`, `chooseBy`). Rare outcomes do not respond to a
single 5s step, which strands a greedy search at zero. It falls back through
softer signals — at-large → makes-state, win → top4 → top10 → makes-state — and
finally to mean district score, which always moves. Mean league *place* was
tried first and was too weak: it shifted ~0.02 against a 0.02 threshold.

## Timers

`nextTick` falls back to `setTimeout` when `document.hidden`. Browsers throttle
`requestAnimationFrame` to nothing in background tabs, which strands a run
mid-way. Every paced loop must use `nextTick`, not rAF directly. The two
remaining rAF calls are cosmetic (measure/paint) and fine.

## Layout gotcha

Team cards are absolutely positioned and moved with `translateY`, so they sort
smoothly during a run. The step height is **measured from a rendered card**
(`measure()`), never hardcoded — a hardcoded 118px against content-sized cards
is what caused overlapping cards once already. Re-measure on resize and after a
run finishes.

## Audit harness

`model.js` extracts the pure functions; `audit2.js` runs them under Node. It
covers NFHS scoring (perfect dual is **15-50**, not 15-40), displacement, the
seven-runner cap, sixth-runner tiebreaks, and model-wiring invariants across
both genders and both distances. Regenerate `model.js` if you change function
signatures. Run: `node audit2.js`.

## What the model does not know

Listed in the app's own "How" tab, and all still true:

- **Course difficulty is not modelled.** A mark from flat Lents Park and one
  from hilly Alderbrook are treated alike. This is the largest source of error
  and the most valuable thing to fix. It needs multiple marks per athlete so
  meets can be chained through shared runners and difficulty solved by least
  squares.
- No seasonal progression, injury, or roster change between now and November.
- The at-large ranking is a stand-in for a committee that also weighs league
  strength and head-to-head.
- A league with only two scoring teams shows both at 100% — arithmetic, not
  prediction. Three Rivers on the 5,000m board is the live example.

## Open items

1. Meet-results pull to give athletes real 2nd/3rd marks (unblocks top-3 sampling)
2. Course-difficulty adjustment via least squares over shared athletes
3. Backtest: rebuild the 2025 database as of mid-September, simulate, compare to
   what actually happened at Lane — checking calibration, not just ranking
4. Grade-dependent improvement curves (freshmen improve most)
