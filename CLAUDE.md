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
- 1,531 rows currently: 1,172 athletes, of whom 348 carry two or three marks.
  Pulled from meet results through Sep 12, 2026

Updating the database means replacing that block and committing. There is no
admin UI and there should not be — the app is customer-facing.

**Pulling marks.** Do not scrape the rendered page. athletic.net has a plain
JSON API. It sits behind Cloudflare, so the calls must come from a real browser
session — Node gets a challenge page. Drive it from the console on an
athletic.net tab:

```
GET  /api/v1/TeamHome/GetTeamCore?teamId={id}&sport=xc&year=2026   -> jwtTeamHome
GET  /api/v1/TeamHomeCal/GetCalendar?seasonId=2026                 -> that team's meets
GET  /api/v1/Meet/GetMeetData?meetId={id}&sport=xc                 -> jwtMeet + xcDivisions
POST /api/v1/Meet/GetResultsData3   {divId, meetId}                -> the results
```

The calendar and results calls need the matching JWT in an `anettokens` header.
**Pace them at 1.5s or slower** — faster returns 403, and a tight retry loop
only digs in deeper. Results carry `AthleteID`, `FirstName`, `LastName`,
`Grade`, `TeamID`, `SchoolName` and `Result`, so athletes and teams join on
stable ids instead of name strings.

Walking all 47 team calendars is what makes the pull complete — a meet only
turns up if some team put it on its schedule. That found 26 meets for 2026.
athletic.net spells some schools `Franklin (OR)`, `Roosevelt (OR)`,
`Cleveland (OR)`, `Sheldon (OR)`; strip the suffix when matching.

Filter to the 47 6A `TeamID`s, grades 9-12, and divisions of exactly 3,000m or
5,000m. Take each athlete's three fastest marks per distance, then the top
seven per team per board — which is what `buildModel` does anyway.

The browser cannot write files, and an https page cannot reach a localhost
server. A Blob plus a synthetic `<a download>` click does work and lands in
Downloads. Do not call `window.open` — in an automated browser it navigates the
tab rather than opening a popup, and the crawl state goes with it.

**Rankings lists are no longer a source.** They publish only each athlete's
season best, and everything past the top five is masked unless signed in. Meet
results are open and carry every race.

**Excluded meets.** `Ultimook Race` (meet 271535, Sep 5) is dropped. Hydrangea
Ranch is an obstacle course: fitted against the rest of the season it runs
1.23x at 3,000m and 1.15x at 5,000m, and its per-athlete spread is twice as
wide as anywhere else — two McKay girls who race 16-18 minutes ran 35:36 there.
Same course, same reason it is already excluded from calibration.

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

`backtest/` rebuilds a past season's database as of mid-September, simulates it,
and compares against Lane in November. See `backtest/README.md`. Two seasons are
committed, 2024 and 2025, which is 197 team-seasons.

**The headline: the variance dial is too narrow for a September projection.**

| sigma | 2025 boys | 2025 girls | 2024 boys | 2024 girls | pooled Brier | logloss |
|---|---|---|---|---|---|---|
| 2.3% (shipped) | 0.0376 | 0.1435 | 0.1245 | 0.0794 | 0.0962 | 0.3054 |
| 5.0% | 0.0493 | 0.1088 | 0.1057 | 0.0740 | **0.0844** | 0.2616 |

Three of the four season-genders want 5-7%; only 2025 boys prefers 2.3%, and
that season was unusually predictable. Calibration at 2.3% is badly
overconfident — teams given 70-90% qualified only 50% of the time, and teams
given under 10% qualified 5% of the time. At 5% those bands land at 79% and 1%.

This does **not** say `CAL` is wrong about what it measures. 2.3% is race-to-race
spread, measured between two meets in the same season. The backtest projects
eight weeks ahead, across which squads also change: roughly 6% of September
top-five places are not on the line at the league championship, near-identical
for boys and girls. Raising sigma is a crude proxy for attrition the model does
not represent. Treat 5% as the honest dial for a long projection and 2.3% as the
honest dial for the next race.

Not yet tested: whether the right sigma falls as the season advances and the
database gets closer to November. That needs October cutoffs, which means
pulling the mid-season meets for 2024 and 2025 — only the pre-cutoff, district
and state meets were pulled.

## What the model does not know

Listed in the app's own "How" tab:

- **Course difficulty is not modelled, and this is now the binding problem.**
  A mark from flat Lents Park and one from hilly Alderbrook are treated alike.
  Now that athletes carry marks from different meets, that assumption is doing
  real damage rather than sitting idle. Fitting `log(time) = athlete + course`
  by alternating least squares over the 2026 season gives course factors from
  **0.90 to 1.23** — Oregon City 5,000m at 0.903, Ash Creek at 0.976, the
  Mountainside quad at 1.053, Ultimook at 1.15-1.23. That is a 33% spread
  against a noise dial of 2.3%. Until it is corrected, an athlete's second mark
  says more about where they raced than how they ran. See open item 1.
- No seasonal progression, injury, or roster change between now and November.
- The at-large ranking is a stand-in for a committee that also weighs league
  strength and head-to-head.
- A league with only two scoring teams shows both at 100% — arithmetic, not
  prediction. This no longer bites on the 5,000m board: the meet-results pull
  filled Three Rivers out from two scoring teams to six, and the 5,000m board
  from 39 teams to 45. Watch for it returning on thin boards early next season.

## Open items

1. **Course-difficulty adjustment** via least squares over shared athletes.
   Fitting `log(time) = athlete + course` over 2026 gives factors from **0.90 to
   1.23** against a 2.3% noise dial. A head-to-head test — 30,243 pairs who raced
   the same course on the same day, predicted from their other marks — puts raw
   marks at 91.1% and course-adjusted at 91.6%. Small, because most pairs are
   blowouts; but on the 660 pairs where the two disagree, adjusted is right 60%
   of the time. Most of the available gain was already banked by excluding
   Ultimook. Worth doing, not urgent.
2. **Horizon-dependent variance.** The backtest says a September projection wants
   sigma near 5%, not 2.3%. Before changing `CAL.sd`, pull October meets for 2024
   and 2025 and re-run at later cutoffs: if the best sigma falls as November
   approaches, the dial should depend on how far out the projection is rather
   than being one number.
3. **Model roster attrition directly** instead of hiding it in sigma. About 6% of
   September top-five places are not on the line at the league championship. A
   per-runner probability of being absent by November would be closer to the
   truth than widening everyone's distribution.
4. Revisit `MARK_W` renormalisation for the two-mark case. `[0.25, 0.50]`
   renormalises to `[0.33, 0.67]`, so the *slower* of two marks carries twice the
   weight of the faster. With three marks the 50% lands on the middle mark, which
   is the intent; with two there is no middle, and the current split pushes an
   athlete's expected time about 5.9% slower than their best. 348 athletes now
   have two or three marks. `[0.5, 0.5]` is the neutral alternative — but decide
   it together with course adjustment, since most of that gap is course.
5. More backtest seasons. 2023 and earlier would firm up the sigma estimate;
   197 team-seasons is enough to see the direction, not to pin the number.
6. Grade-dependent improvement curves (freshmen improve most).
