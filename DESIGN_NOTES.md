# Tualatin Distance — design notes

Written before Phase 1 of the visual upgrade. What is actually in the repo, what
is wrong with it, and the order I intend to fix it in.

## What the thing is

One self-contained file, `tualatin/index.html`, **566KB on disk and 167KB
gzipped**, 19,044 lines. No build step, no dependencies, no fetches. Deployed as
its own Vercel project with root directory `tualatin/`, so it cannot see the
repo above it.

```
pull/roster.js      athletic.net -> pull/roster/t284_{results,athletes,seasons}.csv
pull/tfmeets.js     championship track meets -> t284_tf_places.csv
pull/whoswho.js     Who's Who text -> ww_{team_rankings,four_year,state_best}.csv
pull/build_dash.js  all of the above -> eight <script type="text/plain"> blocks
```

Eight data blocks: `d-athletes`, `d-seasons`, `d-results`, `d-meets`,
`d-events`, `d-ww`, `d-tf`, `d-tfmeets`. Everything is parsed once on load into
plain arrays; `byA[]` is the per-athlete index everything else reads.

Four tabs, four renderers: `drawBoard` / `drawGrowth`, `drawProgram`,
`drawAthlete`, `drawJanuary`. `tab()` shows one and calls its renderer.

## What I found, in the order it bothers me

**There is no URL state at all.** `grep` for `location.hash`, `pushState` and
`replaceState` returns **zero**. Nothing on this site is linkable, the back
button does nothing, and a coach cannot send anybody a runner. This is the
single biggest gap and it is Phase 1's first job.

**Seven chart implementations, no shared module.** `barsSeconds`,
`barsGrouped`, `barsSimple`, `stackCols`, `twoLines`, `careerChart` and
`drawPack` were each written for one panel. They disagree about axis labelling,
tick density, colour, and whether hover exists. That is exactly the
inconsistency the brief calls out, and the fix is a scale/axis/tooltip module
that all of them take, not seven tidy-ups.

**One canvas, nine event listeners.** `drawPack` is the only canvas; every
other chart is SVG built as an HTML string. That is fine for the small ones and
will not survive the Wall or the spaghetti plot at 11,527 marks.

**Board rows are `<button>`, not `<a>`.** Better than the `div`s the brief
assumed, but still not linkable, still not middle-clickable, and the "who they
run with" chips and Plan cards are the same. They become real anchors once
routing exists.

**Tooltips are eight SVG `<title>` elements.** Native, so no touch, no
keyboard, no styling, and inconsistent about what they say. One shared tooltip.

**`tabular-nums` appears seven times** across a page built almost entirely of
numbers in columns. It should be a property of the numeric type token, not a
per-rule decision.

**The blank-region-while-scrolling bug is mine.** Nine elements carry
`.reveal`, which sets `opacity:0; transform:translateY(18px)` and waits for
`IntersectionObserver` to add `.in`. Scroll fast through the Program tab and a
whole card sits at opacity 0 until the observer fires and the 550ms transition
finishes. The content is there; it is deliberately invisible. Fix: reveal on a
much smaller offset, drop the transform-based hide for anything above the fold,
and never let a chart be the thing that is hidden.

**Contrast.** `.card .why` is `13px` in `--dim`. Measured, `--dim` `#8A7F87` on
`--surface` `#151217` is **4.83:1** — AA for body text, but only just, at a
size small enough that it reads as decoration. `--faint` `#6E636B` is
**3.24:1** and is used twice. Both want lifting.

## Constraints I am not going to break

- One file, no build step, no npm, no framework. Any helper is hand-written and
  inline.
- `connect-src 'none'`. No fetches, ever.
- `SHOW_CURRENT` and `noindex` stay as they are.
- **No statistic changes definition or value.** If a number on the page moves
  as a side effect of visual work, that is a bug and it stops the phase.
- Colour tokens already live on `:root` with a `[data-theme="light"]`
  override. Canvas code already reads them through `getComputedStyle`; anything
  new does the same or it will not theme-switch.

## Plan

**Phase 1, foundations.** Routing and real links first, because the empty
state, the command palette and "copy link" all depend on it. Then the reveal
bug, the shared tooltip, board row rhythm, contrast, `prefers-reduced-motion`.

**Phase 2, density.** Build the shared chart module first — scales, axes,
tooltip, DPR, resize, theme — then port the existing seven onto it, then add
the Wall. Porting before adding means the new charts cost less than the old
ones did.

**Phase 3, wow.** Ghost race, linked brushing, scroll-told intro, hero card.

Phase 2 item 5 asks for an annotation on the 2021 depth outlier. Confirmed from
the data rather than assumed: school year **2021 ran entirely in March, April
and May** — 15 meets, and **no autumn season at all**. That is the COVID spring
makeup year, and the annotation says the derived half of it (which months, how
many meets, no autumn) without naming a cause the data cannot show.

**The first count here was wrong and the reason is worth keeping.** I wrote 6
meets in March and April, because I filed each race by sport: cross country is
the autumn half, so its school year is `year + 1`. That rule holds for
twenty-one of these twenty-two seasons and is exactly wrong for the one it was
being used to find — 2020-21 ran its cross country season in **March 2021**, 116
races. The shortcut pushed all of them into 2022 and described the wrong months
on the wrong season. `thinSeason` derives the school year from the calendar
instead (July boundary), which is the actual definition rather than a
convenience.

It also does not look for a *low meet count*, which finds nothing: 2021 has 15
meets against a median of 23, nowhere near an outlier. It looks for a **missing
half**. That is the thing that is actually true about it.

## Budget

Page weight may grow by 40KB excluding data. Current 566KB / 167KB gzipped.
Board first render including the Wall under 300ms. I will measure rather than
assert, and report both.
