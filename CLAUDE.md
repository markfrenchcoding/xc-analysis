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
- a `class` column selects the board: 6A, 5A, 4A, 3A or 2A/1A
- 2,974 rows currently across all five classifications: 2,221 athlete-boards,
  214 schools. Pulled from meet results through Sep 12, 2026
- the flag's draft reads `DATA` across every classification at once, so a name
  that only appears on one board is still draftable onto any other

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

**Three tabs, and one of them has three views.** Odds · What if · How. Inside
Odds a segmented switch chooses Teams, Runners or Leagues. That is the shape
because all three of those *are* odds — they were three sibling tabs for a
while, each with its own copy of the switchers and its own Run button, and it
read as three tools rather than three readings of one.

**One control block, `#ctl`, above everything.** Classification, Boys/Girls,
both dials and the single progress strip live there once. They used to be pasted
onto each panel, which is how What if ended up with a gender switch and no
classification switch, and how the Runners board ended up with no dials at all.
The block hides only on How, which is the one page with nothing to set.

**The dials fold.** Open until the first run finishes, then collapsed to a line
reading `±2.3% · 5,000 seasons`; touch the header once and that choice sticks
for the session (`dialsTouched`). A hundred and fifty pixels of settings above a
fifty-row board every time was the alternative.

**One run fills all three views.** `RUN` holds the model, both tallies and the
season count, and is written every frame. Only the view on screen is painted —
`paintActive` — and `refreshView` catches the other two up the moment they are
switched to, which is why every paint reads from `RUN` rather than from a
closure inside the loop. A hidden panel measures zero, so `refreshView` also
re-measures; that is what stops a board built while the reader was elsewhere
from laying out against a stale step.

Leagues is the exception to per-frame painting: it is a full `innerHTML` rebuild
rather than cards that move, so it refreshes twice a second. Enough to watch the
numbers firm up, cheap enough not to fight the run.

**The leagues heading is generated, not written.** It used to say "The seven
leagues" on every board, including the five-league and four-league ones.
`syncViewText` builds it from `LG.length`, `autoTotal()`, `AT_LARGE` and
`FIELD`, and must be called anywhere `setClass` is.

Three things on the board beyond the odds themselves.

**Average points.** Each card carries the team's mean score at Lane underneath
its chance of winning, averaged only over the seasons it actually qualified —
teams that never get there show a dash rather than a fake zero. `blankTally`
carries `ptsSum`/`ptsN` and `playState` fills them.

**The mark.** Sixteen runners on a staggered four-by-four lattice, nine of them
the rest of the field at 34% and seven of them a team: five filled, six and
seven drawn hollow, because five score and two displace. It is the rule the
simulator runs on, drawn.

Three things about it are load-bearing:

*The lean is the wordmark's.* CHUTE is set in Anton with `skewX(-8deg)`, and the
lattice carries the same eight degrees so the two read as one object rather than
an icon beside a word. **The skew is baked into the coordinates, not applied as a
transform** — skewing a circle turns it into an ellipse. The field leans; the
runners stay round. If the wordmark's angle ever changes, the sixteen `cx` values
have to be recomputed, not re-transformed.

*The tab icon is a different drawing.* Sixteen dots at sixteen pixels is a
speckle, so the favicon carries the seven alone, scaled up to fill the square.
It is a data URI and therefore cannot use custom properties: the accent is
hardcoded `#F0455C`, which reads on both a light and a dark tab strip. Change the
accent and that hex has to change with it.

*The seven surge on tap.* `.pk-team` animates on `body.gunlap-fire`, which is the
class the flag's ripple used and the draft still sets. A transform on an SVG
group resolves against the viewBox, so those translate values are user units,
not pixels.

**The checkered flag is retired**, and with it `--flagK`/`--flagM` and the six
`c0`–`c5` ripple keyframes. Cross country does not use a checkered flag; it was
also the same mark half the timing companies in the country use. Two things had
borrowed those colours and were re-cut rather than left dangling: the overlay's
top tape is now a moving row of accent dots, and the pace line's finish post
keeps its stripes — a finish line really is striped — in `--text` and
`--accent`.

**Crests.** `LOGO` maps display name to a school's mascot image, and `crest()`
falls back to initials when a name is missing. It covers all 214 schools in the
seed; before the other classifications shipped it held only the 6A 47, so every
5A-and-below card fell back to initials.

Refresh with `GetTeamCore?teamId={id}&sport=xc&year=2026` — the response carries
`team.MascotUrl`. Two gotchas: the url comes back protocol-relative
(`//lh3.googleusercontent.com/...`) and without a size suffix, so prefix
`https:` and append `=s96` to match the existing entries. And **pace it** — at
320ms a request 105 of 167 came back empty; at 900ms with three retries all 167
resolved. Key the map by the seed's display name, not athletic.net's own
spelling, or `Cleveland (OR)` will miss `Cleveland`.

**Results-through date.** Driven by `DATA_DATE`, rendered into the header on
load.

**The Runners board sorts itself out in front of you**, the same way the team
cards do: rows are absolutely positioned and moved with `translateY` off a
measured step, so they pass each other as the odds firm up.

Three things about it are not obvious.

*Ninety rows are in play and fifty are shown.* The board ranks on mean finishing
place, which is not knowable before the run, so the cards have to be built from
something correlated with it — season best — and then allowed to re-order.
Ninety gives the boundary room to move; anything past the fiftieth slot parks on
the fiftieth and fades to nothing, still ranked and still able to come back.

*The digits churn and lock.* `spin()` replaces digit characters with random ones
at a probability that falls as the run progresses — `lock = frac²`, so almost
everything is still spinning at halfway and almost nothing is by the end. Only
digits are touched: a percent sign, a decimal point and an em dash all stay put,
so the shape of a number never jumps and `<1%` never becomes something absurd in
its punctuation. The point is that the board *arrives* at its answer.

*The rail and the chip say different things.* The left rail carries the
all-state tier — first team through seventh, second team through fourteenth,
honorable mention through twenty-first, in `--t1`/`--t2`/`--t3` — with a group
label above each block. The rank chip carries the podium, gold-silver-bronze on
the top three only, echoing the `.rank` chip on a team card. Two different facts,
so they get two different marks instead of fighting over one colour. `RCUTS` and
`RTIER` hold the cuts; `rowY` offsets every row by the labels sitting above it.

*No `will-change` on these rows*, unlike `.tcard`. Ninety elements promoted to
their own compositor layer cost more than the hint saves — it made the board
paint half-drawn. They do carry an opaque `background`, which is not decoration:
two rows swapping slots slide through each other, and without something to
occlude with the reader gets one name printed over another for half a second.

The runner tally counts `win`, `top21` and `placeSum`/`n`. It used to count
top-5/10/20, which matched nothing the board marks; twenty-one is the all-state
line, so that is what is counted and what the column shows.

**The flag: your Oregon Dream Team.** Tapping the checkered flag opens a
draft. Pick any seven athletes in the state — any school, any classification —
and they race **the sixteen fastest schools in Oregon**, 6A through 1A, once in
front of you as a pace line and then two thousand more times for the odds.

It answers the two questions the board structurally cannot. Every other view is
locked to real rosters inside one classification; this is the only place the
tool can be asked about a squad that does not exist, or about a meet where a 4A
school lines up against a 6A one. Both fields are real: the girls' sixteen
currently include Banks and Crater, the boys' include Summit and Hood River
Valley. An earlier egg replayed a simulated state meet and was redundant — it
was the tool again with less of it. A second counted down the seven fastest
individuals in the division, which the Runners board now covers properly; that
idea survives as the draft's "Fastest" button.

**No engine change, and no board constants either.** `stateModel` builds its own
field straight from `DATA` — every school in the state with a scoring five,
ranked by five-average, top sixteen — because `buildModel` filters on the
selected classification and carries that board's berths and scoring depth, none
of which apply to a meet that does not exist. Marks are handled identically:
top three, a lone mark regressed, `MARK_W` weights. Scoring is `scoreMeet` at
five and seven, the NFHS default, and the draw is `draw()` — same shared team
shock, same skewed individual noise. There are no districts because there is no
season, so `playDistricts`, `playState` and `blankTally` are not involved; the
tally is four running totals. Nothing is conditional: the field is fixed, so
every one of the two thousand runnings is the same seventeen teams.

**The classification switcher does not reach the draft**, deliberately. The
board behind it still says 3A or 2A/1A; the race is always all of Oregon.

**Drafted runners are ghosts.** Their own school still lines up with them, so a
star drafted away is on the course twice and the results feed will show the same
name at 3rd and at 43rd. Taking them out of their school would drop it below the
scoring five and quietly change the field they are being measured against, so
the duplicate is the lesser distortion. The draft says so in a clause.

**Every school on the track has its own hue**, stepped by the golden angle so
consecutive teams never land near each other and wrapped into 25-335 degrees,
which reserves the band the site's accent sits in. Mid lightness, because the
same dot has to read on a near-white track and a near-black one. That leaves the
seven who do not exist as the only red on the course, ringed in the ground
colour so they punch out of the crowd - the same logic as the mark, where the
team is accent among grey. The feed carries each school's hue as a chip beside
its name.

**They run the real course.** The route is the GPS trace of the state meet -
5,105m, 1,141 points - not a drawing. `course/state_3rd.gpx` is in the repo
and `node course/build_course.js` rebuilds the whole scene from it, so replacing
the GPX gives a new course for free. Three earlier attempts drew the route by hand
off the printed map and all three were wrong in the same way: they missed that
the race finishes with a loop of the track itself.

**The scenery is placed against the trace, not beside it.** The oval is measured
off the closing loop, which is what guarantees the runners finish on the track
they are drawn on. Everything else sits in ground the course provably never
touches: grid the site at 8m, mark every cell within 16m of the trace, take the
largest clear rectangles, and put the ponds, ball fields, soccer bowl and campus
in those. Nothing can overlap the route because the route chose the gaps.

**The clear-rectangle test says where a thing CAN go, not where it IS.** The
ponds first landed in the south-west because that is where the biggest hole was;
they are actually two ponds north-west, inside the loop, with the course running
between them. A route planner screenshot settled it. Same for the two buildings
that sat inside the eastern loop - that ground is practice fields. When in doubt
about a landmark, find a picture; the geometry only rules placements out.

**The ground slab is in the frame calculation.** It is the outermost thing
drawn, so leaving it out of the bounding box hangs its corners off the edge.

**Heights are exaggerated about ninefold.** At true scale a twenty-metre
building is two pixels of extrusion and the whole thing reads flat. The ground
is a slab with one visible edge face for the same reason.

**It rains for the length of the race.** Two sheets of streaks, each a
repeating gradient translated exactly along its own stripe direction - a
gradient stripe is an infinite line, so sliding parallel to it loops seamlessly
at any distance. The near sheet is brighter, thicker and quicker than the far
one, which is the whole trick to depth. Thin and dense reads as rain; thick and
spaced reads as a barcode, which is what the first attempt looked like. The map
also desaturates a touch, the water ripples, and the worn trail darkens the way
it would. It is switched off entirely for reduced motion, because static streaks
read as scratches on the screen.

**Ten seconds end to end.** The winner crosses at eight, which puts a normal
spread at about ten, and the whole race is capped at ten and a half for the
times a drafted seven includes a twenty-eight minute runner.

**The frame is rotated six degrees before projecting.** The site is 834m by
371m; six degrees is the angle whose two-to-one dimetric projection fills the
frame best, found by sweeping all of them. Do not hand-tune it - re-run the
sweep if the extent changes.

**Positions are computed, not transitioned.** CSS motion paths are the obvious
fit and were tried first: `offset-path` with a per-runner `offset-distance`
transition. `offset-distance` does not interpolate reliably - it snapped every
runner to 100% instantly - so the route is sampled instead. `getPointAtLength`
walks the path that is **actually drawn**, 360 points evenly by arc length,
scaled from viewBox units to pixels; a runner's fraction of the race indexes
straight into that table. Sampling the drawn path rather than a parallel copy is
what makes it impossible for the dots to drift off the line the reader sees.

The clock loop moves them, so it is no longer cosmetic - but `finish` stays on
its own timer, so a stalled frame callback still ends the race in the right
place.

**Travel is on `translate`; the wobble is on `transform`.** They are separate
properties and they compose, which is what lets a runner surge and fade a pixel
either way without leaving the route. The wobble is one shared keyframe with a
per-runner duration and negative delay taken from the index rather than a
random, so a given race always wobbles the same way, and it carries each
runner's lane offset in `--lx`/`--ly` because `transform` is already spoken for.
`.pl-wrap.done` kills it at the finish, which is what puts all of them on one
point in the chute.

**`.gl-card` reserves its scrollbar gutter.** The course is sampled into pixels
when the race starts and the feed grows a scrollbar halfway through; without
`scrollbar-gutter: stable` the track narrows mid-race and the field walks a few
pixels off the line. Constant pace also means the field
starts bunched and strings out as the gaps compound, which is what a race looks
like from above. The winner crosses in four and a half seconds — `SPEED` takes
the max of that against a seven-second whole-race cap, because a drafted seven
can easily include a 28-minute runner and nobody wants to watch them jog in
alone. About six seconds end to end.

**The result is on a timer, not on the end of the clock loop.** The clock is
`nextTick` and purely cosmetic; `finish` is a `setTimeout` at the known race
duration. A tab sent to the background stops delivering frames, and a reader
coming back should find a finished race rather than one frozen at 0:00. This is
the same hazard `nextTick` exists for, one level up.

**The two thousand runnings finish before the race does**, by a factor of fifty.
So `ghostOdds` holds its answer in `DR.oddsHTML` and whichever finishes second
renders it. It is also paced on `setTimeout` rather than `nextTick`: it paints
nothing until it is done, and a frame callback on a page that has stopped
animating is at the browser's discretion.

**Two timer lists, and they are not the same.** `DR.timers` holds the finish-line
reveals and the result, which tapping to skip cancels because skipping calls
`finish` itself. `DR.odds` holds the season loop, which it must not — sharing one
list meant skipping the race silently threw the odds away.

**The moving colour is hardcoded, not taken from the palette.** `.dream` clips an
animated six-stop gradient to the text. The trophy variables were the obvious
source and are unusable for this: `--t2e` is a near-white silver and `--t1e` a
pale blue, either of which vanishes against the light theme's own background
once the fill is transparent. The six stops are mid-tone on purpose and were
checked in both themes.

**Points are conditional, and the card says so.** Each card shows the mean score
at Lane averaged over the seasons that team actually qualified — "pts when
there". That is the number a coach wants, but it does not fall neatly down the
board: a team reaching state one year in ten only gets there when everything
went right, and scores well on those days. Girls' Ida B. Wells at 9.6% averages
222; McMinnville at 99.8% averages 306. Both are correct. The figure is faded
below a 25% qualifying rate to show the average rests on a thin slice of
seasons, and the legend above the board says the same thing in words. Do not
"fix" the ordering — the inversions are real information.

**The How tab quotes live figures, and they will go stale.** Eight numbers are
hardcoded into the markup: four describing the database (613 athletes, 868
results, 47 schools, 5,000 seasons per run) and four from the backtest (81% of
qualifiers inside the board's top group, 197 team-seasons scored, 96% of the
above-90% band qualifying, 5% of the below-10% band qualifying). The champion
record — two of four — is in the prose beneath them.

Regenerate with `node backtest/headline.js`, **not** by reading a single
`backtest.js` run. Every figure is a Monte Carlo estimate, so one run is not a
fact: across five runs of 20,000 seasons the qualifier count moves between 58
and 59 of 72, which is the difference between publishing "81%" and "82%".
`headline.js` reports the spread so a number can be quoted at a precision that
will actually reproduce. The calibration bands are rock steady (96.0-96.1% and
4.7%); the qualifier count is not.

**Do not read the favourite off a list sorted by P(qualify).** Half the field
sits at 100% to qualify and those ties break arbitrarily, so the first row is
not the team most likely to win. `backtest.js` made exactly this mistake and
reported the champion record as three of four when it is two of four — the
published claim was overstated until it was caught. Both `backtest.js` and
`baseline.js` now take the maximum of `win`.

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

## Runners

Individual odds at Lane, on its own tab. The engine already drew a time for
every athlete in every simulated season and threw the finishing order away;
`runnerTally` keeps it. A world carrying `rt` gets individual places recorded,
so the odds board and the backtest pay nothing for the feature.

**The individual qualifiers are on the line.** OSAA advances any runner inside
the top N across the line at a district meet whose team did not qualify — 14 in
6A, 7 in 5A/4A and in the 3A and 2A/1A boys, 4 in the 3A and 2A/1A girls, held
in `CLASSES[cls][g].ind`. `playDistricts` picks them after the at-large places
are settled, because those teams count as qualified for this purpose. They race
and are ranked, but they are struck from team scoring, which is why `scoreMeet`
is untouched. The simulated field comes out at 148-152 against an actual 147-157,
so the shape of the race is right.

Ranked by average finish rather than by chance of winning: a runner who is
reliably twelfth is a better bet than one who is fourth or fortieth.

**Expect about twenty places of error.** `backtest/runners.js` scores predicted
finishing places against what athletes actually did at Lane: mean absolute error
is 19.7 places. Individual forecasting eight weeks out is genuinely hard, and the
board should not be read as if it were tight.

Every group also finishes about five places worse than predicted. That is not a
bias in the model but the shape of the problem: roughly two dozen runners in each
real state field were not in the September database at all — call-ups, late
starters, athletes who had only raced 3k — and they take places from everyone the
model does know about. Open item 3 again.

### Regressing a lone mark

A single race used to be taken at face value while an athlete with two was judged
on both, so the less evidence there was the more generous the estimate. That is
backwards.

Measured properly — predicted place against real state results, split by race
count at the cutoff — the one-race athlete finished **2.8 places worse** than
predicted relative to the two-race athlete. `LONE=0.006` closes it:

| | before | after |
|---|---|---|
| one race, mean residual | +6.54 | +5.13 |
| two or more | +3.79 | +5.27 |
| gap | **2.75** | **-0.14** |
| team Brier, pooled | 0.0925 | **0.0919** |

The team board improves too, beating no-penalty in **99% of bootstrap draws** —
much stronger evidence than the ~66% that was rightly not acted on for `MARK_W`.
Re-fit with `backtest/runners.js` and `backtest/lone_mark.js`; both now measure a
penalty *on top of* what ships, so a healthy re-run should prefer 0%.

`buildModel` keeps `sbRaw` alongside `sb` — the time the athlete actually ran,
which is what the Runners board and the what-if roster display. Never show `sb`
to a reader; it carries the regression.

**A correction worth recording.** The first measurement of this effect compared
simulated rank against *season-best* rank and reported a seventeen-place gap.
That baseline is itself biased: a season best is a minimum, and a minimum of two
races is faster than a minimum of one, so ranking on best flatters whoever raced
more. Scored against real results the true gap was 2.8 places. When measuring a
bias, check that the yardstick is not bent the same way.

## Classifications

All five ship. The switcher above the Boys/Girls toggle changes `CLS`, and
`setClass(cls, gender)` repoints `LEAGUES`, `ABBR`, `LG`, `AUTO`, `AT_LARGE`,
`SC`, `PL`, `FIELD` and `TEAM_LEAGUE` before anything rebuilds. League
membership and berths live in the `CLASSES` block at the top of the script;
the seed carries a `class` column and `buildModel` filters on it.

OSAA does not use one rule, and the numbers are not symmetric across genders:

| board | leagues | automatic per league | at-large | field | scorers |
|---|---|---|---|---|---|
| 6A boys / girls | 7 | 2 each | 2 | 16 | 5 |
| 5A boys / girls | 5 | 2 each | 2 | 12 | 5 |
| 4A boys / girls | 6 | **1 each** | **6** | 12 | 5 |
| 3A boys | 4 | 3, 3, 3, 2 | 1 | 12 | 5 |
| 3A girls | 4 | 2, 2, 2, 1 | 1 | **8** | **4** |
| 2A/1A boys | 4 | 3, 4, 3, 3 | 2 | 15 | 5 |
| 2A/1A girls | 4 | 1, 2, 1, 1 | 3 | **8** | **4** |

`audit2.js` asserts every one of those ten boards: field size, scoring depth,
that no team is stranded outside a league, that short teams really are below the
scoring depth, and that exactly `FIELD` teams qualify and one wins per season.
93 checks pass; the only failure is the deliberate `scoreMeet` one.

**Verify against OSAA each August.** `osaa.org/activities/bxc/qualifications` and
the `gxc` equivalent, one page per classification. The allocation tracks how many
teams each district fields, so it moves.

**3A and 2A/1A girls score four, not five**, new for 2026. Seven may run, four
count, the fifth breaks ties, four are enough to field a team. `scoreMeet` takes
the depths; `buildModel` uses `SC` as both the minimum roster and the averaging
window.

**Those two boards have no history to check.** In 2025 athletic.net reports
`ScoreDepth: 5` for every division and the small-school girls raced 3A/2A/1A
combined, so the backtest cannot score them. Everything in `backtest/` is 6A. The
How tab says this outright — do not let the site imply otherwise.

### Rebuilding the database

`scratchpad` tooling, in order: scrape `osaa.org/activities/bxc/teams-leagues`
and the `gxc` page for 2026 membership (all five panels are in the DOM at once,
one table per league); resolve those names to athletic.net team ids from meets
already pulled; crawl every team calendar for meets with results; pull every
5,000m division; then build the seed with top three marks per athlete and top
seven per team.

Two things that cost time. OSAA and athletic.net spell schools differently
(`Benson` / `Benson Tech`, `Nelson` / `Adrienne Nelson`, `Jefferson, Portland` /
`Jefferson-Portland`) and several entries are co-ops filed under the lead school
(`The Dalles / Dufur`, `Heppner / Ione`, `Union / Cove`), so an alias table is
unavoidable. And athletic.net suffixes ambiguous names — strip a trailing
`(OR)` or the board will show `Cleveland (OR)` where it has always said
`Cleveland`.

Current coverage: 2,974 marks, 2,221 athlete-boards, 214 schools. Ten schools
have no athletic.net id and 43 more have an id but no 5,000m result yet; they
simply do not appear, the same as any team short of the scoring depth. Nearly
all are 1A schools that have only raced 3k so far.

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

`nextTick` schedules **both** a frame and a timer and lets the first to arrive
win: the frame while the page is painting, the timer at 150ms when it is not.
Every paced loop must use it rather than rAF directly.

It used to check `document.hidden` and then hand the tick to
`requestAnimationFrame`, which is a frame too late — a tab backgrounded *after*
that check leaves the callback pending with no way back, and the run is stranded
half-finished. That is not theoretical: the Runners board reproduced it every
time, because a browser that has stopped painting stops delivering frames while
`document.hidden` stays false. The belt-and-braces version also means a run
started and then left alone still finishes.

## Layout gotcha

Team cards and runner rows are absolutely positioned and moved with
`translateY`, so they sort smoothly during a run. The step height is **measured
from a rendered card** (`measure()`, `measureRun()`), never hardcoded — a
hardcoded 118px against content-sized cards is what caused overlapping cards
once already. Re-measure on resize, after a run finishes, and when a tab that
was hidden comes back: a hidden panel measures zero, so a board built while the
reader was elsewhere has a stale step and overlaps.

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
   of September top-five places are not on the line at the league championship,
   and about two dozen runners in each state field were never in the September
   database at all — which is most of why every athlete finishes about five
   places worse than the Runners board predicts.
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
