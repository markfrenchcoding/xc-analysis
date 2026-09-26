# Tualatin Distance — five headline features

Written before any code, as §0.4 asks. What is actually in the repo, what §A
still needs, how each feature is derived, and what it reuses.

## 0. Section A is not merged, and here is exactly why

The five-features brief says to land round 3 §A first. It is not landed. I
checked the case §A.1 cites rather than taking it on trust, and it is still
live — but the diagnosis is two lines, not a refactor.

`pull/build_dash.js` writes the two data blocks with **different rounding**:

```js
// d-seasons — raw
s.best5000 || ''
// d-results — hundredths
Math.round(+r.seconds * 100) / 100
```

So Tyler Williams' 2027 5,000m is `963.949` in `d-seasons` and `963.95` in
`d-results`. `mmss` rounds to tenths, and the two land either side of it:
**16:03.9 against 16:04.0 for one race.** Every symptom §A.1 lists follows from
that one asymmetry.

Two things worth knowing before the fix is scoped:

- **At hundredths the two sources already agree.** Career best from `d-results`
  against career best from `d-seasons`, all 1,112 athlete-rulers: **1,112
  agree, 0 differ, none missing either side**. The drift is entirely in the
  third decimal. My first audit rounded before comparing and reported "0
  differ", which is exactly the "match two floats and hope" mistake this
  project already has on record. Compare the stored values, not a rounding of
  them.
- **`sec * 100` is an exact float integer for all 16,020 result rows.** So
  moving `d-results` to integer hundredths is lossless. `d-seasons` is the only
  block carrying sub-hundredth noise, and only because nobody rounded it.

**Ties are real.** 15 boys' XC 5,000m times are shared by two or more athletes
at hundredths. Tyler Williams (963.95) and Nathan Love (964.00) are *not* tied
but both display 16:04.0 — which is §A.2's point: rows that display the same
need to show the hundredth that separates them, and rows that are genuinely
equal need to share a rank.

### What §A needs, in order

| | work | size |
|---|---|---|
| A.1a | `build_dash` writes both blocks as **integer hundredths**; the page parses to integer hundredths and keeps them as the storage unit | small, mechanical |
| A.1b | one `time.js`: `fmt(h)`, `parse(str)`, `cmp(a,b)` — every display goes through it; nothing else rounds | small |
| A.1c | per-grade bests derived from `d-results` like career bests already are, so `d-seasons` stops being a second source of truth for times | small |
| A.1d | `node --test` cross-view audit: every athlete × season × ruler best identical from both derivations, and every displayed string identical across views | new file |
| A.2 | one tie rule in `derive.js`, used by the Board, Run-against-history and the Record book | small |
| A.3–A.7 | scatter labels, ghost-race finish labels, two copy fixes, scroll restore | independent, small |

A.1 is a prerequisite for all five features. A.3–A.7 are not, and I would take
them in the same pass only because they are cheap.

**I have not started any of it.** §0.4 says to stop after this plan.

## 1. Architecture

### Modules: recommend NOT moving, and here is the measurement

The brief allows either. My recommendation is to **stay in one file, split into
fenced namespaced sections**, for three reasons that are specific to this repo:

1. **The CSP allows modules but not a Blob worker.** `script-src 'self'
   'unsafe-inline'` means `/js/*.js` would load. But `blob:` is absent, so an
   inline-Blob worker is blocked outright; a worker has to be a real
   `/js/worker.js` file. That is fine either way and does not depend on
   modules.
2. **`build_dash.js` rewrites the page in place** by regex, replacing eight
   `<script id="d-*">` blocks and the `INFO` constant. Modules do not break
   that — the data blocks would stay in the HTML — so this is neutral.
3. **The real cost is the deploy contract.** `tualatin/` is a second Vercel
   project with root directory `tualatin/` and preset Other. Adding `/js/`
   means the page stops being one self-contained file, which is the property
   `CLAUDE.md` names for both pages. Nothing in the five features needs
   modules; they need *boundaries*, and boundaries can be enforced without
   files.

So: **one file, hard section fences**, each section a single `const NS = (() =>
{ ... })()` with an explicit return, and a rule that a feature may only touch
`DERIVE`, `STATE` and `UI`. If that discipline visibly fails in review, moving
to `/js/` is a mechanical follow-up, because the namespaces are already the
module boundaries.

The one exception: **`/js/worker.js` as a real file** for the bracket's race-day
simulation. It is the only thing that genuinely needs to be off the main
thread, and the CSP permits a same-origin worker.

### Namespaces (sections, in load order)

```
TIME     fmt / parse / cmp, integer hundredths          (A.1b)
DATA     parse d-* once                                 (exists, unfenced)
DERIVE   memoised pure derivations                      (new; absorbs V, devCurve, packs, eventFit, FIT)
STATE    URL <-> state                                  (exists as parseRoute/routeNow/applyRoute)
UI       Card, Segmented, Tabs, Table, Tooltip, Slider, TimeInput, Sheet, Chip
CHARTS   kit (CH/CV, exists), wall, ghostRace, ...       (exists, needs the kit/feature split)
FEATURES runAgainst, bracket, recordBook, lineage, twins
COPY     every new string in one block
```

`DERIVE` is the only new concept. Everything else already exists under another
name; this is naming and fencing, not a rewrite.

### Derivations, all memoised, all pure

| name | input | output | cost |
|---|---|---|---|
| `bestsByRuler(sex, ruler)` | results | sorted `[{i, h, meetId}]` + rank map with the tie rule | ~16k rows, one pass |
| `seasonSquads(sex, ruler)` | seasons + results | per school year, the seven best | small |
| `rankAt(sex, ruler, hundredths)` | `bestsByRuler` | all-time rank + neighbours | binary search |
| `seasonPlaces(sex, ruler, h)` | `seasonSquads` | per season, the place that time takes | 22 × 7 |
| `recordTimeline(sex, ruler)` | results by date | step list `[{from, to, h, athlete, days}]` | one sorted pass |
| `top10AsOf(sex, ruler, date)` | results | ten rows | filtered pass; memoise by date |
| `residualSD(athlete, season)` | `FIT.res` | SD, shrunk to squad median under four races | exists as `FIT`, needs the SD |
| `mentorEdges()` | results + seasons | `[{a, b, weight}]`, top three per athlete | **the expensive one** |
| `trajectories(sex, ruler)` | seasons | per-athlete grade→VDOT vector | small |
| `twins(i)` | `trajectories` | top three by RMS VDOT | 750² worst case |

`mentorEdges` and `twins` are the two that could block input. `twins` is 750
vectors of at most four numbers — measured as trivial, no worker needed.
`mentorEdges` needs co-start counts over 8,876 XC results grouped by meet;
first-season-only and same-sex cut it hard. I will measure before reaching for
a worker: the brief's 50 ms bar is the test, not the guess.

### Routes

```
#/board?sex&event&view&q&you=16:40.0
#/history/bracket?sex&event&mode=paper|raceday
#/history/records?sex&event&asof=2016-06-10
#/history/lineage?sex&focus=<slug>
#/athlete/<slug>                      (twins live here, no new param)
```

`parseRoute` already splits `#/tab/arg?query`, so `history/bracket` needs a
second path segment — a small change to `applyRoute`, not a new router.

### Information architecture

Five tabs, `repeat(5, 1fr)`, one sliding underline. **This collides with round 3
§D.1**, which asks for a four-column grid and the same sliding underline. They
should be done once, as five columns, rather than four now and five later.

### Component set

`UI` gains: `Table` (with `<colgroup>`, centred numerics, `tabular-nums`),
`Slider`, `TimeInput`, `Sheet`, `Chip`. `Card`, `Segmented` and `Tooltip` exist
in effect and need extracting rather than writing. Round 3 §D.2 and §D.10
(tokens, table alignment) are the same work as "one component set" here, and I
would do them together for the same reason as the tabs.

## 2. Run against history (Board)

**Derivation:** `rankAt` + `seasonPlaces`. Both read `bestsByRuler`, which the
Board already needs, so the marginal cost is a binary search and 22 lookups.

**Reuse:** the Wall's own `x()` scale for the ghost marker (the Wall must expose
it rather than have it reimplemented); the Board row component for the "You"
row; `CH.table` for the fallback; `PAL` for the "See where 16:40.0 lands"
suggestion.

**New:** `TimeInput`, the season grid, the honesty line.

**The one judgement:** a time typed in is not an athlete, so it never enters
`bestsByRuler`. It is ranked against a copy. This keeps every existing number
untouched by construction.

## 3. The record book on any day (History → Records)

**Derivation:** `recordTimeline` and `top10AsOf`. Both are date filters over
results — no new data, and the timeline is one sorted pass.

**Reuse:** Board rows + FLIP; `CH` for the step line; the Board's segmented
controls.

**The generated sentence** is the risk: it must be true for every date, not most
of them. It gets a unit test over the whole date range, asserting the sentence
against an independent recomputation, plus one hand-checked date.

## 4. The greatest team ever (History → Bracket)

**Derivation:** `seasonSquads` for the field; the existing dual scorer for "on
paper"; `residualSD` for race day.

**Reuse:** `GHOST.score()` is already an NFHS dual scorer, and the drill-down is
`GHOST` preloaded with a pair — the brief says do not fork it, and the way not
to fork it is to give `GHOST` a `race(yearA, yearB)` entry point now.

**New:** bracket layout and the worker.

**Honesty:** on paper is deterministic and says so. Race day is a model, and the
copy states what the spread is made of and that a season's SD over three races
is a thin thing to draw 2,000 simulations from.

## 5. The lineage (History → Lineage)

**Edge rule**, stated here so review can argue with it before it is built: A is
linked to B when, in **A's first season**, B was **two or more grades** older
and they **started three or more of the same XC races**; same sex only; weight
is the shared-race count; **top three mentors per athlete**, and the copy says
the rest were dropped for readability.

**Reuse:** `CV` for the canvas base layer; `CH` for the SVG overlay; `TIP`.

**New:** the river layout and the crossing-reduction pass.

**The accessible fallback is the chain**, not a table: "Jayden Atkins ← … ←
2004" is the same information and is the thing worth reading aloud.

## 6. Career twins (Athlete page)

**Derivation:** `trajectories` + `twins`. Distance is RMS VDOT over shared
grades, minimum two, ties broken by shared-grade count.

**Reuse:** the spaghetti chart's grade axis and line drawing.

**Privacy:** `TWINS_SHOW_FUTURE = false`, left false. For a current athlete the
twin's line is drawn **only through the grades that athlete has completed**. The
flag is one constant and the drawing reads it, so there is no second code path
to forget.

## 7. What this reuses, in one list

`CH` / `CV` (chart kit), `TIP`, `PAL`, `GHOST` and its dual scorer, `FIT` (the
meet-term fit behind "Beat it by"), `V` (populations), the Board row markup, the
Wall's scale, `parseRoute` / `writeHash`, `wrapTables`, `wireCharts`, `nextFrame`,
`animate`, the trophy/medal chips, and the token set.

Genuinely new: `TimeInput`, `Slider`, `Sheet`, `Table`, the bracket, the river,
the worker, and `DERIVE` as a named boundary.

## 8. Budget and risk

- **60 KB excluding data.** The current page is 222 KB of code. Five features at
  the size of the Wall (7 KB) and the ghost race (8 KB) is roughly 35 KB, plus
  ~12 KB of `UI` and `DERIVE`. It fits, but not with room to spare, and the
  bracket is the one most likely to overrun.
- **The riskiest change is A.1**, because it touches every time on the page.
  The cross-view audit is what makes it safe, so it is written *before* the
  change, run against the current file to capture today's values, and then run
  again after.
- **Two published numbers may legitimately move** when per-grade bests move to
  `d-results`: anything derived from `o.grade[k]`, which is the development
  curve and the spaghetti chart. If they move, it is the third-decimal drift
  being removed, and it gets reported rather than absorbed.

## 9. Order

1. §A.1 + the audit, then §A.2 — **stop.**
2. Tokens, `UI.Table`, the five-tab nav (round 3 §D.1, §D.2, §D.10 folded in) — **stop.**
3. Run against history — **stop.**
4. Record book — **stop.**
5. Bracket — **stop.**
6. Lineage — **stop.**
7. Career twins — **stop.**

§A.3–A.7 ride along with step 1 unless review says otherwise.
