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

- `gender` is `M`/`F`; `dist` is always `5000`
- one row per athlete per mark; duplicates are the point, not a mistake
- 868 rows currently: 613 athletes, of whom 218 carry two or three marks.
  Pulled from meet results through Sep 12, 2026

**5,000m only.** The state meet and every league championship are run at
5,000m, so that is the only board. Short early-season races (the 3k meets in
late August) are dropped at pull time and the distance toggle was removed from
the site. Nothing is ever converted between distances.

Updating the database means replacing that block and committing. There is no
admin UI and there should not be — the app is customer-facing.

**Updating the database is two edits, not one.** Replace the seed block *and*
set `DATA_DATE` just above `FULL_MS` to the last day of results included. The
header reports it to readers as "Results through Sep 12"; leave it stale and the
site quietly lies about how fresh it is.

## The site

Three things on the board beyond the odds themselves.

**Average points.** Each card carries the team's mean score at Lane underneath
its chance of winning, averaged only over the seasons it actually qualified —
teams that never get there show a dash rather than a fake zero. `blankTally`
carries `ptsSum`/`ptsN` and `playState` fills them.

**Results-through date.** Driven by `DATA_DATE`, rendered into the header on
load.

**The Chute Seven.** Tapping the checkered flag counts down the seven fastest
individuals in the division, seventh to first, across every school — with a
kicker on how many schools are represented and the fact that those seven as one
squad would score a perfect 15. The board is entirely about teams, so this is
the one question the site never otherwise answers. An earlier version replayed a
single simulated state meet; it looked good and was redundant, because it was
the tool again with less of it. `chuteSeven()` reads `DATA` directly rather than
the model, so athletes on teams too short to score still appear.

**Diagrams in the How tab.** Three, inline SVG, themed off the existing custom
properties and sized by viewBox so they scale on a phone: a hundred dots with
fifty-three filled for what a percentage means, the seven-leagues-to-sixteen-
teams qualification path, and the lopsided race-day curve. Prose alone was
losing people at exactly the points that matter.

**The How tab is written for readers, not for us.** It explains the ideas —
seasons rather than one race, teammates having bad days together, bad days
running deeper than good ones, comparisons held against identical races, and
the fact that it has been scored against seasons we already know the answer to.
It deliberately does not print the weights, the noise split, the calibration
table or the solver's step size. What it does keep is an honest list of what the
model does not know, including that early-season numbers are wider than they
look. That section earns more trust than it costs — do not quietly drop it.

## How the simulation works

One "season" is: draw times → score seven league meets → allocate 14 automatic
and 2 at-large berths → **redraw all times** → score the 16-team state meet.

The redraw matters. A team that got hot at districts starts again from its
marks. Carrying one draw through both would amplify luck instead of averaging it.

**Sampling.** Each race draws from an athlete's top three marks at 25/50/25,
renormalised when fewer exist (`MARK_W`, `pickMark`). Live as of the Sep 12
pull: 348 of 1,172 athletes carry two or three marks, so this path is actually
exercised now rather than collapsing onto a single mark. Read open item 2
before leaning on it — the two-mark weights are not neutral.

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

**The at-large count is a season's rule, not a constant.** OSAA sets it each
year and it has moved: 2024 and 2025 both ran 14 automatic + **4** at-large
(18 teams at Lane), 2026 runs 14 + **2** (16). The 2026 figure is confirmed
against OSAA's own qualification page, so `AT_LARGE=2` is right for this
season - but check it each August, and never assume a past season used it.
The backtest sets it per season from that year's results.

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

`extract_model.js` regenerates `model.js` by lifting the pure functions out of
`index.html`; `audit2.js` runs them under Node. Neither touches the DOM. Run:

```
node extract_model.js        # regenerate model.js after any signature change
node audit2.js               # 47 checks
```

It covers NFHS scoring (a perfect dual is **15-50**, not 15-40), displacement,
the seven-runner cap, sixth-runner tiebreaks, and model-wiring invariants across
both genders and both distances, plus simulation invariants — exactly `FIELD`
teams qualify per season, exactly one winner, `auto + wild == qual`.

`extract_model.js` smoke-tests what it generates, because a constant left behind
in `index.html` otherwise only surfaces when the function using it runs.

**One check fails, by design.** `scoreMeet` increments `place` before the `n>7`
check, so a team's eighth and later runners still push opponents down the field.
NFHS strikes them out instead. This is unreachable today — `buildModel` caps
every roster at seven — so it is recorded as a latent issue rather than fixed,
but it would bite if that cap were ever raised.

## Backtest

`backtest/` rebuilds a past season's database as of a chosen date, simulates it,
and compares against Lane in November. See `backtest/README.md`. Two seasons are
committed, 2024 and 2025, at four cutoffs each — mid-September through late
October — which is 197 team-seasons per cutoff.

**The variance dial depends on how far out you are.** Sweeping sigma against
actual outcomes at each cutoff:

| information set | weeks to state | best sigma | implied drift |
|---|---|---|---|
| mid-September | 8 | **5.0%** | 4.4% |
| late September | 6 | 3.0% | 1.9% |
| mid-October | 4 | 2.6% | 1.2% |
| late October | 2 | 2.6% | 1.2% |

`CAL.sd` is 2.3%, which is about right from four weeks out and much too narrow in
September. At the September cutoff, teams given 70-90% qualified only 50% of the
time and teams given under 10% qualified 5% of the time; at 5% those land at 79%
and 1%. Pooled Brier improves 0.0962 -> 0.0844. Skill against the base rate runs
58% in September and 76% in late October — the model gets sharper as the season
fills in, which is what it should do.

**It is the horizon, not thin data.** In mid-September only about a quarter of
athletes have raced twice, against nearly two thirds by late October, so the
September set is both further out and poorer — either could push sigma up.
`backtest/confound.js` separates them by thinning the *late* database to one mark
per athlete: the same poverty, none of the distance. The best sigma barely moves
(2.6% -> 2.3%). Poverty is not the cause; eight weeks of unmodelled change is.

That points at a shape of fix rather than a new constant. Variances add, exactly
as `TEAM_SHARE` already assumes, so

```
total² = raceDay² + drift²      5.0² = 2.3² + 4.4²
```

Keep `CAL.sd` as race-day spread, with its "two thirds of races land within ±X s"
explanation intact and honest, and add a drift term decaying from roughly 4.4% in
September to near zero by the state meet. The table above is the decay curve.
Most of it is gone within a fortnight of the September cutoff, which is far
steeper than a straight line.

**Extra marks are not currently paying their way.** `backtest/marks_value.js`
compares the full database against one thinned to each athlete's best mark, each
run at its own best sigma. Best-only wins at every cutoff, and the margin *grows*
as marks accumulate — 0.0009 in mid-September at 1.26 marks per athlete, 0.0054
in late October at 2.08. The more marks an athlete carries, the more they cost.
The meet-results pull was still the right move — it filled rosters out and
retired the two-team-league artifact — but top-three sampling is not yet earning
its keep.

**It was `MARK_W` after all — the aggregate test hid it.** The old scheme
truncated `[0.25, 0.50, 0.25]` and renormalised, handing a two-mark athlete
`[0.33, 0.67]`: two thirds of the weight on their *slower* race. Against a
one-mark team-mate, who is simply taken at their best, that is not a judgement
about speed. It is a penalty for racing more often.

The damage in September 2026, before the fix:

| | marks each | top five, bests | as the model ran them |
|---|---|---|---|
| Grant (boys) | 2.0 | 76:28 | 78:20 — **112s slower** |
| Lincoln (boys) | 1.0 | 77:58 | 77:58 — no penalty |
| Sherwood (girls) | 2.0 | 94:38 | 97:57 — **199s slower** |
| Jesuit (girls) | 1.0 | 97:06 | 97:06 — no penalty |

Grant was 90 seconds faster than Lincoln across five and ranked behind them.
Sherwood was two and a half minutes faster than Jesuit and ranked behind them.
Both flipped the moment the weights changed, and both now agree with
athletic.net's own season-best ordering.

`markw.js` had said the shipped split was fine, and that was a real methodological
error on my part rather than bad luck: it pooled every cutoff. By late October
almost every athlete has two or more marks, so the penalty is near-universal and
cancels out of the relative standings. It only bites when *some* teams have raced
twice and others have not — which is exactly mid-September, exactly where the live
site sits. Run `markw.js --cut 0` and the shipped scheme ranks fifth of six.

The weights are now an explicit table, `[[1], [0.67, 0.33], [0.50, 0.30, 0.20]]` —
best mark leads, later marks temper it. Pooled backtest Brier improved 0.0965 to
0.0921 in September and 0.0550 to 0.0522 in late October, so it is better
everywhere, not a September-only patch.

**It is still not fair, only less unfair.** A second mark can only ever slow an
athlete down, because there is nothing to compare it against — that needs course
and date adjustment, which is open item 1. When that lands, re-run `markw.js`:
the gradient toward the best mark should flatten.

**The lesson worth keeping:** pooling across regimes can hide a bias that is
severe in one of them. When a result says "no effect", check whether the effect
is supposed to be uniform. Here it was not, and a reader spotting Grant on the
board caught what the aggregate missed.

**Course adjustment was built, tested, and not shipped.** `fit_courses.js` fits
`log(time) = athlete + course` by alternating least squares, with shrinkage for
thin meets and a connectivity check so unconnected courses are left at 1.000
rather than invented. `backtest/course_value.js` scores it against raw marks at
every cutoff, with factors fitted only from marks available at that cutoff so no
September forecast sees October.

| cutoff | raw | course-adjusted | |
|---|---|---|---|
| mid-September | 0.0845 | **0.0830** | better |
| late September | 0.0575 | 0.0616 | worse |
| mid-October | 0.0582 | 0.0599 | worse |
| late October | 0.0551 | 0.0588 | worse |

Pooled it is 3.1% *worse*, and it beats raw marks in only 38% of bootstrap
draws. It helps in September and hurts steadily more as the season goes on.

**Why: course and date are confounded.** Each meet happens on exactly one day,
so nothing in the data distinguishes "this course is hard" from "this race was
early". The fitted factors correlate with the calendar at **r = -0.70 (2024)**
and **-0.66 (2025)**, sliding about **1% per week** — which is athletes getting
fitter, not courses getting flatter. Dividing by such a factor inflates early
marks and erases genuine improvement, and the later the cutoff the more real
progression there is to erase. That is exactly the observed pattern.

So the 0.90-1.23 spread quoted elsewhere is course **plus** eight weeks of
fitness, and the honest course-only component is smaller and unmeasured.

Separating them needs an identifying assumption the current data cannot supply.
The realistic route is venues that host more than one meet on different dates:
the venue effect is shared while the dates differ, which pins the time trend.
A handful of Oregon venues qualify. Until then, leave marks raw.

Not yet pulled: 2023 and earlier. The direction of every finding above is settled
— the bootstrap puts P(best September sigma >= 3.5%) at 99% — but the level is
pinned only to about a point either way. 2023 is worth more held back as a clean
holdout for whatever drift term gets built than folded in now.

## What the model does not know

Listed in the app's own "How" tab:

- **Course difficulty is not modelled, and correcting it is harder than it
  looks.** A mark from flat Lents Park and one from hilly Alderbrook are treated
  alike. Fitting `log(time) = athlete + course` does produce a spread of roughly
  0.90 to 1.23 — but see the backtest section: most of the late-season end of
  that range is athletes getting fitter, not courses getting easier, and
  dividing it out makes forecasts worse. Treat the number as an upper bound on
  the course effect, not a measurement of it.
- No seasonal progression, injury, or roster change between now and November.
- The at-large ranking is a stand-in for a committee that also weighs league
  strength and head-to-head.
- A league with only two scoring teams shows both at 100% — arithmetic, not
  prediction. This no longer bites on the 5,000m board: the meet-results pull
  filled Three Rivers out from two scoring teams to six, and the 5,000m board
  from 39 teams to 45. Watch for it returning on thin boards early next season.

## Open items

1. **Break the course/date confound.** Course adjustment is built and fails
   because a course factor currently absorbs about 1% per week of seasonal
   fitness — see the backtest section. The identifying trick is venues that host
   more than one meet on different dates: the venue effect is shared while the
   dates differ, which pins the time trend and lets the two be separated. Find
   the repeat venues, add a shared week term, re-run `course_value.js`. If it
   then beats raw marks, ship it and re-run `marks_value.js` and `markw.js` —
   both should flip.
2. **Horizon-dependent variance.** The backtest measures the curve: best sigma
   is 5.0% at eight weeks out, 3.0% at six, 2.6% from four weeks in.
   `confound.js` rules out thin data as the cause. Implement as
   `total² = raceDay² + drift²`, keeping `CAL.sd` at 2.3% for race-day and
   decaying drift from ~4.4% in September toward zero at Lane. Do not simply
   raise `CAL.sd` — the slider's own helper text describes race-day spread and
   would become false. Note this is the same confound as item 1 seen from the
   other side: drift and course-date are both "the season moves".
3. **Model roster attrition directly** instead of hiding it in drift. About 6%
   of September top-five places are not on the line at the league championship.
4. **2023 as a holdout.** Not to narrow the sigma estimate — a third season moves
   the 80% interval from about 2.0 points to 1.6, which changes nothing. Pull it
   *after* the drift term exists, as the only season it was never fitted on.
5. Grade-dependent improvement curves (freshmen improve most). This is item 1's
   problem wearing a different hat: a per-grade progression term would also help
   separate fitness from terrain.
6. `scoreMeet` increments `place` before its `n>7` check, so a team's eighth and
   later runners displace opponents where NFHS strikes them out. Unreachable
   while `buildModel` caps rosters at seven; `audit2.js` records it as the one
   deliberate failure.

**Previously marked settled, and it was not:** the `MARK_W` two-mark split.
See the backtest section. The mistake was trusting a pooled result for a bias
that only shows up in one regime — check whether an effect is supposed to be
uniform before believing a null.
