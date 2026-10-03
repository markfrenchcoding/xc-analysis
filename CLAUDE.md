# Chute — Oregon 6A cross country state odds

Monte Carlo simulator for OSAA 6A cross country. Simulates whole seasons —
seven league meets, at-large selection, then the state meet at Lane — and
reports each team's odds of qualifying, placing and winning.

Live: https://chutexc.vercel.app
Repo: github.com/markfrenchcoding/xc-analysis

**One repo, three Vercel projects, one push deploys all of them.** `chutexc`
serves this file from the repo root. `tualatinxctf` and `sherwoodxctf` serve
the school dashboards from `tualatin/` and `sherwood/` - see **A second
school**. All three must keep framework preset **Other**, and each carries its
own `vercel.json`, because a project inherits nothing from the root.

## Shape of the thing

**One file.** `index.html` at the repo root, ~800KB, no build step, no
dependencies, no backend. Vercel serves it statically. Everything — data, CSS,
simulation, UI — is in that file.

This is deliberate. The owner works through GitHub's web UI and does not use a
terminal or git CLI. Any change must survive being uploaded as a single file via
drag-and-drop. **Do not split this into modules, add a bundler, or introduce
npm.** If you need to work on it locally, edit the file directly.

`pull/refresh.html` is served from the same deployment and is the one exception
worth understanding, because it is not one. It is a maintenance page the owner
opens to rebuild the database; `index.html` never loads it, never links to it,
and remains a single self-contained file that can be dropped on GitHub on its
own. The rule is about the app, and the app is still one file.

The Vercel project framework preset is **Other**. It must stay that way — it was
set to Python for a while and every deploy failed in two seconds looking for an
entrypoint that did not exist.

## Data

Embedded as CSV in `<script id="seed" type="text/plain">` near the top of the
file. Columns: `gender,athlete,mark,grade,team,dist,class,race` - `race` is how
slow the race was that day, which the model divides by (see **Race ratings**).

- `gender` is `M`/`F`; `dist` is always `5000`
- one row per athlete per mark; duplicates are the point, not a mistake
- a `class` column selects the board: 6A, 5A, 4A, 3A or 2A/1A
- 9,590 rows currently across all five classifications: 3,623 athlete-boards,
  225 schools, up to twelve deep a team. Pulled through Oct 2, 2026 by the refresh
- the flag's draft reads `DATA` across every classification at once, so a name
  that only appears on one board is still draftable onto any other

**5,000m, plus 3 miles behind a setting.** The state meet and every league
championship are run at 5,000m, so that is the board. Short early-season races
(the 3k meets in late August) are dropped at pull time and the distance toggle
was removed from the site. A 3k is never converted: it is 40% short, and the
5k it implies depends on the athlete.

**Three miles is the one exception, and it is opt-in.** A Reddit reader pointed
out that Crater's girls had raced their top runners only at Woodbridge, in
California, over 3 miles. Measured: Brynn Davenport (15:58.7, 2nd in the
Sweepstakes), Adley Damon and Gwen Vanwart were on **no** 5k list, so the board
had Crater's girls on a 19:53 five when their real front end was two minutes a
runner quicker. Three miles is 3.4% short of 5,000m, close enough that the
distance is a small, well-understood correction and the course is the real
unknown - which is true of every 5k on the board too.

- The seed carries 3-mile marks as `dist` **4828**, at the time actually run.
  `buildSeed` keeps them as separate athletes for trimming, so the 5,000m rows
  are byte-identical to a seed without them, and a 3-mile row can never push a
  5k mark out of a slot. `divMetres` reads "3 Miles" and nothing else imperial.
- **The crawl reads every 3-mile race** (`wantDiv`), grade races included.
  Woodbridge alone is 67 divisions, about two minutes of requests a week. It is
  not only Woodbridge: athletic.net's Oregon 3-mile list counts 101 boys, and
  Crater's Sawyer Hutton ran his at the Bill Springhorn Classic in Oregon. The
  report prints a `3-mile races` line with the teams affected.
- **That list is not a source.** `xcRankings/GetRankings` returns the top five
  and blurs everyone below (`blurAfterDepth: 5`) unless the request is signed
  in. A signed-in pull would be scraping under an account that clicked through
  the terms, which is the strongest version of the exposure in the strategy
  notes. The crawl reads the same races through the meets, unsigned.
- **The site ignores them unless the reader asks.** "3-mile races" sits under
  Races simulated in the settings, `Leave out` by default. On, `buildModel`
  scales each mark by Riegel, `(5000/4828.032)^1.06` = **1.0378**, then by
  `1+MI_PEN` (= `LONE`) for being run on a course and at a distance the rest of
  the board never saw. **Neither number is fitted** - Oregon has too few 3-mile
  races to measure a conversion from - so it ships as a reader's option rather
  than as the default, and the backtest, the Track record and every snapshot
  run with it off.
- **A converted time is never shown.** `sbRaw` is what the athlete ran and
  `sbMi` says it was 3 miles. `miTag()` puts a gold **3MI CONVERSION** pill
  beside it. It was a bare "3mi" suffix first, and the owner read that as the
  3-mile time being raced against 5ks directly. On a phone every row that
  carries it truncates from the right, so the pill leads the Runners subtitle
  and takes its own line under the name in the team overlay and What if.
- It locks with the dials, reports in the collapsed summary, marks every board
  in the Next-season slot, and rides in the hash as `/3mi` so a shared link
  shows the same board. The Dream Team does not read it.

**What it does, Sep 29 crawl (results through Sep 26):** 181 three-mile marks
on 21 teams, from 103 races read. Crater girls go from 19:53 (3rd on
five-average in 5A) to 17:16 (1st, and the win is effectively certain), Crater
boys 5th to 2nd, Corvallis boys 9th to 5th, Caldera girls 13th to 6th, West
Linn boys 4th to 3rd in 6A. Teams whose 3-mile marks convert slower than their
5ks - The Dalles, North Medford, Phoenix - do not move. Woodbridge is a fast
course and the conversion cannot know that, so the size of Crater's jump is
overstated; the direction is what the setting is for.

Updating the database means replacing that block and committing. There is no
admin UI and there should not be — the app is customer-facing.

**Updating the database is two edits, not one.** Replace the seed block *and*
set `DATA_DATE` just above `FULL_MS` to the last day of results included. The
header reports it to readers as "Results through Sep 12"; leave it stale and the
site quietly lies about how fresh it is.

## The site

**Four tabs since Sep 30: Odds · Team · Races · About.** It was three - Odds ·
What if · How - and the coach tools had grown past it: "who do we have to beat"
and "who can't we lose" sat under the seconds steppers, the Lane table was filed
under How, and nothing linked a card on the board to its school. The four map
the site to its readers: the board for everyone, a page per school for coaches,
a race table for everyone after a weekend, and About for the proof.

- **Team** (`#p-wi`, still, so the What if code is untouched) is one school in
  the order a coach asks: where it stands (the board's own numbers when the board
  has been run on this classification and gender, otherwise the qualifying chance
  the next section measures - never a number from another board), who it has to
  beat (runs itself on open, briskly, and not again until something feeding it
  changes: `BEAT_KEY`), who it can't lose (seven paired runs, waits for a tap),
  then the seconds tool. The dials fold on arrival unless the reader chose.
- **Every team card's overlay** carries "X's team page", and `#6A/boys/Grant/team`
  opens it. `goTeam` sets `PENDING_TEAM` before the tab opens, because opening
  it starts the beat run - selecting afterwards ran the question for whichever
  school was first alphabetically. A run that finishes after the reader moved on
  re-runs for the school now selected rather than printing a stale answer.
- **A school's name opens its Team page wherever it is printed** (Oct 1):
  Leagues, the Runners board's team line, who-to-beat, Called it (team and
  runner views) and the Dream Team feed. `tlink(name, cls, g)` writes a real
  `<a href="#6A/boys/Grant/team">` and one delegated click handler calls
  `openTeam`, which switches board first when the link is from another one
  (Called it, the Dream feed) and closes any overlay. Delegated because Leagues
  is rebuilt twice a second. A team that cannot field five has no Team page, so
  `teamOk` keeps its name plain on the current board. The team cards are not
  linked: a tap opens the overlay, which already carries the team-page button.
- **A team with uncounted 3-mile runners says so where its number is** (Oct 1).
  `miHint` puts a line and a "Count 3-mile races" button in the team panel and
  on the Team tab when the setting is off and any runner's scaled 3-mile time
  beats their rated 5k best or they have no 5k. Crater boys sat at 0% to win
  while first in the coaches' poll, with the reason folded away in the dials.
- **A shared link below 6A opened under a 6A header** until Oct 1: `syncHead`
  ran in `loadSeed`, before the hash set the board. Every share card for 5A and
  below lands on such a link. It runs again after `setClass` now.
- **Every tab switch goes through `selectTab`.** The school search called its own
  copy of the panel toggle, so the pill stayed on Team while Odds was showing and
  Run kept whatever state the last tab left. It passes `keepScroll` instead, so
  the reveal is not fought by the scroll to the top.
- **The Team tab opens on the school you came for.** A search or a link naming a
  team sets `PENDING_TEAM`, so the tab no longer opens on whichever school is
  first alphabetically.
- **Run queues behind a Team calculation.** Both kinds of run share the button
  and `running`. Pressing it on Odds while a Team run was going did nothing,
  silently; now it reads "Up next" and `runQueued` starts the board when the
  Team run ends (`RUN_OWNER`, `RUN_AFTER`, cleared by `cancelRun`).
- **Races shows "that day" in seconds for the time typed in**: a race 1.2% slow
  reads "12s slow" at 17:00 and "11s slow" at 15:30, with the percentage under it
  (`t*(f-1)`, same basis as the Lane column). A minute or more prints as m:ss.
  "About average" (under 0.5%) keeps its label with the seconds beneath.
  The line above the table gives Lane's own allowance in seconds at the same
  time ("about 19 seconds for a 17:00 runner"). Headings are "vs avg race" and
  "at Lane", and the note says the middle column leaves Lane out: a reader
  asked whether "30s slow" already included Lane's 1.9%. It does not.
- **Simulated times are on an average-course scale, so anything labelled Lane
  multiplies by `LANE_F`** (`LANE.factor`, 1.0186). The team overlay's "at Lane"
  column, the Dream Team feed and its race clock all do. Before Sep 30 they
  printed the raw model time, so a runner whose only mark was on a slow day
  looked faster "at Lane" than she had ever run (Maeve O'Scannlain, Jesuit).
  The gap column subtracts like for like and prints through `sgn()`, which is
  what fixed the "+-19.6s" string.
- **Races carries a "!" note under the heading** (`.race-caveat`), at the
  owner's request: a rating does not know *why* a race was fast or slow -
  weather, hills, altitude, the competition and a mismeasured course all look
  the same - only how its runners did against their own form. Worded so it
  does not claim the rating ignores those things; it measures them together.
- **Races sorts by heading**: date newest first, race A-Z, and "that day" or the
  Lane time with the slowest race first; a second tap reverses (`RACE_SORT`).
- **Races** (`#p-races`) spans every classification, so `#ctl` hides there as it
  does on About.
- **Run is on every tab and the bar never changes shape.** It hid on Races and
  About at first, and the four tabs jumped to fill its space the moment either
  was tapped - every label sliding sideways under the finger. On Races and About
  it greys out and does nothing (`.idle`, disabled); on Team it runs the what-if.
  It briefly jumped to Odds and ran the board from there, and the owner preferred
  a button that plainly has nothing to do on this page.
- **Switching tabs slides.** One `.tab-pill` sits behind the tabs and moves to
  the pressed one (`movePill`, re-placed on resize and when the fonts land), and
  the new panel comes in from the side its tab is on (`in-r`/`in-l`, 28px and a
  fade). The old panel goes at once, because two long panels on screen together
  would stack. Taps only, no finger swipe between tabs: the boards carry
  horizontal scrollers, a slider and the course map, all of which a swipe would
  fight. The About styles are scoped
  `:is(#p-doc,#p-races)` so the race table shares them.
- At 375px each tab is 59px wide and 46px tall beside an 87px Run (49px at 320),
  in the same place on every tab.

**The proof is one tap from the board** (Oct 1, after an outside UX review).
Under the Teams legend, `.acc-note` carries "How accurate is this?", which
`openRecord()` takes straight to Track record; on every board but 6A it first
says no past seasons have been scored there yet. The Track record tiles now lead
with the `RECORD.byHorizon` row nearest today rather than September's, because
an eight-week 42% read in October as the model's one accuracy. The Called it
grid and the per-season table hold their first column (`position:sticky`) so a
row keeps its name when the weeks scroll. When the all-classification backtest
lands, the non-6A sentence has to change with it.

**About fans out.** It is the one tab holding three different things, so a tap
offers How it works, Track record and Called it as three cards that rise out of
the button and settle, bottom first - transform and opacity only, the overshoot
in the curve. The section on screen is marked in gold; Escape, a tap outside or
About again closes it, arrows walk it, focus returns to About. **On a phone About
sits mid-bar with Run to its right**, so the fan is right-aligned to About only
while its left edge clears 12px, and slides right otherwise - aligned blindly it
hung 52px off the glass at 375. The switch inside About stays for readers who
land there from a link.

**Odds fans out too, since Oct 2.** Teams, Runners, Leagues and the Dream Team,
four cards out of the Odds button, the same component as About's: one scrim,
one key handler, only one fan open at a time (`FANS`, `FAN_OPEN`, `fanFor`).
Odds is the leftmost tab, so its fan is **left**-aligned (`.fan-l`) and grows
from its own bottom-left corner, clamped 12px inside the glass at both ends. The
closing stagger reads `--n` off the fan (2 for About, 3 for Odds) - it was a
hardcoded `2 - --i`, which would have given the fourth card a negative delay.
Picking a view from the fan switches the tab only if Odds is not already on.
The switch inside Odds stays, as About's does.

**The mark is the way home.** Tapping CHUTE or the seven (`goHome`) closes any
overlay and fan, puts Odds and its Teams view in front and scrolls to the top.
It used to open the Dream Team, which now lives in the Odds fan.

**And the seven never sit still.** Every 0.9-2.3s, at random, one hollow dot
shrinks to a point and springs back filled while a random scorer opens a hole in
its middle and goes hollow (`markSwap`, `markNext`). Always five filled and two
hollow - five score, two displace - never the same five for long. Tapping the
mark trades a pair at once (`playMark`). This replaced the nine-second SMIL turn,
at the owner's request; a first version that only swapped on the way home and
then swapped back was "not what I wanted".

It is JS writing the circles' own `r`, fill and stroke in user units, not CSS
transforms: that is what the mark's history says to do. The "opening" is a
stroke as wide as the dot whose radius grows, so the hole starts at nothing.
State lives in `MARK.full`, not in which `<g>` a circle sits in - the inline
styles override `.pk-score`/`.pk-disp`. Every frame is computed from elapsed
time and a timer snaps the pair to its end state, so a tab that stops painting
cannot strand a dot half-filled. It idles while `document.hidden` (the desktop
app's Browser pane reports hidden when it is not in front, which is why a probe
there sees nothing move) and does not run at all under reduced motion. The
constants are `MK_*`, because `MARK_W` is the mark-weights table.

**Inside Odds, three views.** Inside
Odds a segmented switch chooses Teams, Runners or Leagues. That is the shape
because all three of those *are* odds — they were three sibling tabs for a
while, each with its own copy of the switchers and its own Run button, and it
read as three tools rather than three readings of one.

**One control block, `#ctl`, above everything.** Classification, Boys/Girls,
both dials and the single progress strip live there once. They used to be pasted
onto each panel, which is how What if ended up with a gender switch and no
classification switch, and how the Runners board ended up with no dials at all.
The block hides only on How, which is the one page with nothing to set.

**The dials fold.** They start collapsed to a line reading
`±2.3% · 5,000 seasons` (since Oct 1; they used to open until the first run
finished); touch the header once and that choice sticks for the session
(`dialsTouched`). A hundred and fifty pixels of settings above a
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

**Leagues runs at two rates, and that is the fix.** The structure - which teams,
in which order, in which league - is a full `innerHTML` rebuild twice a second,
which is as often as it needs to change. The **digits** churn every frame, by
walking the `.drow .v` text nodes that are already there and spinning each
one off a `data-v` attribute holding its settled value. Spinning only on the
rebuild was the first attempt and it was wrong: at two frames a second it reads
as a flicker, not as numbers arriving.

**Leagues churns its digits too.** It is rebuilt wholesale twice a second rather
than painted every frame, so it never picked up the `spin()` the other two
boards use and sat frozen while they were visibly working. Same function, same
`lock = frac²` curve, read off the live `RUN` so a finished board is left
alone.

**The leagues heading is generated, not written.** It used to say "The seven
leagues" on every board, including the five-league and four-league ones.
`syncViewText` builds it from `LG.length`, `autoTotal()`, `AT_LARGE` and
`FIELD`, and must be called anywhere `setClass` is.

Three things on the board beyond the odds themselves.

**Share image (Oct 2).** A button on the Teams and Runners boards draws the
board as a PNG on a canvas (`exportBoard`, `expDraw`): a **Post** at 1080x1350
with the top ten or a **Story** at 1080x1920 with the top fifteen, previewed in
the overlay with Share (the OS share sheet, via `navigator.share` with a File,
only where the browser can share files) and Save image. It reads the same `RUN`
the board paints from, in the board's own order, so the two cannot disagree.

- **Always the dark design** (`EXP_C` repeats the dark tokens): it is the brand,
  whatever theme the reader has on. The plates repeat the trophy `<defs>` stops
  by hand (`EXP_PLATE`) - a third copy, so change all three together. The seven
  are drawn from the mark's own coordinates (`EXP_DOTS`), skew baked in.
- **The settings are a fine-print stamp at the foot** (`expStamp`): board,
  this/next season, results-through date, seasons run, race-day spread plus
  drift, and whether 3-mile marks were in. The owner asked for the settings to
  be included subtly; a screenshot travels without the site.
- **Crests are drawn cross-origin.** googleusercontent answers
  `Access-Control-Allow-Origin: *`, so `crossOrigin="anonymous"` keeps the canvas
  exportable; a crest that fails or takes over five seconds falls back to
  initials instead of tainting the canvas. **The CSP has `data:` and no `blob:`
  for images**, so the preview and Save use a data URL, and Share hands the OS a
  File from `toBlob` (no fetch, so no `connect-src` either).
- The figure's unit ("WINS STATE", "AVG PLACE") prints on the first row only;
  ten repeats of it was noise. Trophies only on the Teams image - a runner did
  not win a plaque.

**1-5 average and spread.** A quiet line under each card's name: the mean of
the scoring five's season bests and the gap from first to fifth (`packOf`,
`packLine`), on the overlay and the Team page too. Times as run (`sbRaw`), never
the rated or regressed figures; "1-4" on the boards that score four. If a 3-mile
mark is among the five the line shows dashes, because averaging it with 5ks
would mean showing a converted time. Every card carries the line so the measured
step stays uniform; on desktop `.tc-big` spans four rows now, not three.

**`fmt` had the carry bug too.** The page's own formatter floored the minutes
and then rounded the seconds, so 959.96s printed "15:60.0" - the third copy of
the fault recorded under **Rebuilding the database**. It rounds to the tenth
first now.

**Average points.** Each card carries the team's mean score at Lane underneath
its chance of winning, averaged only over the seasons it actually qualified —
teams that never get there show a dash rather than a fake zero. `blankTally`
carries `ptsSum`/`ptsN` and `playState` fills them.

**The mark.** Seven runners: five filled, six and seven drawn hollow, because
five score and two displace. It is the rule the simulator runs on, drawn.

It used to be sixteen - the seven against nine more of the field at 34% - and
the field was dropped because the favicon had been carrying the seven alone
since the start, and the seven alone is the better mark. The page and the tab
are now the same drawing at two sizes, which is what a logo should be. The
coordinates were recomputed rather than transformed, scaled 1.468 about the
group's own centre so the seven fill the square the sixteen used to; the
`stroke-width` on the hollow pair and the surge translates were scaled by the
same factor, or they would read as thinner and smaller against bigger dots.

Three things about it are load-bearing:

*The lean is the wordmark's.* CHUTE is set in Anton with `skewX(-8deg)`, and the
seven carry the same eight degrees so the two read as one object rather than an
icon beside a word. **The skew is baked into the coordinates, not applied as a
transform** — skewing a circle turns it into an ellipse. The formation leans;
the runners stay round. If the wordmark's angle ever changes, the seven `cx`
values have to be recomputed, not re-transformed.

The same rule is why the enlargement is baked in too, though for a second
reason: `.pk-team` already owns `transform` for the surge, so a scale parked
there would be overwritten the moment anyone tapped the mark.

*The tab icon is the same drawing, and still a separate copy.* It is a data URI
and therefore cannot use custom properties: the accent is hardcoded `#F0455C`,
which reads on both a light and a dark tab strip. Change the accent and that hex
has to change with it. It reaches its size with a transform where the page bakes
it into the coordinates, so the two are not literally the same string - if the
formation is ever redrawn, both need it.

**The tab says `Chute` and nothing else.** It used to carry
"— Oregon cross country state odds", which is a description rather than a name
and read as noise in a row of tabs.

*The seven used to turn once when idle* - a SMIL `animateTransform` every nine
seconds. Retired Oct 2 for the trading dots above. The note about why it was SMIL
still holds for anything that moves the formation: CSS on `transform-box:fill-box`
once threw the whole mark off the side of the owner's phone. The Odds empty
state's five dots drift out of step (`esBob`), odds not yet settled, and stop
under `prefers-reduced-motion`.

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

**The dials lock while a run is in flight.** They are the inputs to a run, and
the run has already read them: moving the variance slider mid-run left the strip
reading a number the simulation was not using, which is worse than not being
able to move it. `lockDials()` disables both ranges and the preset buttons,
and is called wherever `body.simming` is set or cleared.

**The top four carry the state trophy, not a rank chip.** OSAA's award is a
walnut plaque cut to the shape of Oregon with a metallic plate inset on it, so
that is what ranks one to four show: the state outline in wood, the plate in the
same `--t1`..`--t4` finishes the distribution bars use, and the place
engraved into it. Four, because OSAA awards four trophies - the same reason the
bars colour four places and nothing below.

The base is deliberately left off. At forty pixels a stem and foot become two
grey pixels under the shape and cost the silhouette its readability.

**The outline is computed from real coordinates**, not sketched. The first
attempt was drawn by eye and read as a torn rectangle. `pull/oregon-path.js`
carries 65 waypoints - the Columbia from Astoria to Wallula, the straight 46th
parallel to the Snake, the Snake down the Idaho line, the `-117.03` meridian,
the 42nd parallel west, and the coast back up past Cape Blanco - and projects
them with **x scaled by cos(44°)**, because a degree of longitude at Oregon's
latitude is 0.72 of a degree of latitude on the ground. Without that the state
comes out at 1.89:1 instead of its real **1.354:1** and nothing else you do will
make it look right. Cape Blanco is what stops it reading as a box; do not
simplify it away.

**The wood frame is a stroke, not a second copy of the shape.** It used to be
the path scaled to 0.8 behind the fill, which is not how a border works - a
uniform scale about the centre leaves more wood at the ends than across the
middle, so the plaque was thick at the coast and thin along the top. One path,
stroked at 4.4 units with `paint-order:stroke` so the wood sits under the
plate, gives the same thickness the whole way round.

Three things about it. **An SVG gradient cannot read a CSS custom property**, so
the four plate gradients repeat the `--t1`..`--t4` stops by hand in a
`<defs>` block at the top of the body - change one and change the other.
**The trophy is not skewed**, unlike the plain chip: the lean belongs to the
wordmark and to things that read as type, and a leaning plaque looks like it is
falling over, which is why it gets its own `rankPopFlat` keyframe. And
`paint` only rebuilds the mark when its *kind* changes - into the trophies,
out of them, or between two finishes - because ranks five and below just need
new text, which is most cards on most frames.

**The plate number is centred by geometry, not by a guessed baseline.**
`dominant-baseline="central"` with `y` at half the viewBox height puts the
optical middle of the glyphs on the middle of the shape. Checked by measuring
both bounding boxes rather than by eye: the text centre lands at 49.5, 36.9
against the plate's 50, 36.9.

**Nothing about a place should read as black.** `--t4` was
`#868C96 -> #24272D`, which on the 4th-place distribution bar and its legend
swatch read as no colour at all rather than as a finish. It is pewter now, the
same metal as the fourth trophy plate, in both themes.

**The number is solid black, which is why the plates were lightened.** The four
plate gradients are the same four finishes as `--t1`..`--t4` but a good
deal lighter, because black has to read across the whole plate and not only
across its top half. Darken them back and the ink disappears into the bottom of
the blue and the pewter.

**The coaches chip is a fixed 56px, centred, with the league to its left.** Unranked teams render an empty `.poll-gap` of the same width rather
than nothing, or the league abbreviation shuffles left and right down the board.
It reads `OSAA #10`, because two unlabelled hash numbers on one row is the
same failure the Track record page had.

**There was a glow on the leading card and it is gone.** The first thing anyone
asked about it was what it meant, which is the answer: the rank mark already
says who leads, so the ring was a second unlabelled signal for a fact the card
states outright. Nothing on the board should need a legend it does not have.

**Crests.** `LOGO` maps display name to a school's mascot image, and `crest()`
falls back to initials when a name is missing. It covers the schools in the
seed; before the other classifications shipped it held only the 6A 47, so every
5A-and-below card fell back to initials.

**Crests refresh themselves now.** They used to be their own 167-request pass
against `GetTeamCore`, paced at 900ms because at 320ms a request 105 of them came
back empty. That is gone: the single `GetTree` call the refresh already makes to
find Oregon's team ids carries `MascotUrl` on the same rows, so the map is
rebuilt for free every time the database is. See **Rebuilding the database**.

Two details survive in `patchLogos`. The url comes back protocol-relative
(`//lh3.googleusercontent.com/...`) and unsized, so it needs `https:` in front
and `=s96` behind. And the map is keyed by the seed's display name, not
athletic.net's spelling, or `Cleveland (OR)` misses `Cleveland`. It merges
rather than replaces, so a school with no athletic.net team this season keeps
the crest it already had.

**Results-through date.** Driven by `DATA_DATE`, rendered into the header on
load.

**The header credits athletic.net, and links to it.** It reads "Through Sep 26
· athletic.net" - "Results through" was dropped to keep it on one line at 375px;
at 320 the whole header column is 115px and every line wraps anyway. The How
tab says the same under the database counts. Added Sep 30, when the site had no
credit anywhere and a data-access request to athletic.net was about to go out:
every number on this site is their data, and it should say so.

**The site opens dark, whatever the machine prefers.** It used to read
`prefers-color-scheme` on load and switch to light, which meant most visitors
never saw the design as it was built - the board, the crests and the pace line
are all drawn against the dark ground first, and the light theme is the
alternative rather than the other half. The toggle is still there and still
works both ways; this only decides where a visit starts.

It does not remember a choice between visits, deliberately: "default to dark on
entry" and "remember that I picked light" are different promises, and only the
first was asked for. Adding `localStorage` would be a couple of lines if the
second is ever wanted.

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

**The marker goes on every board, because the toggle always reached them.**
Teams, Runners, Leagues and What if are all painted from the one model
`buildModel` returns, so next season applied to all four from the first commit -
but only the Teams board carried the "Next season" strip, which made the other
three look as though they had ignored the switch. They had not; they just said
nothing. The strip is on `#board`, `#runOut`, `#lgOut` and `#wiOut` now.

Worth generalising: a control that changes shared state needs its evidence on
every surface that state reaches, or the surfaces that stay quiet read as
broken.

**Next season, which is this season minus its seniors.** A switch in `#ctl`
beside Boys/Girls sets `NEXT_SEASON`, and `buildModel` drops every grade-12 row.
It lives there rather than in its own view because it changes the *input* to all
three Odds boards at once, which is the same reason the classification and
gender switches live there: one run, three readings.

**It is a returning-runners board, not a forecast, and the difference is the
roster cap.** The seed keeps each team's fastest seven and nothing below, so a
squad losing four seniors shows three returners when the real team has a dozen
more runners the database has never heard of. Nobody arrives either - no
incoming freshmen, no year of improvement - so every team is understated, and
the senior-heavy ones are understated worst.

It was large before the cap was raised: 6A boys went from 45 teams able to field
five to **26**. At twelve deep it is **44 of 46**, and the board reads sensibly
again - Franklin 58% rather than the 87% it showed when its rivals had vanished.
The note under the switch is still generated rather than written, and still
carries the live count, because how much survives changes with the
classification and the gender.

**The cap is twelve, not seven, and that is why.** `ATHLETES_PER_TEAM` in
`pull/seed.js` was seven because seven is what a team races - right for this
season's board and wrong for any question about a roster that is not this one.
Twelve gives the returning seven somewhere to come from.

It changes nothing about this season: `buildModel` slices to the top seven
regardless, so the board is built from the same runners it always was. The only
cost is seed size. Do not "tidy" it back to seven.

One subtlety worth knowing: the seed ranks by raw best mark, `buildModel` ranks
by `sb`, and `sb` carries the lone-mark regression. Under a seven cap those two
orderings could disagree at the boundary, so an eighth-fastest athlete with two
marks could outrank a seventh with one and never get the chance. A deeper cap
removes that quietly as well.

**The flag: your Oregon Dream Team.** The fourth card in the Odds fan opens a
draft (it was the mark, and before that a checkered flag). Pick any seven athletes in the state — any school, any classification —
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

**The Dream field needs a full seven, not a scoring five.** OSAA scores with
five and the season boards use that rule, but this is an exhibition against the
sixteen fastest schools in the state and the field is picked on a *top-five*
average. A school with five good runners and nothing behind them got in on a
number that ignored the two it could not fill, then sent whoever was left onto
the course. That is where the dots crawling a minute behind the field came from:
the Banks girls made the sixteen on a 20:30 five and their sixth runner is
25:01, seven minutes off the leader. Requiring seven drops them, lifts McDaniel
in, and takes the slowest runner on the course from 25:01 to 23:10. The boys'
field does not change.

The remaining spread is real and should stay. Seven run and five score, so sixth
and seventh runners are genuinely that far back, and `SPEED` already compresses
the race so the last of them still finishes inside ten and a half seconds.

Worth recording because the first guess was wrong: the suspicion was that the
race was pulling runners down to a team's twelfth. It was not. `stateModel` has
always done `roster.slice(0,7)`, and measuring every team in the field confirmed
all sixteen were at seven. The roster cap was innocent; the *entry* rule was not.

**The classification switcher does not reach the draft**, deliberately. The
board behind it still says 3A or 2A/1A; the race is always all of Oregon.

**The gender switcher does not reach it either, but the draft has its own.**
`DR.g` starts from the board so the first open is never arbitrary, and after
that the switch in the draft header owns it - `draftPool` and `stateModel` both
read `DR.g` rather than `gender`. Before this, seeing the girls' Dream Team
meant closing the draft, changing the board and opening it again, which is three
steps to answer a question nobody was asking about the board.

Switching sides clears the picks and cancels any race in flight, because it has
to: a boys' seven cannot line up against the girls' sixteen.

**Drafted runners are ghosts.** Their own school still lines up with them, so a
star drafted away is on the course twice and the results feed will show the same
name at 3rd and at 43rd. Taking them out of their school would drop it below the
scoring five and quietly change the field they are being measured against, so
the duplicate is the lesser distortion. **The draft no longer explains this** -
the clause was cut for being more confusing than useful - so the behaviour is
recorded here instead. It has not changed.

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

**It rains for the length of the race, from four clouds.** Not a filter over
the whole panel - that version was tried and it read as a screen effect rather
than weather. Each cloud is a cluster of ellipses in the sky with its ground
footprint in `data-fp` and its lift in `data-h`.

The physics falls out of the projection for free: a drop falling straight down
in the world moves straight down the screen from the cloud to the ground point
directly beneath it, so **the landing y is simply that point projection and the
collision test is one comparison**. Spawn a drop at a random point in the
footprint quad (bilinear on the four projected corners), start it a lift above,
accelerate it down, splash and respawn when it arrives. A hundred and seventy of
them on one canvas drawn in viewBox units, updated from the same loop that moves
the runners.

The drop colour is the `--rain` custom property rather than a `color-mix`,
because a canvas cannot resolve one. It has a value per theme and is read once
at the gun.

**The clouds drift, and that has to happen in JS.** A CSS animation would move
the cloud and leave its rain behind. A pure screen-horizontal shift corresponds
to a real world direction under this projection, so offsetting the cloud and its
spawn x by the same `dx` keeps every drop landing directly beneath the cloud it
came from. All four move the same way at slightly different rates, which reads
as parallax. The drift runs off the wall clock rather than accumulated frame
deltas - a slow frame rate should make the weather coarser, not slower.

**Ten seconds end to end.** The winner crosses at eight, which puts a normal
spread at about ten, and the whole race is capped at ten and a half for the
times a drafted seven includes a twenty-eight minute runner.

**The map stays up after the race**, with all hundred and nineteen superimposed
on the finish. It used to fold away; keeping it means the reader can still see
where the race happened while they read who won.

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

**Nothing the site publishes is typed in any more.** The How tab used to hardcode
eight figures and they drifted exactly as predicted: it was still claiming two of
four champions after a model change had made it one of four, and 96% for a band
that had become 94%. Those numbers live in a generated `RECORD` constant now and
the **Track record** view renders from it.

```
node backtest/publish.js               # 20,000 seasons, 5,000 for the horizon sweep
node backtest/publish.js 20000 12000   # what is currently published, about seven minutes
```

**Re-run it after anything that touches the model.** The qualifier count, the
calibration bands and the champion record are stable run to run. The horizon row
is the noisy one, which is why the published figures come from a 12,000-season
sweep rather than the default — at 4,000 the eight-week best sigma flickers,
which is the difference between a claim that reproduces and one that does not.

**Check the sweep did not simply run out.** It returned exactly 6.0% when 6.0%
was the top of `SIGMAS`, which is not a measurement. The range goes to 9.0% now
and still picks 6%. Any answer equal to the first or last entry should be
treated as unmeasured until the range is widened.

`publish.js` also writes a readable cutoff label rather than a date, because the
seasons do not share a cutoff *date*, only a cutoff *week* — every first cutoff
is exactly 8.0 weeks from its own state meet. Each season's state meet date is
recorded in its truth file; a hardcoded table produced NaN weeks the moment a
season was added.

**What the Track record view says, as of the last run** (four seasons, September
cutoff, race-rated marks, scored at the 5.5% the board runs eight weeks out):
108 of 144 actual qualifiers inside the board's top group, 3 of 8 champions
named, pooled Brier 0.1374 against 0.2365 for knowing nothing, **42% skill**.

**And at every horizon, with today's row lit** (`RECORD.byHorizon`, "How close to
Lane changes everything"): 8 weeks 108/144 and 3 of 8 champions, **6 weeks 127/144
and 5 of 8**, 4 weeks 129/144 and 5-6 of 8, 2 weeks 129/144 and 4 of 8. The
four-week champion count flips between 5 and 6 from one publish to the next: a
close race's favourite, decided by Monte Carlo noise at 12,000 seasons. Quote it
as a range, never as one number. The
September headline is one reading of a season; somebody looking at the board in
October is five or four weeks out and that row is theirs. The old model at six
weeks found 123 and named 4 - a plain season-best list had beaten it there, 127
to 123, and race ratings are what closed that.
Teams called 90%+ qualified 90% of the time, and the 70-90% group, which used to
come in at 50% on a call of 81%, now comes in at 76%.

**The About pages lead with the checkpoint the board has reached (Oct 2).**
`headRow()` is the latest of the four tested points (8, 6, 4, 2 weeks before
Lane) that `weeksOut()` has reached: six weeks now, **four from the first crawl
with results through Oct 10**, two from Oct 24. The How tab's opening, every
Track record tile, the checkpoint table's "today" row, the calibration chart,
the season-by-season table and the winners line all read that one row, so the
page can no longer quote eight weeks in one sentence and six in the next, which
it did.

**The Track record speaks plainly now.** Asked for by the owner: "better than
guessing" was vague because nobody guesses - they read a list. So every figure
sits beside **a ranking of season bests** (fastest five-average goes), which is
what readers actually look at: 127 qualifiers to 115 at six weeks, 5 champions
to 3. The Brier decimals and the dial percentages are gone from the main text;
the spread is told as seconds on a 17:00 runner, and the raw scores sit in a
closed "For anyone checking the maths" drawer. It still names the method, never
the site. It also says outright that at six weeks season bests run through
OSAA's rules catch exactly as many qualifiers as the board (127 each): the edge
over a list on *who* qualifies is the rules, and the board's own contribution is
how sure to be.

`publish.js` writes what that needs: per checkpoint, `picks` carry each season's
found/field/champion, `bands` the calibration groups, and `vsRanking` carries
`rankChamp` and `rankPicks` (the ranking's fastest five, and whether it won).
Republished Oct 2 at 20,000/12,000: 108/127/128/129 qualifiers, champions
3/5/6/4 - the four-week count flickers between 5 and 6, as recorded - and the
ranking 112/115/119/120 with 3/3/5/4 champions. At eight weeks the plain ranking
finds more qualifiers than the board, 112 to 108, and the page says so.

**The headline is scored the way the board runs, and it used not to be.** It was
scored at the bare race-day dial, which in September is a spread the board never
uses. When the dial was corrected from 2.3 to 1.6 the headline fell from 35% to
32% while the board itself improved, which is how a scoring convention reads as a
regression. `publish.js` now runs the horizon sweep first and scores September at
the eight-week best and the late column at the four-week best, and the page says
the spread was chosen on the same four seasons, so it is a best case.

**The page reports the horizon and the density, not one flat number.** A single
pooled figure reads as "this model is 35% skilful", which is false in both
directions: the same boards scored four weeks out instead of eight land between
64% and 89%, and the September figure tracks how many marks existed at the time
(580 by the 2023 cutoff, 973 by 2024). RECORD carries `marks`, `skillLate`,
`weeksOut` and `weeksOutLate` per season, so the Track record table shows both
columns and names which is which. The live board runs on more marks than any
backtest season, which is why these figures are a floor rather than an estimate.

**The cutoff is described by its horizon, not its month.** The four seasons do
not share a date - Sep 9, 10, 13 and 14 - but every first cutoff is exactly
eight weeks from its own state meet, so that is what the page says.

**The calibration wording was wrong and now derives from the bands.** On
two seasons it was honest at both ends and overconfident only in the middle. On
four it is overconfident nearly everywhere: below-10% teams qualified 11% of the
time, above-90% teams only 85%, and the 70–90% band averaged a call of 81% and
came in at 52%.

Both of those are September numbers and September is the thin end — see the
backtest section. At the October cutoffs the same model runs 72% to 81% skill
across all four seasons. Whatever the page ends up saying, it should not quote a
single pooled figure as though the model had one accuracy.

**Do not read the favourite off a list sorted by P(qualify).** Half the field
sits at 100% to qualify and those ties break arbitrarily, so the first row is
not the team most likely to win. `backtest.js` made exactly this mistake and
reported the champion record as three of four when the harness said two — the
published claim was overstated until it was caught. (It is one of four now: the
MARK_W and LONE fixes changed which team the model favours in 2024.) Both `backtest.js` and
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

**`sbRaw` is the fastest time actually run (`bestRun`), and for weeks it was
not.** It was the raw time of the best *rated* mark, which since race ratings is
often a different race: Gus Kirby showed 16:16 (Ultimook, rated 9% slow) where
he ran 15:30 at the Mook. An audit on Sep 30 found **972 of 3,562** athletes
showing a "best" that was not their best, 639 of them by 20s or more. It is taken
before the top-three slice, a 5,000m best beats a 3-mile one, and `draftPool` and
`stateModel` use the same helper. Nothing the model runs on changed.

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

**It runs itself.** `pull\install-schedule.cmd`, double-clicked once, puts a
weekly job in Windows Task Scheduler: `crawl.js` crawls, rewrites `index.html`,
commits and pushes, and Vercel redeploys on the push. `pull/README.md` is the
operating manual. The browser harness at
[/pull/refresh.html](https://chutexc.vercel.app/pull/refresh.html) is still there
for running it by hand from any machine, and is the fallback if the scheduled run
is ever wrong.

**It cannot run in the cloud, and that was measured rather than assumed.** A
serverless function or a CI job was the obvious design. Cloudflare answers a
**datacenter address** with a challenge page whatever asks: from a GitHub Actions
runner both `curl` and Node's `fetch` got `403` and `Just a moment...`. From an
ordinary home connection curl is served normally. So the scheduled job lives on
the owner's machine, and there is no serverless function and no Action. Do not go
looking for a cloud host that happens not to be blocked — the block is the site
saying what it wants.

**Why `crawl.js` talks through curl.** Node's own fetch is challenged even from a
home connection and even given perfect browser headers, because undici's TLS
fingerprint is unusual; curl is served. Nothing is being worked around - from
that address curl is simply allowed. The upside is real: curl can read a `429`
and its `Retry-After`, which the browser cannot (see below), so the headless
backoff is informed where the page's is blind.

**The unattended run refuses more readily than it writes.** `crawl.js` exits 0
only when it wrote; 2 when it would not, and 3 when nothing had changed. It
refuses on a seed that shrank by a tenth, on any meet that never answered, and on
most races coming back empty. A job nobody is watching that writes anyway is
worse than no job, because the failure arrives as a quietly wrong board rather
than as an error.

```
node pull/test_seed.js        # 120 checks, no network
node pull/test_crawl.js       # 8 checks on the write guards
```

**`seed.js` is the only thing the two crawls share, and that is deliberate.**
Their transports have nothing in common — `fetch` under CORS against `curl`
through a child process — and their backoffs differ for a real reason, because
only one of them can read a 429. But the *reading* of athletic.net is identical,
so `divMetres`, `resultRow` and `teamsFromTree` live in `seed.js` where both get
them and the tests cover them. Left duplicated in the two crawlers they would
drift the first time a field was renamed, and the browser would go on working
while the scheduled run quietly rotted.

It round-trips the shipped seed: feed all 3,645 rows back in and the same 3,645
must come out.

**Oregon is division 87377** (`World > United States > High School > Oregon`).
One `GetTree` call returns 765 alignment rows over 438 schools carrying both
`SchoolID` and `MascotUrl` — which retired two whole steps. Team ids no longer
have to be resolved from meets already pulled, and the crest map is no longer a
separate 167-request pass; both fall out of that single request. 230 of the 231
board schools have an athletic.net team. **Elgin** does not, and cannot be
aliased into existence.

**The alias table was mostly backwards and is now three entries.** `CLASSES` is
the authority on what a school is called and it already spells the awkward ones
athletic.net's way — `Benson Tech`, `McDaniel`, `Adrienne Nelson`,
`Ida B. Wells`, `Jefferson-Portland`, `The Dalles`, `Heppner`, `Union`. Aliases
written the other way round (OSAA → athletic.net) actively *broke* three
matches. Only `Livingstone Adventist Academy`, `Northwest Christian Academy` and
`Valor Christian International` genuinely differ. Map athletic.net → the board,
never the reverse. Stripping a trailing `(OR)` still matters, or the board shows
`Cleveland (OR)` where it has always said `Cleveland`.

**Distance is in the division's name and nowhere else.** There is no distance
field: `"5,000 Meters Varsity"`, `"3,000 Meters Novice"`, `"3 Miles Varsity
Boys"`. `divMetres` parses it. The imperial divisions are dropped on purpose —
the board is 5,000m and nothing is ever converted — so a meet whose only races
are 3-mile races correctly contributes nothing, and a log line reading `0
results` there is right rather than broken.

**Summer is not the season.** athletic.net files July running-camp time trials
under the same season (`"5,000 Meters Week 1"`, Steens Mountain, 374 results).
`SEASON_START` cuts at mid-August, which is where OSAA practice opens.

**The rate limit is per endpoint, and JavaScript cannot see it.** This is the one
that broke the first live run, seven meets in a row, and it is worth knowing
before touching the pacing.

`GetResultsData3` allows about ten requests per ten seconds and nothing else
shares that budget: hammer it until it 429s and `GetMeetData` and `GetTeamCore`
still answer 200. That asymmetry is the whole shape of the crawl — the calendar
stage makes 450 requests without a scratch, the results stage falls over.

When it trips, Cloudflare answers the CORS **preflight** with `429` and
`Retry-After: 17`, and that reply carries no `Access-Control-Allow-Origin`. The
browser therefore refuses to show it: `fetch` rejects with `TypeError: Failed to
fetch`, and both the status and the retry hint are unreadable from the page. It
looks like a network error and is not one. **The fingerprint is the timing** — it
fails in about 20ms, and nothing real fails that fast. `curl -X OPTIONS` is how
to see the truth; the browser will never tell you.

So results POSTs sit at **2 seconds** — measured, not guessed: at 1.0s spacing it
trips on the eleventh request, at 2.0s it ran fourteen for fourteen clean. That
gap also keeps Chrome's preflight cache warm, since the server sends no
`Access-Control-Max-Age` and the default is about five seconds, so a POST inside
that window costs one request rather than two. A suspected limit backs off
**30s, 60s, 120s, 180s**, blind. Retrying after two seconds is worse than not
retrying at all: each attempt spends another preflight and re-arms the limit.

The preflight cannot be designed away. The endpoint demands
`Content-Type: application/json` (`text/plain` returns 415) and the
`anettokens` header (without it, 403), and either alone forces one.

**A meet that beats the retries is set aside, not dropped**, and swept again
after the run when nothing else is competing for the endpoint's budget. Whatever
still fails is counted in the report, because a seed quietly missing six meets
looks exactly like a seed that is fine.

**An empty race is usually just an empty race.** I guessed the opposite first and
was wrong, and the wrong guess is the instructive one. Asked too fast this API
is documented to answer with blanks rather than 429s, so an empty `resultsXC`
looked like a throttle worth retrying, and the `teams` array looked like the
signal — populated when throttled, empty when the race never ran. It is not:
`teams` is the *meet's* entry list and comes back populated either way. Division
1099351 at meet 275793 is simply a JV girls race with no results posted, and the
heuristic sat there backing off for 28 seconds against a race that was never
going to answer. Nothing in a single response distinguishes the two cases. So
the code does one cheap retry and then believes it, and puts the suspicion where
it can actually be evaluated: if more than 40% of a run's races come back empty,
*that* is the shape of being rationed, and the report says so.

**The report is the safety rail.** The summary prints what was dropped and why,
and shouts if the seed shrank by more than a tenth — which is what a partial
crawl looks like from the outside. Do not upload a file that shrank without
reading the log.

**`fmt` rounds once, and flooring the minutes first is the bug.** The seed
shipped `20:60.00` for Landon McBride. `Math.floor(s / 60)` took the minutes
and `.toFixed(2)` rounded the remainder, so the two halves disagreed: 1259.9963
floors to 20 minutes and rounds to a 60-second remainder. Round to hundredths
**first**, then split the integer.

Three things make it worth the space. **It was silent.** The site's `parseCSV`
refuses a seconds field of 60 and drops that row, so a mark left the database
with nothing said. Here it cost one of McBride's three marks, not his place on
the board and not his season best, which was the fastest of the three - so the
damage this time was a `MARK_W` draw over two marks where it should have been
three. The value was never wrong; the spelling was, and the spelling is what
the parser reads. On a different athlete the same fault takes the only mark
they have and removes them. **It was latent from the day it was written** - it
needs a time within half a hundredth of a minute boundary, about one mark in
six thousand, so it waited for the seed to pass eight thousand rows. And **the
dashboard's `mmss` had the identical fault**, found weeks earlier, one file
over. Fixing a rounding bug in one formatter is not finishing: grep for the
others.

What caught it was not a reader. `parseCSV` counts bad rows and both `audit2`
and `test_seed` assert that count is zero, so a dropped athlete failed a build
rather than quietly shrinking a board. `test_seed` now also sweeps fifty
minutes of hundredths through `fmt`, and putting the old two-step version back
fails it three ways.

**Resume must advance the index before it saves.** Saving "meet 40 done" while
meet 40's rows are only half in re-pulls it on resume and gives every athlete in
it the same mark twice, quietly eating real mark slots. `buildSeed` also
deduplicates on day-and-time as a backstop: nobody runs two 5,000m races in one
afternoon in the same hundredth of a second.

**The job runs Monday morning, and the day is the design.** Cross country races
on Saturdays, so a Monday 07:30 crawl catches a whole weekend and the site is
current before anybody looks at it. An off-cycle pull picks up whatever midweek
racing has happened and little else: the Sep 24 run added 131 rows against the
Sep 19 run's 659, because it ran on a Friday and the only meets between them
were a Wednesday invitational of 23 results and a Thursday 5k of 3. **A thin
week is not a broken crawl** - check the meet list in the report before
suspecting the pull, because the report prints every meet it read and what each
one gave.

**A Saturday pull is not thin, though, because athletic.net posts same-day.**
The Sep 26 run went out that afternoon and already had Nike Portland XC with
2,777 results and Three Course Challenge with 843, both raced that morning:
1,289 new rows. So the Monday slot buys reliability rather than freshness -
it catches a meet whose results went up late on the Sunday, and it runs whether
or not anybody remembers. Do not read the Monday choice as "results are not
up before then".

Current coverage: 9,590 marks, 3,623 athlete-boards, 225 schools, from 118 meets
(Oct 2 crawl, 53,576 results read, none unanswered). It also writes `H2H`:
2,045 A-race meetings across the ten boards, 471 of them 6A boys - 70KB raw,
14KB gzipped. Counting every division first gave 3,399, and 1,254 for 6A boys:
JV fives were most of it.

**The "nothing changed" guard compares `H2H` too.** The second crawl of Oct 2
found the seed byte-identical and exited 3 without writing, so the corrected
head-to-head rule never reached the page. The state file survives an exit 3, so
the table was rebuilt from it offline; the guard now treats a moved `H2H` as a
change.
That is 671 rows more than the hand-built pull it replaced, which is the crawl
starting from the full Oregon team list rather than from team ids resolved out of
meets already pulled - it finds meets the old chicken-and-egg approach could not
reach. The schools that still do not appear have no 5,000m result yet, the same
as any team short of the scoring depth. Nearly all are 1A schools that have only
raced 3k so far. Every one of the ten boards can fill its field.

**`index.html` is untouched by any of this.** `pull/` is maintenance tooling that
sits beside the app; the app stays one self-contained file that can still be
uploaded by drag-and-drop on its own.

## One school's whole history

`pull/roster.js` answers a different question from the seed. The seed says how
fast a team is now: each school's fastest twelve this season. This says what
happens to somebody who joins one, which needs the opposite shape — every
athlete who ever appeared, including the ones who left.

```
node pull/roster.js 284 --name Tualatin     # 2004-2026, about twenty seconds
node pull/test_roster.js                    # 66 checks, no network
```

Tualatin is team 284. The pull writes four artifacts to `pull/roster/`:
8,835 results, 596 athletes, 1,258 athlete-seasons, 222 meets. 432KB raw and
**88KB gzipped**, of which the seasons table that drives every statistic is 12KB.

**One request a season.** `TeamHome/GetResultsGrid?teamId=N&seasonId=YYYY`
returns a team's entire season — every result, not just bests — with the athlete
id on each row and a `meets[]` array carrying the dates. It is a plain GET on a
different budget from the results POST, so it paces at `GAP_GET` rather than at
two seconds. Twenty-two seasons is twenty-two requests.

**The athlete id is the spine, and the name is not.** The seed keys on
`athlete` as a string, which is right for a season board and would quietly
destroy a longitudinal one: Matt becomes Matthew, somebody transfers in, two
brothers share a surname, somebody changes their name. Meghan Peyton ran here as
Meghan Armstrong. `NAME_BY_ID` maps id to display name and `alsoKnownAs` keeps
whatever athletic.net said, so a search on either spelling finds her. Map id to
name, never name to name — the same rule the poll and the seed alias tables both
had to learn, one level harder.

### The school year, which is the off-by-one

A cross country season labelled 2015 is the **autumn of 2015-16**, so its seniors
are the class of 2016. A track season labelled 2016 is the **spring of that same
school year**, and its seniors are also the class of 2016. So
`schoolYear = year + (sport === 'xc' ? 1 : 0)` and `classOf = schoolYear + (12 - grade)`.

Get it wrong and every cohort is off by one, which does not look like anything.
It has its own named test.

### `classOf` is inferred, never read

The per-result grade field is patchy enough that one odd row would move somebody
into the wrong cohort. Every graded result votes, the modal answer wins, and
disagreement is **recorded rather than resolved** — `classOfConflict` and the
full vote tally ride along on the athlete. On Tualatin's 22 seasons, 591 of 596
athletes have one unambiguous answer.

Never silently pick a winner here. A cohort quietly off by one is exactly the
kind of wrong number that looks completely fine.

### Entry grade has to be reconciled against the team

The obvious rule — entry grade is the grade they first appear in — is wrong
often enough to poison the denominator, because **a missing freshman year and a
genuine late entry look identical from one athlete's own rows**.

So if somebody first appears in grade 10 or later, ask whether the school posted
any freshman results the season before. If it did, they really did join late. If
it did not, that season's freshmen are simply absent and the entry grade is
`unknown-gap`, which is neither and is excluded from both halves of every
fraction rather than guessed into one.

This is not hypothetical, and the worked example turned out to be a lesson in
both directions. Mark French and Kaitlyn Gearin both first appear in grade 10 of
the **cross country** record. Tualatin posted 79 freshman results in 2012 and 128
in 2016, so the reconciliation correctly called them late entries rather than
gaps — on the evidence it had.

**It had the wrong evidence.** Both ran their freshman *spring*. Adding track
moved them to `observed` with an entry grade of 9: they had simply skipped one
autumn. The hand-built four-year table in TRUST Plan Data was right about them
all along, and the freshman marks it carried came from track rather than from
nowhere.

So the reconciliation was sound and the *universe* was too small. A cohort built
on one season a year gets entry wrong for anybody who starts in the other one.
`test_roster.js` asserts the corrected answer, which is the argument for pulling
both sports stated as an assertion.

### What it found

**Forty percent of everyone who has ever raced for Tualatin joined after their
freshman year**: 306 observed freshman entries against 239 confirmed late ones,
47 unknown-gap and 4 ungraded. That was not expected and it changes how the
completion rate reads — the figure below is completion among freshman entrants,
and there is a second, larger population it says nothing about.

**Four-year completion, distance athletes: boys 45%, girls 50%.** The girls
moved six points when every track race replaced the season bests, and that is
the same effect as adding track in the first place, one level deeper: a
freshman who raced one heat and never set a season best was invisible, and now
she is a freshman entry. Every figure below predates that change. It was 42%
and 44% on cross country alone; track lifts the boys by finding freshman years
that were springs. As far as I can tell nobody has published this for any
program in the sport. Five things it is not: it counts athletes who *raced a recorded 5k* as a freshman rather than
everyone who joined the team, so it is a lower bound; per-year cohorts run 1 to
14 and the 100% entries are n=1; the 2020 season has 125 results against a normal
400, so cohorts 2021-2023 are distorted; and it cannot yet tell "left the sport"
from "transferred out", which needs the statewide seed.

**The hand-picked sample overstates development badly.** Same source, same
method, three populations — mean VDOT change over four years:

| population | boys | girls |
|---|---|---|
| the 18 in TRUST Plan Data | +7.03 | +4.88 |
| everyone with all four years | +4.66 | +1.49 |
| everyone who ever raced | +4.60 | +1.31 |

The girls' senior year is **negative** across the program, −0.61 for four-year
athletes, where the hand-picked eight showed +0.98. Not a rounding difference —
the opposite sign. This is the whole argument for the roster-and-views split:
the top hundred is the front door and never the population a number is computed
over unless the page says so.

The freshman-to-sophomore step being the largest survives in every population.

### The horizon, which is measured now and used to be declared

An "all-time" board that is silently a "since 2005" board is the same failure as
a stale `DATA_DATE`, so the horizon is recorded in `t284_meets.json` and printed
on the page. It used to be `FIRST_SEASON`, the year the pull starts asking. That
is not the same thing as the year the record begins, and the difference bit the
moment every track race came in: **the bio endpoint reaches back to 2001**, three
years past the 2004 the page had always printed.

**Two numbers, because one misleads.** `horizon` is the earliest season with
anything in it — 2001. `solid` is the first season with enough in it to reason
about — 2004. Before that the record is 27 results over 13 athletes, which is a
scattering rather than a squad, and the footer says so in those words.

**Meghan Peyton is inside it now, and that is the whole argument in one
athlete.** Cross country could not find her at all. Season bests found her as a
senior who came from nowhere, entry `unknown-gap`. Every race gives her fourteen
results back to 2001 **including her freshman year**, so she is `observed` with
an entry grade of 9. The test asserts the new answer and says why the old one
was honest on two rows and wrong on fourteen.

### Track, through a different door

`GetResultsGrid` **ignores its sport parameter** — `?sport=tfo` returns the
identical cross country payload, so track is not reachable that way at all. It
is reachable, and just as cheaply:

```
TeamHome/GetTeamAthleteRecords?teamId=N&seasonId=YYYY
```

One GET a season, **no token**, back to 2005. It returns each athlete's season
best per event rather than every race, which is the right shape here: the point
of track is a clean ruler, and a season best on a flat oval at a standard
distance is exactly that. Each row carries `GradeID`, `GenderID`, `Event`,
`SortInt`, `IDMeet`, `MeetName` and `EndDate`, so nothing the cohort work needs
is lost.

Three things found while looking, worth not rediscovering:

- the valid sport codes are `tfo` and `tfi`, not `tf` or `track`
- **division ids are per sport.** `87377` is Oregon in cross country and
  *Northern Ohio* in track, so `Seed.OREGON_DIV` must not be reused across
  sports. It fails silently, with a full and plausible answer.
- `TeamHome/GetAthletes` takes **`seasonId`**, not `season`, and needs the
  team's `jwtTeamHome`. It returns the roster, and is not used: the records call
  already carries everybody who actually raced, and a roster entry with no mark
  on it says nothing this file can use.

**`SortInt` is milliseconds for a timed event and a distance for a field one.**
`Type` is `T` or `F`, and a shot put read as a time puts a twelve-metre throw on
the board as a twelve-second race. `recordRow` keeps `Type === 'T'` with a flat
running distance; hurdles and relays go too, because a 300m hurdles time is not
on the same ruler as a 300m run. 2,687 field marks are skipped and the report
says so.

**One pace bound cannot serve both ends of a track programme.** Loose enough for
a ten-second 100m is loose enough for a nine-minute 5,000m, which is two minutes
inside the world record. `paceBounds` is two regimes: under 800m it is
0.090–0.450 s/m, at 800m and up it is 0.140–0.720.

### Every race, not every season best

**`GetTeamAthleteRecords` serves one season best per event, and this file used
to call that "the right shape here". It was wrong.** A senior with twenty-two
track races showed four marks — one per event — and the page was missing five
sixths of its track. Mark French: four rows in the old pull, **seventy-three
races** across four years and **twenty-two in his senior season alone**. The
owner noticed, which is the only reason it was caught.

```
AthleteBio/GetAthleteBioData?athleteId=N&sport=tf&level=4
```

One unauthenticated GET an athlete returns **every** track result they have
ever had, all seasons, with the place, the round, the division, the meet and
the date on each. It costs one request per athlete rather than one per season —
about twenty-two minutes for fifteen hundred — which is why it was not the
first choice, and the answer is worth the minutes.

**The sport code is `tf` here.** It is `tfo` for `GetTeamCore` and
`GetTeamAthleteRecords`, `tf` for `GetMeetData`, and this endpoint **400s on
`tfo`** and **404s with no sport at all**. Four endpoints, three spellings, no
rule to infer — only the record of which one wants which. A 400 rather than a
404 is the tell that an endpoint exists and the parameters are wrong.

**A relay leg is spelled exactly like the open event.** `EventID` 3 is
`"400 Meters"` with `Description: "Relay Split"`, so the description has to be
read or a split lands on the board as a solo 400. Whole relays, the distance
medley, hurdles, the steeplechase and the field go for the reasons
`eventMetres` already gives.

**DNS carries a sentinel, not a blank:** `SortInt` is `20000001`. The pace
bound catches it at thirteen seconds a metre, but a sentinel read as a time is
the kind of thing that survives until somebody sees a five-hour 1500m, so it is
refused by name.

**Indoor seasons are numbered +10000** — 12016 is the 2016 indoor season. They
are real races at this school and they are kept, filed under their own school
year with an `indoor` flag.

**`SchoolID` on the result row is what keeps a college career out.** French has
seasons at school 21244; the filter is on the row, not on the athlete.

**The response carries its own meet table**, keyed by id, with the name and the
date. Taking only `MeetID` off the result row and leaving the name blank is how
the page ended up with unnamed meets once before — a race at "" is a race
nobody can place. The merge prefers a named meet either way round.

**`GetTeamAthleteRecords` is still called**, for the roster rather than the
results: it is the cheapest way to learn who ever scored a track mark here, and
it carries the gender the bio rows do not. Its results are thrown away, because
every one of them is inside the race list and keeping both would double-count
the best race of every season.

**The run refuses to write if more than one athlete in fifty fails.** Half a
track record is worse than none: a missing race looks exactly like a season
somebody did not run.

**The pace is 300ms and was measured, not guessed.** 25 for 25 clean at 300ms;
**10 of 25 refused at 120ms**.

### What every race changed, and what it cost

**15,905 track races against 5,263 season bests.** Mark French: 49 individual
races over four years and 12 in his senior season, where the old pull showed
four. 4,705 championship placings over 74 meets, against 1,602 over 43 — the
meet universe was previously whatever meets happened to host a season best.

**Two published numbers moved and both moved for the right reason.** Four-year
completion went 46% to 45% for the boys and **44% to 50% for the girls**;
late entry 28% to 29%. More track seasons resolve more `classOf` votes and more
entry grades, and a freshman who raced one heat without setting a season best
now counts as having been here.

**Twenty-seven athletes left the record, and that is a correction rather than a
loss.** They are throwers, jumpers and hurdlers whose only flat-run "times"
were relay splits — and the season-bests endpoint does not distinguish a split
from an open race, so their 4x400 legs had been published as open 400m marks
all along. A relay leg is not a solo run, which this project already knew and
could not previously enforce.

**It cost 115KB of data on disk, 31KB gzipped.** That is the whole growth; the
page's own code did not change size for it. A complete track record is worth
more than the bytes.

### eventMetres refused three names it should not have

Scrubbed every track row athletic.net holds for this team — 8,515 — and grouped
what the parser threw away. 2,687 field marks and 554 hurdles, both correctly.
Then **119 that were simply wrong**:

- insisting on the plural `Meters` dropped every **"60 Meter"**, which is how
  the indoor sprint is spelled — 66 marks
- **"1 Mile"** and **"2 Miles"** went for not being metric — 53 marks, on a page
  built for distance runners

A mile is recorded as **1609 metres** and nothing is converted to a 1500
equivalent, because nothing here is ever converted between distances. What
stays out stays out: a barrier race is on its own ruler, a relay leg is not a
solo run, and "40 Yard Dash" is a combine test rather than a track event.

**Indoor is not separately reachable, and that is measured rather than
assumed.** `GetTeamAthleteRecords` ignores its sport parameter entirely and
returns the same 686 rows for `tfi`, `tfo` and nothing at all. The 60m marks
are the indoor ones already folded in. So is `GetResultsGrid`: it returns the
identical cross country payload for `tf`, `tfo` and no sport.

### What track changed

**It found people cross country could not.** The roster goes from 596 athletes
to 1,566, and 153 of the distance athletes had never run a cross country season.
Meghan Peyton — the one of the nineteen in TRUST Plan Data that cross country
could not find under any spelling — is in the track record, class of 2004, two
marks in the spring of the first season athletic.net has for this school.

**It fixed entry for anybody who started in a spring.** See the correction
above.

**It is a different ruler, and the difference is measured.** Same athlete, same
school year, both sports, boys:

| | mean | median | athlete-seasons |
|---|---|---|---|
| track 1,500m VDOT − XC 5,000m VDOT | **+3.63** | +3.56 | 264 |
| track 3,000m VDOT − XC 5,000m VDOT | **+2.03** | +2.16 | 169 |

So a VDOT from track and a VDOT from cross country **never share an axis**. The
page has a panel saying exactly this. The *change* between two years is
comparable across rulers, because the offset cancels in a difference; the level
is not.

**And the two rulers disagree about the senior year.** On cross country the
boys' 11→12 step is +0.50. On track 3,000m it is **−0.56**. Small n on the track
side (16 four-year careers against 66), so this is a flag rather than a finding,
but it is exactly the kind of thing a course-free ruler exists to show.

### The sanitiser is shared, deliberately

`cleanName` was inline in `buildSeed` and is now exported from `seed.js`, because
`roster.js` ingests the same names from the same site. Restated in two places it
would drift the first time one changed, and only one of the copies has
`test_seed.js` firing real payloads at it. `test_roster.js` asserts that
`roster.js` calls the shared function and does **not** keep its own copy of the
rule — the same way `test_crawl.js` lifts the guard rule by text rather than
restating it.

## The roster dashboard

`tualatin/index.html` is the second page, built from `pull/roster/` by
`node pull/build_dash.js 284`. Same shape as the app: one self-contained file,
data in a `<script type="text/plain">` block that a script rewrites, no build
step and no fetch. **933KB on disk, 277KB gzipped**, which passed the app some
time ago - the every-race track pull is most of it and the crest is 15KB of
it. The 427KB/130KB this file used to quote was true before track went from
season bests to every race, and was left behind by it.

**The page is narrower than the archive, on purpose.** `roster.js` keeps the
whole running programme because a roster that quietly drops people is what this
project keeps arguing against. The dashboard takes the 749 athletes with a mark
at 800m or longer and leaves the 817 sprint-only ones in the CSVs, because
nothing here reads them: VDOT does not take a 100m, a development curve over
that group is noise wearing a number, and a retention figure mixing two
programmes describes neither. Their own sprints stay in — a distance runner's
400m is worth seeing. It is about a fifth of the bytes, and the bytes are not
the reason.

### It is its own site, and that is the point

Live at **tualatinxctf.vercel.app**. It was published on chutexc for about an
hour and moved, which was the right correction: `chutexc.vercel.app` is the
statewide projections product that strangers visit for the odds, and a page
about 749 named local kids should not be one guessed URL away from it. Two
audiences, two products, two domains.

**A second Vercel project, root directory `tualatin/`.** Same repo, same
commits, same push. The second project cannot see anything above its own root,
so the seed, the archive and the backtest are out of its reach **by
construction** rather than by a rule somebody has to keep maintaining. Both
projects must keep framework preset **Other**.

**`.vercelignore` is shared by both projects and that cost an hour.** It is
applied at **upload** time, before either project narrows to its root
directory, so listing `tualatin/` there to keep the page off chutexc stripped
it from the tualatinxctf upload too. That project deployed **empty** — every
path 404, including files that plainly exist at the repo root, which is the
fingerprint: `X-Vercel-Error: NOT_FOUND` rather than `DEPLOYMENT_NOT_FOUND`
means the project is real and has nothing in it.

So the split runs the other way round. `tualatin/` ships to both, and chutexc's
own `vercel.json` **redirects `/tualatin/*` to `/`**, which works because
redirects are matched in the routing phase before static files. A `rewrite`
would not: those run *after* the filesystem check, so the page would still be
served. A path listed in `.vercelignore` is gone from every project in the
repo, full stop.

`tualatin/vercel.json` carries its own headers rather than borrowing the app's,
because a separate project gets no inheritance. Same CSP shape —
`default-src none`, fonts from gstatic, `connect-src 'self'`. Two
differences from the app's: no `googleusercontent` in `img-src`, because there
are no crests here, and an added **`X-Robots-Tag: noindex, nofollow,
noarchive`** header to back up the meta tag in the page.

**"A separate project gets no inheritance" is the whole reason this paragraph
keeps earning its place.** Turning on Vercel Web Analytics meant the same two
edits three times: the script tags in each page's head and `connect-src 'self'`
in each project's own `vercel.json`. Root `vercel.json` reaches none of them.
Enabling it in the dashboard is also per project, and that part cannot be done
from here.

**The tags are in the built pages and not in the builder.** `build_dash.js`
only rewrites the named `d-*` data blocks and the `INFO` constant, the same way
`patchIndex` only touches the seed and `DATA_DATE`, so a head edit survives
every rebuild. The cost is that a page recreated from scratch would not have
them - the head of `<slug>/index.html` is hand-maintained and always has been.

**These two pages are `noindex` and about named local kids, so counting their
traffic was a separate decision from counting the app's** and was taken
separately. Vercel's analytics is cookieless and collects no personal data,
which is what makes it an ordinary choice rather than a problem.

**`SHOW_CURRENT` is TRUE, and this file said false for three days.** Athletes
still at school are named in full alongside the alumni, flipped on Sep 25 at
the head coach's request, with the reasoning in that commit: every result here
is already on athletic.net under the same full name, and what is new is the
*gathering* rather than the disclosure. It is his programme and his call, and
the footer tells every reader in plain words - "everyone is named, athletes
still at school included, at the coach's request. The page is not indexed by
search engines."

The decision was right and recorded. **The note was not updated, so this file
went on promising a protection the site does not have** - and it was still
promising it on the day the page was shared with a whole programme's parents
and athletes. That is the exact failure this file keeps writing down about
itself: a claim nobody re-checked reads as settled. When a one-line flag
changes, grep this file for its name before the commit lands.

One line back to `false` returns every enrolled athlete to an initial.

**`noindex` is the guard that is still a guard**, at both the meta and header
level, and it is doing more work now than it was: publishing a link and
publishing to a search index are different decisions, and only the first was
made. A coach sending the address to his own team is what the page is for. It
staying out of a search for a fifteen-year-old's name is what `noindex` is
for. Neither substitutes for the other.

**The raw archive is not served.** `pull/roster/` stays in the root
`.vercelignore` and is outside the second project's root twice over. The page
embeds everything it needs; serving the CSVs as well would widen what is public
without making anything work. They stay in the repo, which is where the tests
read them from.

### The rule the whole page is built on

**A statistic takes a population as a parameter. It never chooses one.**

`V.everyone`, `V.top`, `V.fourYear` return people. `devCurve`, `cohorts`,
`rosterSize` and `depth` each take a list of people and know nothing about how
it was chosen. That is not tidiness. It is the only reason the development
panel can run one calculation over three groups and print the difference,
which is the finding:

| | boys | girls |
|---|---|---|
| top 100 | +6.26 | +1.56 |
| all four years | +4.54 | +1.49 |
| everyone | +4.48 | +1.31 |

The board is the front door because it is what anybody actually wants to open.
It is never the population a number is computed over unless the page says so,
and it carries a note at the top saying exactly that.

### Who's Who, and the sixty years before the horizon

athletic.net starts in 2004. *Who's Who in Oregon High School Track & Field and
Cross Country* has published continuously since **1965**, carries all-time team
rankings back to 1960 and four-year State qualifiers back to 1963, and is kept
by volunteers who are the closest thing these two sports have to official
historians. It is 49 static PDFs on a school district's server.

```
python pull/whoswho_extract.py   # PDF -> committed text, the one step Node cannot
node pull/whoswho.js             # text -> committed CSV
node pull/test_whoswho.js        # 67 checks, no network, no Python
```

The split is deliberate. Extraction needs a library; **parsing is where the bugs
live**, so it is in Node with the rest of the tooling where the suite can aim at
it. The `.txt` is committed, so a re-run does not depend on a school district's
web server still being up. The 6MB of source PDFs is gitignored.

**What it found.** The girls are **29th all-time in Oregon** off 23 trips to
State, the boys 98th off 16. Ten four-year State qualifiers. Caleb Lakeman is
**21st all-time in the state** for a 5,000m at the State meet, Lauren Gerlach
45th, Kaitlyn Gearin 55th.

And **Meghan Armstrong, 2000-2003, 31st all-time in Oregon** — the athlete
athletic.net could not find under either name, whose whole career sits four
years before its horizon. She is Meghan Peyton now.

**The hard part is the column, not the regex.** Every one of these documents is
printed boys-left, girls-right and extracts to one line per row, so the column
an entry came from is the only thing that says which gender it is, and a wrong
answer is silent and permanent.

Two source typos broke the first attempt:

- `2021=2024` uses an **equals sign for a hyphen**. A regex insisting on a
  hyphen does not skip that, it reads straight through into the next entry and
  returns a rank of **2,024,519**. That poisoned the sequence tracker and filed
  Devon Frazier, who is a girl, as a boy.
- The list runs 702, **7803**, 704, where 7803 is plainly 703 mistyped.

So inference uses **points as well as rank**. Points are a sum of State
finishing places and only ever climb within a column, so a typo shows up as a
step backwards rather than as a plausible number. A rank that goes backwards is
never written into the tracker.

**Verified rather than asserted, two ways.** The top-80 document prints the
genders on **separate pages** and needs no inference: 41 athletes appear in both
lists and the inferred column agrees **41 times out of 41**. And athletic.net
knows the gender of everyone who has raced here since 2004: **9 of 9** agree.
Both are in the suite.

**A typo and a name change are different facts and got conflated for an hour.**
`alsoKnownAs` is a *later* name — "now Meghan Peyton" — and `published` is what
the book actually printed — "Matther Lovos". The page said "Matthew Lovos (now
Matther Lovos)", which is true of nobody. Separate columns now, with a test.

### Every athlete has a true thing that is good

`bestTruth(i)` finds it, and **the order of the candidates is the whole design**:
a statewide honour outranks a good number, a good number outranks a tidy one.

1. a Who's Who honour, which almost nobody in Oregon has
2. their biggest single year, on whichever ruler they have most of
3. the race they beat the day by, off the existing residual fit
4. all four years, which fewer than half of starters manage
5. how many races they ran, which is true of anybody who ever pinned on a number

**It never returns nothing.** The last candidate is unconditional on purpose: an
athlete with no good line on any axis is a failure of the axes, not a fact about
the kid. Nothing in it is invented — every branch is a statement the data
supports and a coach could defend out loud.

It renders as `.truth`, the first thing on an athlete's page, above every table.
It animates because the sentence *arriving* reads as a finding where one that is
simply present reads as a lookup. `transform` and `opacity` only.

### It is Tualatin's colours now, and they were measured

Crimson, grey and black. The school profile says so and `tuhs.ttsdschools.org`
paints with **#880000**, which is the true colour and is used as itself
wherever there is light behind it.

**It cannot be the ink on a black ground.** Measured: #880000 on #0B0A0C is
**1.93:1**, which is invisible, while white on #880000 is **10.26:1**. So the
maroon *fills* and a lifted crimson *writes*. `--maroon` is the school's colour
and never changes; `--accent` is whatever clears 4.5:1 against the ground of
the current theme — **#EE5566 at 5.42:1** on dark, and **#880000 itself at
9.79:1** on light, where it needs no help. Same discipline as the app's gold,
different colour, every value measured rather than chosen by eye.

The page was built in chutexc's gold for a fortnight, which was a Tualatin site
wearing another product's identity.

### Motion, and the rule that keeps it safe

Two things, one observer. **Counting**: a figure that ticks up reads as a result
arriving where the same figure present reads as a lookup. **Drawing**: a career
line that draws itself is the difference between a chart and four years.

The format is **named** (`data-fmt`) rather than inferred, because `16:49.5`,
`46%` and `+4.48` are three shapes and guessing between them is how a percent
sign ends up inside a time.

**The resting state is always complete.** `animate()` adds `.in` on
intersection, *and* a timer adds it to everything after 1.2s regardless, *and*
anything already on screen starts immediately rather than on the next scroll.
A throttled tab, a frozen clock or an engine that skips animation still ends up
with a whole page. Never leave content depending on an animation to become
visible — the same rule the How tab's diagrams had to learn.
`prefers-reduced-motion` turns all of it off and shows final values.

### The pack

The squad as a start line that strings out: every athlete placed by the time
they actually ran, the scoring five filled in maroon and the rest outlined —
the same mark the app uses, five score and everybody runs. Gaps are to scale,
so the shape of the picture is the shape of the team.

One canvas rather than N elements, drawn at device resolution and laid out in
CSS pixels or the dots are soft on every phone made in a decade. It animates
once, for about a second and a half, and then stops: **a thing that moves for
ever is a screensaver, and this is a squad.**

**Its height follows the squad.** Fourteen lanes in a fixed 170px gives nine
pixels each, and a 10px name in a 9px lane is a smudge.

### Every tile says what it means

A number with a label and no definition is the thing a reader guesses at, and
three of the four programme tiles were guessable in the wrong direction.
"Four-year completion 46%" now carries "of the 224 who raced here as freshmen,
102 were still racing as seniors" underneath it, and the VDOT tile explains
what VDOT is.

### January, which is the tab a coach actually opens

Not "who is fastest" — the board answers that and nobody needed a page for it.
"Where do I spend my attention", which has an arithmetic answer this roster can
give.

**A team scores five, so the objective is the scoring-five average.** An
athlete's *worth* is how much that average moves if they have the year the
programme's own history says somebody in their grade typically has. The
**median** year, not the best imaginable one, and measured over everyone on the
ruler rather than over the athletes who turned out well.

That makes it honest in both directions. An athlete already in the five is
worth a fifth of whatever they gain. A sixth runner thirty seconds back is
worth nothing until they pass the fifth and then a great deal at once. The
second is the one a board sorted by time hides completely.

**The finding, on the September boys:** Benjamin F. is **one second outside the
scoring five**, and a median year for a grade 10 here is worth seventeen. He is
the highest-leverage athlete on the team and he is sixth on the board.

**Two kinds of athlete, two numbers, and the first version got this wrong.**
Ranking everybody on worth printed "0.0s" beside the fourth and fifth names,
which is useless and is exactly what this page exists not to do. So an athlete
whose median year does not move the five is shown on **how much of the gap it
closes** instead — "38% of the gap, 49s outside becomes 30s" — which is a real
number about real progress and happens to be the sentence a coach would say to
them anyway.

**The list stops at five. It does not continue downward.** Nobody is ranked
below them, and the footnote says so in those words.

**Speed or strength** compares a 1,500m against a 3,000m and nothing else. Both
are track, so both sit on the same ruler; putting a cross country 5,000m in
would measure the terrain instead, which is why the two rulers never share an
axis anywhere on this page. It reads against **the squad's own median** rather
than against zero, because the two VDOT columns need not agree in the middle
and an offset everybody shares says nothing about anybody. So the labels are
relative to this team and the caption says so: Theodore A.'s 1,500m is stronger
than his 3,000m in absolute terms and still reads "strength" here, because his
team-mates lean further that way than he does.

**Who already races together** takes every pair of team-mates with four or more
shared start lines and ranks them on the **median** gap at the finish — median,
because one race where somebody was ill should not dissolve a partnership that
holds the rest of the time. These groups exist whether anybody planned them or
not, and Kamron S. and Tyler W. have finished within 13 seconds of each other
six times.

**`mmss` could not carry, and it had been wrong since it was written.**
Formatting the minutes and the tenths independently means the tenths can round
to 10 beside a seconds field that has already been floored: 625.96s printed as
**"10:25.10"**, and 59.97s as "0:59.10". Round to tenths first, then split.

### The growth board

`Most improved` ranks on VDOT gained between an athlete's first and last graded
season rather than on the mark at the end of it. A 21:00 freshman who becomes a
19:30 sophomore did something a 16:10 senior did not, and on a board sorted by
speed that work is invisible for ever.

Elijah Goiburn leads the boys at **+14.1 VDOT, 21:44.0 to 17:12.8**, and appears
nowhere on the speed board. That is the entire argument for the feature.

Two seasons on the chosen ruler are required, and **anybody with one is absent
rather than last** — the page has no bottom-N anywhere, deliberately.

**`ord` and `T` were both shadowed, and both were silent.** A local
`const ord = n => n + (n===1?'st':...)` inside `drawAthlete` shadowed the module
one and printed "31th" for a rank that mattered. A local `const T = bestTruth(i)`
shadowed the SVG text helper and put the four-year arc's own labels in the
temporal dead zone. Check what a name already means in this file before reusing
it.

### The History tab

Three readings of the same twenty-two years behind one tab, sharing the gender
and the ruler because they are three questions about one programme rather than
three tools. Routes are `#/history/records|bracket|lineage`, with `asof`,
`mode` and `focus` carried in the query.

**The record book on any day.** Name a date and it says what the school record
was, who held it and how long it had stood by then, with the ten fastest as of
that morning. The timeline is one pass over every race in order: anything
faster than everything before it is a new record. **A record that is equalled
does not change hands** — the holder keeps it until somebody is actually
faster, which is how records work and is not what a naive `<=` does.

**The sentence is generated, so it had to be verified rather than read.** It is
checked against an independent recomputation at every step boundary in the
timeline plus two hundred random days: **226 checks, 0 wrong**. A sentence
assembled from four variables is a sentence that can be wrong in a way nobody
notices, and "it looked right on the three dates I tried" is not a test.

### The greatest team ever

Every season that can field seven, seeded on the average of its scoring five,
run as one single-elimination bracket. Twenty-two boys' seasons padded to
thirty-two with byes, and **the byes go to the top seeds**, which is what a bye
is for. The draw order is built by reflection, so seed 1 meets the lowest seed
and seed 2 is as far away as the bracket can put them.

**Two modes, and they are different kinds of answer.** On paper is arithmetic —
the NFHS dual scorer, the same result every time you ask. Race day is a model —
each athlete gets a spread, two thousand meets are run per game, and the figure
is how often that side won. The copy labels which is which, because a
probability and a fact should not share a typeface without one.

**The scorer is in ONE place now.** The ghost race had `score` privately inside
its IIFE and the bracket would have been a second copy of the NFHS rules. Two
copies of a scorer is two answers waiting to happen, so `dualScore` is at
module scope and both call it. A perfect dual is 15–50, and `audit2` has always
said so; now there is only one function for it to be true of.

**The spread is made of something, and thin meets had to come out of it.** On
cross country it is the standard deviation of that athlete's own residuals that
season — how far each race landed from what their form and that afternoon
predicted — which is the right quantity because the meet term is shared by both
teams in a dual and cancels. On the track there is no meet fit, so it is the
spread of their own times, which is coarser.

A meet with four runners on it has its effect shrunk almost to nothing by the
fit, so whatever that afternoon did to everybody lands in the residual instead
and reads as the athlete being erratic. Excluding meets below `MIN_AT_MEET` —
the same ones the athlete page refuses to print an expectation for — moved
2022's top two from 9.0% and 6.7% to **3.7% and 3.8%**, and the final from
59–41 to **52–48**. That is not a tidy-up; it was the difference between a
plausible answer and a right one.

A season of three races is three numbers, so anything under four is shrunk
halfway to the squad's median spread.

**The two modes crown different seasons and the page says so.** On paper 2022
beats 2027 25–30. On race day 2027 takes it just over half the time, because
the season with the better five is not always the season with the steadier
seven. That disagreement is the most interesting thing the feature produces and
it gets its own note rather than being left for somebody to notice.

**It runs on the main thread, and that was measured.** A whole race-day bracket
is **127ms** — thirty-one games at two thousand meets each — and the odds are
cached, so a redraw is thirty-one coin flips. The CSP has no `blob:` source, so
a worker would mean a second file, and the page is one file. Do not add one
without re-measuring first.

**Percentages are rounded once.** Rounding both sides of a game independently
prints 99% against 2%. Round the first and take the second from it.

**A game opens those two seasons in the ghost race**, through `GHOST.race`,
which routes via the hash rather than setting the pair directly — `pG` and `pR`
own that strip and the Program tab's own switches have to move with them.

### The lineage

Nobody arrives at this sport on their own. An athlete is linked to the runners
who were **two or more grades above them in their first cross country season**
and started **at least three of the same races**. First season, because that is
when somebody is being shown what the sport is rather than choosing who to run
with. Two grades, because a classmate is a team-mate and the year below that is
who you watch. Three races, because one meet is a coincidence.

248 boys and 164 girls have at least one, over 743 and 474 links.

**The grade is the derived one, never the one on the row** — the same rule the
cohort counts had to learn, for the same reason: somebody can race a whole
autumn with the grade field blank.

**It cannot loop, and that falls out of the rule rather than being checked
for.** If A's first season had B two grades up, B's own first season was at
least two years earlier and A was not in it. So the graph is acyclic and the
longest path through it is a walk.

**The longest line is 11 boys from 2006 to 2027 and 12 girls from 2005.** Each
one new when the one before them was already there.

**What it is not**, and the page says so out loud: not who coached whom, not
friendship, and not credit for anybody's improvement. It is who was on the same
start line when somebody was new, which is the only part of it the results can
support.

**The river is a canvas and the focus overlay is SVG.** Seven hundred careers
as lines is a canvas; a dozen handover curves want to be crisp and to carry a
`<title>` each. **It opens on the most connected athlete**, not on the end of
the longest line — whoever is newest has three arcs stacked on one season and
nothing downstream, which is the worst possible first look at a graph.

**`RIVER.build` has to run before the copy does.** The card's prose reads each
career's span out of `RIVER.rows`, and mounting the canvas at the end of the
function is a frame too late. The view threw on first paint until the build
moved up.

### Career twins

The three athletes whose four years looked most like yours: a per-grade VDOT
vector on one ruler, compared by root mean square over the grades both have,
minimum two. One shared grade is a single number and every programme has a
hundred athletes who once ran the same time.

**The ruler is the one they have most of**, and two athletes are only ever
compared on the same one — a track 1,500m VDOT runs about three and a half
points above a cross country one for the same athlete, which is the rule the
whole page is built on.

**`TWINS_SHOW_FUTURE` is false and should stay false.** A current athlete is
matched only on the grades they have finished, and the twin's line is drawn
only that far. The alternative is a chart telling a sixteen-year-old what they
will run as a senior, which is not a thing this data can know and not a thing
to publish about a named child. The guard is asserted rather than asserted
about: all 370 athletes with twins, 32 of them current, checked for a match or
a drawn point past the cap.

**The axis stops where the record does.** Drawing Freshman to Senior for a
sophomore leaves two thirds of the chart empty and invites the reader to look
at the gap, which is the one thing there is nothing to say about. Full words
when the axis can hold them, initials when it cannot — the same rule
`gradeBands` uses.

### Three rulers, and they do not share an axis

A cross country 5,000m is what the sport scores on. A track 1,500m or 3,000m is
the same fitness measured on a flat oval at a known distance, which is the only
clean ruler a season produces. The board and the development curve both take a
ruler, so the same athletes can be looked at three ways.

**Levels are not comparable between them and the page says so in its own panel**
— boys run +3.63 VDOT higher on a track 1,500m than on cross country, +2.03 on a
3,000m. Changes are comparable, because the offset cancels in a difference.

**On a thin ruler the top hundred IS everybody**, and two identical columns read
as a result rather than as an empty comparison. Fewer than a hundred athletes
have two consecutive 3,000m seasons, so the caption detects that and says which
it is rather than printing the same number twice and letting it look meaningful.

### Best race is a residual, not a time

`log(time) = the athlete's form that season + what the meet did to everybody`,
fitted by alternating least squares over the squad's own 5,000m results with
thin meets shrunk toward no effect. The largest positive residual is the best
race.

**It covers track now, and the sentence that said it could not was stale.**
This used to read "cross country only, and not for want of trying: athletic.net
serves track as season bests, so there is one mark per athlete per event per
season and nothing to take a residual against". That was true when it was
written and stopped being true the day the bio endpoint replaced the
season-bests one. Nobody went back to it, and a reader asking "is there no way
to have an expected time for track times?" is what finally did.

Measured, the track side is the better conditioned of the two: 3,248 of
Tualatin's 4,180 athlete-season-event groups have two or more races against
1,174 of 1,231 on cross country, and there are four times as many cells.
**4,724 of 7,215 track races carry an expectation at Tualatin and 8,197 of
11,011 at Sherwood**, concentrated where the page cares - 1500m, 800m, 3000m.

**The meet term is not a course rating and must never be shown as one.** Course,
weather and where the race fell in the season are hopelessly confounded in data
where each meet happens on exactly one day — the same wall `course_value.js`
hit. What the term is good for is the residual, and there the confound does not
matter, because it is shared by everyone on the line.

The worked example is the one that sold it. Mark French's best race is 16:07.9
at Canby in September 2015, thirty-eight seconds slower than his PR. Forty-eight
Tualatin runners were at that meet and the squad averaged **9.0% off their own
season form**; he was about 3% off his. His actual PR at Sandelie rates
*negative*, because Sandelie was a fast day for everybody. That is the thing the
sport cannot currently say to a runner, and it is the reason to build any of
this.

`MIN_AT_MEET` is 5. The squad turns out 42 deep at a median meet, but a state
meet is seven to fourteen and a year where only individuals qualified is two.
Five keeps every real championship and drops the two-runner ones.

### Two things that had to be fixed to make the page and the puller agree

**A cohort counts the derived grade, not the grade a result carried.** Somebody
can race their whole senior autumn with the grade field blank on every row.
Counting the raw field files them as having left. That is the whole point of
voting on `classOf` — once it is settled it beats any single row — and it is
worth exactly one athlete in Tualatin's boys, which is the difference between
42% and 43%. `cohorts` takes the seasons table for this and there is a test.

**A cohort is counted once its senior autumn is over.** The latest school year
in the data is in progress, so including it understates that class. Both the
page and `roster.js` use "strictly before the latest school year".

**They do not print the same number, and this file used to say they did.** The
rule is shared; the population is not. `roster.js` sums every cohort in the
archive and the page sums `V.everyone(g, 'dist')` - the 748 athletes with a
mark at 800m or longer, which is what the dashboard is about. So the pull
reports **34% and 30%** where the page reports **45% and 50%**, and both are
right about their own question.

Worth the correction because the wrong sentence is the expensive kind: a
routine data pull printed 34% against a file promising 45%, which reads
exactly like a pull that has just lost a third of the record. Ten minutes went
on proving nothing was broken. A statistic takes a population as a parameter -
the rule the whole page is built on - and a note comparing two numbers has to
say which population each one is over.

### The URL is the state

Nothing on this page was linkable: no hash, no history, and the back button did
nothing. `grep` for `location.hash`, `pushState` and `replaceState` returned
zero. A coach could not send anybody a runner.

**Hash routing, not paths.** It is a static file on a CDN with no rewrite rules,
so a real path 404s on reload. `#/board?sex=boys&event=xc5k&view=top100`,
`#/athlete/mark-french-2016`, `#/program?...`, `#/plan?...`.

**Every switch writes the URL; `hashchange` reads it; both go through one
`applyRoute`.** `replaceState` for a toggle and `pushState` for a navigation,
because flipping between boys and girls should not fill the history with six
entries but opening an athlete is somewhere to come back from.

**A missing parameter means the DEFAULT, not the last value.** `applyRoute`
originally only assigned when a parameter was present, so `#/board?sex=girls`
rendered differently depending on which page you arrived from. The same URL has
to be the same page. Found by using the back button, not by reading the code.

**The slug is name plus class year**, with the athletic.net id appended only
where two athletes would collide, and the bare id always resolves as well.
Indices shift whenever the roster grows and a shared link must not rot.

`/` or Cmd-K opens a command palette from any tab, which matches on initials,
surname, class year or a time.

### The hidden attribute has to actually hide

The command palette shipped **permanently open over the whole page**, and
Escape did nothing. `.pal` set `display:flex` in a class, and a class beats the
UA stylesheet's `[hidden]{display:none}`, so `wrap.hidden=true` removed nothing.
The keydown handler then branched on `wrap.hidden` - true the whole time - so it
believed the palette was closed and fell through to the "open it" branch.

The page had already worked around this once, for the tab panels
(`section[hidden]{display:none}`), which is the tell: a workaround for one
element means the next element that sets `display` breaks the same way. It is
one global rule now, `[hidden]{display:none!important}`.

### One chart module, and the viewBox that was five times too big

`CH` builds SVG and `CV` owns the canvases. Before them there were seven chart
functions written one at a time that agreed about nothing - tick counts, whether
an axis was labelled at all, what hover did, and whether any of it survived a
theme switch.

**Every axis states its unit and its direction.** Half these charts invert
something, because faster is a smaller number, and "up is faster" is not
guessable.

**`CV` holds the three things a canvas always forgets**: device pixel ratio,
resize, and that the palette can change while the page is open. The pack chart
had none of them - a resize stretched it and the light theme left maroon dots on
white with grey labels.

**THE VIEWBOX WIDTH TRACKS THE COLUMN.** This is the single most visible fault
the page had and it was one number. Every chart was drawn on a 200-unit viewBox
at `width:100%`. On a phone that is right: a 340px column scales it 1.7 and a
6.5-unit label lands at about 11px. On a 1,008px desktop card the same drawing
is scaled **5.0** and the same label renders at **31 pixels**, bigger than the
page's own headings. The career chart measured 970 wide by 1,019 tall with 40px
axis type.

`CH.setW(px)` keeps the scale near 1.85 wherever a chart is, and `CH.W` is a
getter so every call site moved with it. Heights stay in units, so a wide column
gets a wide flat chart rather than a square one - which is what a time series
wanted anyway.

**And a panel is not one column.** Sizing every chart off the panel fixed the
big ones and broke the little ones the other way: the small multiples got a
545-unit viewBox in a 301px box, a scale of 0.55, axis type at **three pixels**.
`chartIn(id, cols)` sizes each chart against the box it is actually going into.

SVG charts cannot rescale themselves the way `CV`'s canvases can, so a window
resize past 40px rebuilds the panel on screen, debounced.

### A frame callback is not a promise

`countTo` wrote `fmt(0)` and then depended on `requestAnimationFrame`. A window
behind another window delivers no frames, so four tiles sat reading **"0
athletes on record"**. A missing animation is cosmetic; a wrong number is not.
Both it and the pack's entrance land on their value on a timer whatever the
frames do. Same family as the reveal bug: `.reveal` set `opacity:0` and waited
for `IntersectionObserver`, so a fast scroll left a whole card invisible with
nothing actually wrong.

### The Wall

Every athlete who has ever recorded a mark on the chosen ruler, one dot, above
the list. 330 boys on the 5,000m; 211 on the 1,500m.

**The dots are never filtered, and that is the argument.** The board already
says "this is a view, not the data"; a hero chart that hid everyone below the
hundredth would be that view again, larger. The toggles change which dots are
lit and where the cutoff rule falls. Hovering a dot lights its row and hovering
a row lights its dot.

**The height is fixed and the packing bends to it**, which is the third attempt
and the only one that works at both ends. A strict beeswarm is a promise this
data cannot keep: 330 boys in a 313px phone column need seventy-odd lanes
however small the dots get, and the chart becomes 1,200px of scrolling above the
list that is the actual page. Capping the lane count is worse - the overflow
piles into the last row, which reads as a bar and is not one. So dots keep a
size a finger can hit and the crowded middle overlaps. A hundred boys within
thirty seconds of each other *should* look solid.

`TIP.at(x, y, text)` exists because a canvas dot cannot carry `data-tip`. A
chart with its own tooltip would be a second thing to style, a second thing to
dismiss on Escape, and a second thing a re-render can leave on screen.

### Four years is every race

Four points and a line said an athlete had four seasons. Mark French had
**28 races** on the 5,000m and those four points were the best one from each, so
the chart showed the top of every year and hid the year.

**The cohort band is drawn per season, not across the career.** The quartiles
are a fact about a grade; interpolating them across the summer draws a claim
about July that nobody measured.

**A championship is a shape, not a colour.** Colour already carries the era on
the board and the sport on the career chart, and a third meaning on one channel
is how a page ends up needing a legend for its legend.

**It picks the ruler it can fill.** `K` is the ruler an athlete is best
*described* by, which is right for the rank and the headline and wrong for a
chart called "every race": athletic.net serves track as one season best per
event, so French came out on the 3,000m with four points under a heading
promising all of them. The chart picks the ruler with the most races and says so
when that ruler is track.

Beside it, **everybody's four years**: every career on the ruler as a faint
line, this athlete lit on top, and a toggle between everyone who started and
only those who finished. The lines that vanish are the athletes a board made of
finishers cannot see - the Program tab's survivorship argument as a picture.

### 2021 names itself, and the first version named it wrong

`thinSeason` annotates the one season on the depth chart that is not part of the
trend. **A school year starts in July, and that is the rule rather than a
shortcut.** "Cross country is the autumn half, so its school year is year + 1"
holds for twenty-one of these twenty-two seasons and is exactly wrong for the
one the function exists to find: 2020-21 ran its cross country season in
**March 2021**, 116 races, all of which the shortcut pushed into 2022.

**It looks for a missing half, not a low meet count.** Counting meets found
nothing and would have gone on finding nothing: 2021 has 15 meets against a
median of 23, nowhere near an outlier. What it has none of is an autumn. The
annotation says which months and how many meets and stops - no reason is
invented.

**Not the season in progress.** It is short every autumn for the ordinary reason
that it has not finished, and annotating that as an anomaly would make the chart
say something false once a year.

### The waterfall says the steps do not add up

"What a year here is worth" put the whole-four total on the same scale as its
three parts, so the eye read it as a fourth year. As a waterfall each step
starts where the last finished - and **the steps do not sum to the total**,
because a step is averaged over the athletes who raced both of its two years and
the total over the ones who raced grade 9 and grade 12. Different people. The
stack lands where it lands, the measured total is its own dashed bar beside it,
and a rule carries the sum across so the difference is what you see. Boys, XC
5k: +36, +18, +5 summing to +59, against a measured +77.

Drawing them landing neatly on the total would be a lie in the shape of a chart.

### Every pair is not a network

Eighteen athletes who all race each other produce **152 arcs**, which is a
hairball and says only that they are on the same team. Each athlete keeps the
three partners they finish closest to and the arcs are the union of those, so
every node shows its own pack - which is the question being asked. Nearest means
smallest median finishing gap, which is what `packs()` already ranks on.

**The lean is a scatter now, and the diagonal is the squad's own offset.** A bar
sliding either side of a centre is a scatter with one axis thrown away. Both
numbers are track VDOT, so neither carries terrain and both can simply be axes.
The line sits at the squad's median difference rather than at `y = x`, because
an offset everybody shares says nothing about anybody.

### The ghost race

Two seasons of this programme on one strip, at the pace each athlete averaged
that year, scored as an NFHS dual: everyone takes a place, the first five a
side add up, the sixth and seventh displace without scoring, and a tie goes to
the better sixth runner. A perfect dual is 15-50, which is what displacement
means.

**Nobody passes anybody, and that is the reading rather than a flaw to hide.**
Everyone runs an even pace off their season best, so the order is settled at the
gun and the only thing that changes is how far apart they are. A real race is
decided by who has a day; this asks what two squads were actually worth, and the
answer is the width of the gap after 5,000 metres. The panel says so in its own
words, twice.

Seven a side, because seven is what a team races, so a season that cannot field
seven is not offered. Scrub, play, pause, 1x/4x/16x, where 1x runs the 5,000m in
about twenty seconds.

**The verdict line said "beat" and was wrong half the time.** The two panels sit
in the order the reader picked, not in finishing order, so it read "2027 squad 30
beat 2022 squad 25" with 2022 winning. It is a neutral "v" now, with the winner
marked on its own panel and named in the sentence.

### A frame and a timer, whichever arrives first

`nextFrame` replaced every bare `requestAnimationFrame` on the page. The ghost
race proved why: the clock sat at 0:00 and the scrubber at zero while the button
read "Pause", because the callback after the first one never came. A window
behind another window delivers no frames at all.

The frame keeps the motion smooth while the page is painting. The timer is the
promise that the thing will finish. This is the same rule the app's own
`nextTick` exists for, and the same family as `countTo` writing `fmt(0)` and
stranding four tiles on "0 athletes on record".

### One selection, three charts

The Program tab draws the same twenty-two seasons three times - roster size,
squad depth, who stayed. Point at a season anywhere and it lights in every chart
that knows about it; click to keep it, Escape or click again to let go.

**A class year and a school year are not the same thing.** The class of 2016 was
here for school years 2013 to 2016, so that bar lights whenever any of those
four is picked, and picking the bar lights all four. The note says so, because a
reader watching one bar answer to four different picks deserves to know why.
Linking them as if they were the same would have been a quiet lie of exactly the
kind this file keeps recording.

### The hero's own two facts

Under the headline: a sparkline of the season bests, and where this sits against
everyone else. **The sparkline keeps its own 150x30 viewBox** rather than taking
`CH.W`, which is sized for a chart that spans a column and would draw this at
four times the size of the text beside it.

**The percentile names its population.** "Faster than 98%" means nothing alone;
"faster than 98% of the 114 boys who have recorded a Track 3,000m here" is a
claim somebody can check, and it says out loud that the denominator is people
with a mark on that ruler rather than everyone who joined the team.

**The copy-link fallback has to leave something to copy.** The first version put
a hidden field on the page, tried `execCommand`, removed the field and then told
the reader to press Ctrl-C - with nothing selected. Instructions you have just
made impossible to follow are worse than no fallback. The field stays, visible
and selected.

### Mobile and desktop, measured at three widths

Checked at 375, 768 and 1440 in both themes: no horizontal page scroll on any
tab, no SVG text under 10.2px, no overlapping labels on any chart.

**A table scrolls itself; the page never does.** Seven columns of every race an
athlete ever ran want 452px against a 305px phone column, and it was pushing the
whole page sideways - headings, charts and navigation with it. No column is
hidden, because each one is a fact somebody might want. `wrapTables` runs from
`animate()`, so a table written later gets it without anyone remembering.

**The grid has to stop before the chart does.** `.smalls` was auto-fit at a 150px
minimum, which at a 690px container gives three columns of 206px - and a
170-unit viewBox in a 206px box renders its axis type at **7.9 pixels**. 240px
gives two columns at tablet width and one on a phone. The page's own column
arithmetic has to match what auto-fit will actually do, against a named
`SMALL_MIN`.

**Labels shorten, step aside, or do not print.** Four separate collisions at
375px, all the same shape: a rotated unit label written through the widest y
tick, "grade 9 → 10" at 45 units in a 32-unit column, an annotation wider than
the bar it annotates, and two stacked-segment labels in a segment too thin to
hold one. The waterfall picks one of three label lengths off the measured column
rather than off a breakpoint, because the same chart appears full width, half
width and as one of three small multiples on the same page.

**Eighteen names across a phone is a smudge.** The pack network had 29
overlapping pairs at 375px. Two staggered rows, and any name that still would not
fit is left off rather than printed over its neighbour - every node keeps its
dot, its tooltip and its row in the table, so dropping a label loses nothing an
unreadable one would have kept.

**A hatch key was removed rather than fixed.** It was anchored start at the right
edge, so it wrote outside its own viewBox and across the chart in the next grid
cell - and the caption already said the same thing at more length and with the
reason. A direct label earns its place by saying something the prose does not.

### A chart is one tab stop, not a hundred

`CH.tip` put `tabindex="0"` on every mark, which gave the Program tab **173 tab
stops** and the Plan tab 70. A keyboard reader had to press Tab through every dot
on every chart to reach the next control, which is worse for them than no
tooltips at all.

Marks are `tabindex="-1"` - reachable by script, invisible to Tab - and the chart
itself is the stop. Left and right walk its marks, Home and End jump to the ends,
Escape puts the tooltip away. The `aria-label` says how many marks there are and
that the arrows work. Program went to 26 stops, Plan to 9, Athlete to 13. The
Board keeps 109, and should: a hundred of those are real links to real people.

### Run against history

Type a time into the Board and see where it would have landed. Two questions,
because they are different questions: where it ranks **all-time**, which is one
number over twenty-two years, and what it would have been **worth season by
season**, which is the one a coach asks — 16:40 is a scoring runner in most
years here and the sixth man in 2022.

**The typed time is never an athlete.** It is compared against a copy of the
board and never enters it, so no derivation and no published number can be
moved by somebody typing in a box. That is structural rather than careful.

**Parsing takes what a runner would type.** `16:40`, `16:40.2`, `1640` and
`16 40` are the same time; four digits are mmss and three are mss, and the
seconds half has to be a real number of seconds so `9:99` is refused. Each
ruler has its own range — 12:00–45:00 on the 5,000m — and **switching ruler
drops a time that no longer fits**, because a 16:40 is a good 5,000m and
nonsense on a 1,500m.

**Only seasons with seven are offered**, because seven is what a team races and
a season that cannot field seven has no places to take.

**The grid is one tab stop and the arrows walk it** — twenty-two focusable
squares is twenty-two presses to get past a summary. Which found the same bug
in the chart keyboard handler shipped in phase 3: a **capturing `blur`** fires
every time the cursor moves from one mark to the next, so resetting on it meant
the arrow keys always restarted at the first mark. Right, right, and you are
back where you began. It is `focusout` with a `relatedTarget` test in both
places now.

### One source for every time

The page shipped two answers for one race. `d-results` rounded to hundredths
and `d-seasons` wrote the raw float — two adjacent lines in `build_dash.js` —
so Tyler Williams' 5,000m was `963.95` in one block and `963.949` in the other,
and the formatter rounded to tenths, which the two straddle: **16:04.0 on the
Board and 16:03.9 on his own page.**

**The season block carries no times at all now.** It keeps the grade and the
race count, which are the two things only it knows, and every best is derived
from the results the way career bests already were. Rounding both writers the
same way would have fixed the symptom and left the cause: two places storing
one number.

**Times are integer hundredths in the block**, and `sec` is derived from that
integer in exactly one place, so two values from one race are the same float by
construction. Verified lossless first: `seconds × 100` is an exact float
integer for all 16,020 rows.

**The audit compares stored values, never rounded ones.** My first version
rounded before comparing and reported that the two sources agreed on all 1,112
athlete-rulers — true at hundredths, and silent about what the page was
printing. `pull/test_page.js` reads the built page's own blocks and asserts the
season block has five columns and none of them is a time, so a block that grows
one back fails before a reader sees it.

**The baseline is keyed by athlete id, and used to be keyed by their row.**
Everything inside the audit works off the index into `d-athletes`, which is
right within one run and wrong across two - the page sorts its roster, so one
athlete joining shifts every row after them. The Sep 26 pull added **Daniel
Zumwalt** at row 731 and the baseline duly reported six marks *gone* and two
career bests four minutes **slower**, which adding races cannot do. It was
holding Ian Leininger's time up against Hudson Keil's.

A baseline only ever runs across pulls. Keyed by a number that moves between
pulls it reports noise, and noise in a guard is worse than no guard: the one
real move is now hiding in a list of thirty that are not. Re-keyed, the same
pull reads **31 faster, 0 slower, 0 gone, 19 new**.

**The direction is the whole signal, so the report splits on it.** A pull that
adds races can only make a best faster. A slower one means a race the page used
to carry is gone, or a date has moved a mark into a different season - the shape
of the meet-id bug above. Faster ones are news and get eight lines; a slower one
is a question and gets its own heading.

### Meet ids are per sport, like division ids

Meet 31671 is a cross country race on 2010-09-08 **and** a track dual called
"Newberg vs Tualatin" on 2007-04-11. The two meet tables were merged on the
bare id, the track entry won, and 53 cross country results were stamped with a
track meet's name and a date three years wrong — which put Mary Howard's 2010
season best in her 2011 season, because the page works out the school year from
the date. Keyed `sport|id` now.

**A meet's date is the earliest of its own races.** athletic.net gives a meet
an `EndDate`, and a two-day championship has one of those and two days of
racing, so 147 track results were stamped a day or two after the day the
athlete ran. Anyone who raced later carries the offset in days: one extra
character on 200 rows of 24,781, and exact for all of them.

### The precision that exists, and no more

`mmss` rounded to tenths, which is nobody's rule. Asked directly, athletic.net
gives these times as **24:37**, **24:33.8** and **16:03.95** — it prints
whatever the timing produced and invents nothing. So does this page now.

Rounding to tenths did real damage beyond the drift: Tyler Williams and Nathan
Love are a hundredth apart and both printed 16:04.0, so the board ranked them 9
and 10 for no visible reason.

**A measured time and a modelled one are different kinds of number.** `secs()`
prints what a stopwatch produced; `est()` is for the times the page works out
for itself — an expectation, a projection — and rounds to the tenth, because
"17:08.02" claims a hundredth that came out of a fit over forty team-mates.

**One tie rule.** Equal to the hundredth is equal and shares a place: T-9, T-9,
then 11. Anything finer is not a difference this data can defend — athletic.net
stores hundredths and a cross country course is not measured to the centimetre.

**Two ruler-gap figures moved**, and the cause is the fix rather than a new
choice. The track-against-cross-country offset for boys went +3.63 to +3.62,
median +3.56 to +3.50, over 265 athlete-seasons rather than 264: season bests
are now derived by the calendar school year from corrected meet dates, so one
more season pairs up. Everything else held — 427 athletes, 45% and 50%
completion, 77s over four years, Caleb Lakeman first.

### Refreshing the dashboard

Two commands, and the second one is not optional:

```
node pull/roster.js 284 --name Tualatin    # the archive
node pull/build_dash.js 284                # the page
node pull/test_page.js tualatin            # what moved, and which way
```

`pull/crest.js` is not part of this. It writes a committed data URI and only
needs re-running if a school changes its mascot.

**The track side is served from a cache and that is fine in season.**
`pull/roster/t284_bio.jsonl` holds every athlete's parsed track races, so a
re-run pays one request only for athletes it has never seen - the Sep 26 pull
made **one** live bio call out of 1,580 and finished in under two minutes
against twenty-odd for a cold one. It is right in autumn, when no track is being
run. **Delete that file before the first pull after a track season**, or the
spring will be missing and look exactly like a spring nobody raced.

**Sep 26, 2026: Nike Portland XC.** 43 results, 42 of them 5,000m and one 3,000m.
+1 athlete, +1 athlete-season, 16,020 marks to 16,063. Fifteen personal bests,
the largest Annabelle Webster at 31:38.06 to 29:27.66; eight athletes got a
first 5,000m. Nothing else moved: four-year completion held at 45% and 50%, the
school record and the top three held.

**Oct 2, 2026: athletic.net re-keyed an athlete.** Aaron Lakeman (class of
2023, 68 results) moved from id 27032743 to 33135063 with every result intact,
so `test_page` reported 13 values GONE and 25 NEW. Nothing was lost. When GONE
appears, look the name up in the new athletes CSV before suspecting the pull.

**An athlete can be on the page with no mark on any ruler.** Daniel Zumwalt ran
that meet's 3,000m, which is cross country and therefore not the `tf3000`
ruler, and nothing is ever converted between distances. He is on the roster, in
the results and absent from all three boards, which is correct and which the
athlete page already renders - the tile says "no ranked ruler" rather than a
dash where a number should be.

### Metres, and a phone that fills

**"1500m", never "1.5k".** Nobody at a track meet says "the 1.5k" and nobody
writes it on a results sheet. `drawAthlete` had a local formatter that got this
right and two charts that did not; there is one `DIST` now.

**On a phone the card is the edge of the screen.** A 16px gutter each side
costs 32 of 440 on a Pro Max, and then every card spends another 14 inside its
own border — so the charts, the board rows and the Wall were drawing in 408px
while the reader was looking at 440 and seeing a margin down both sides. The
bordered surfaces pull out to the glass and keep their own padding, so text
still sits 14px in; what gains the width is everything that was measured
against the card. The side borders and the corner radius go with them, because
a rounded box against the edge of a screen reads as a mistake. `env()` so a
landscape notch still gets its inset.

**Drag-to-zoom on the every-race chart is gone.** It did not work well enough
to keep.

### A number never breaks mid-digit

The "Every mark" table is eight columns. On a 375px phone that is 42px each
under `table-layout:fixed`, and every cell wrapped wherever it liked: dates
broke as "201 / 6- / 05- / 21", Track became "Tr / ac / k", and **8:44.73
rendered as "8:4 / 4.7 / 3"**. Half of a number is not a smaller number, it is
a different one.

This file already said "a table scrolls itself; the page never does". The
scroller was there and could never fire: `.tscroll>table` was `min-width:100%`
against a table already at `width:100%`, so the table could never exceed its
wrapper and the only thing left to give was the cells. **A table that cannot
exceed its wrapper cannot scroll, it can only squeeze.**

Three changes, and the third is the one that is easy to miss:

- the floor is **per column** - `max(100%, cols * 62px)`, with the count
  travelling on the table as `--cols`. A three-column table still sits at 100%
  and nothing scrolls, because `max()` picks the wider.
- `table-layout:auto` inside the scroller, because fixed layout hands each
  column a share and lets `nowrap` content spill over its neighbour. That
  swapped a broken number for an overlapping one, with "3000 Meters" printed
  through "8:44.73".
- **`contain:inline-size` on the scroller.** Without it the table's width
  propagates up - not to the scroller, which clips it, but to whatever sizes
  the column above - and every card on the tab inherits the widest table on
  it. The Program tab grew 35px and the page scrolled sideways, which is the
  one thing this layout may not do. The property says the scroller's inline
  size does not depend on its contents, which is exactly true of a thing whose
  job is to scroll them.

Only the name column still wraps. A meet name is prose and wants the room;
everything else is a date, a time, a place or a count.

### Five tabs have to fit the narrowest phone

At a flat 14px with .07em tracking, PROGRAM wants about 75px and a fifth of a
320px screen is 64, so HISTORY hung 26px off the edge and the page scrolled
sideways - on the Board, the first thing anybody opens. It arrived with the
fifth tab and **nothing was testing 320**; the sweeps ran 375, 768 and 1440.

Scaled rather than broken at a breakpoint, the way the app sizes a team name:
`clamp(10.5px, 3.4vw, 14px)` with the tracking collapsing faster than the type
so no label ellipses. Full size from about 410px up.

**Add 320 to any width sweep.** Every layout bug found in this pass lived
below 375.

**One thing knowingly left, and later not left.** The pack network's names
rendered at 9.6px at 320px against a 10.2px floor - `--axt` at 5.8 units in a
170-unit viewBox scaled to a 282px column - and the note here said fixing it
meant moving `CH.setW`'s floor and changing every chart at every width for
0.6px on one of them. That was the wrong place to fix it: the face is set on
that one chart, so raising it there costs nothing anywhere else. See the
revamp below.

### Charts carry the shape, tables carry the numbers

Three series in a grouped bar leaves about fifteen viewBox units a bar, and
`+2.76` at a size anybody can read on a phone is wider than that. They
collided. The values moved to a table under the chart with the sample size
beside each one, which is better on a desktop too. Bars keep `<title>`
tooltips.

Same 200-unit viewBox lesson as the How tab's diagrams: a label written at 6
units renders at about 10px on a 375px column, which is too small. `--axt` is
6.5 and `--lbl` is 7.

### The audit, and the four things it found

Scripted rather than eyeballed, because every one of these had been looked at
and none of them had been seen: 32 controls clicked on every tab of both
sites, all 1,741 athlete pages rendered, every route round-tripped through the
hash, 612 parked scroll positions, and every text style on seven views in both
themes composited against what is actually behind it.

**A condensing bar cannot have one threshold.** Parked anywhere near 110px the
bar toggled up to **91 times in a second and a half**, on every tab of both
sites - the owner reported it as flicker that would not stop at just the right
position. The loop is short: condensing takes up to 87px out of the header at
320px wide, Chrome's scroll anchoring then moves `scrollY` by that same amount
to keep the visible content still, and the new `scrollY` lands back the other
side of the one threshold. Expand, anchor, condense, for ever.

So there are two thresholds and the gap between them is wider than the height
the bar can gain or lose. Both come off the header's own measured height
rather than being written down, because that height runs 117px at 1440 to
170px at 320 and a constant that works at one width is a bug at the other:
`hi = tall + 12`, `lo = hi * 0.35`, band always 65% of `hi`.

Disabling scroll anchoring was the other fix and it is the wrong one - the
anchoring is what stops the page lurching 87px under the reader's thumb. The
threshold was wrong, not the browser. **Anything that resizes the page in
response to scroll position needs hysteresis**; 612 parked positions across
both sites now show none.

**Most of the bracket was black on black.** `.bgame` is a `<button>`, and a
button does not inherit `color` - the UA hands it `buttontext`. The bracket
set a colour on the winning side's year and on nothing else, so on the dark
theme **44 of 53 scores and 22 of 54 years were `rgb(0,0,0)` on `rgb(11,10,12)`
at 1.06:1**, and seven athlete links were rendering in the browser's default
`#0000EE` at 2.10:1. `--card` was the other half: `.bgame{background:var(--card)}`
and this page has never defined `--card`, so the games had no background for
the byes' 45% to dim against.

It survived a screenshot because I knew what the numbers said. It took
compositing every layer and reading the computed colour to see it. **A
`<button>` used as a surface needs `color` as well as `background`**, and a
token that resolves to nothing fails silently.

**"Drag the slider and the board rearranges itself" waited for the release.**
The deferral had a comment giving its reason - a full redraw is "a lot of
work" - and measured, `drawRecords` is **0.4ms median, 1.0ms worst**. The
premise was wrong. But a full redraw is still the wrong call for a reason
nobody wrote down: it rebuilds `#h-out` wholesale, which destroys the range
input the reader has hold of and ends the drag. So the drag writes the three
things a date changes - the sentence, the ten, the upright rule on the chart -
and leaves the controls alone; letting go still does the full rebuild and
writes the URL. `recordSentence` and `recordTen` moved to module scope to do
it, because two copies of a generated sentence is two sentences waiting to
disagree.

**Tualatin's ink on its own accent was 3.43:1, and this file already said
so.** The colour section recorded it - "on Tualatin's #EE5566 white is 3.43:1,
which is the weaker of the two and was there first" - and nothing was done, so
every selected segment pill and every primary button on the dark theme sat
under AA. Sherwood made the same call correctly on the day it was built. Dark
ink is 5.50:1 there. The 13% accent tint under accent ink was 4.30:1 on
Sherwood and is 8% now, which is 4.56 and looks no different.

A number written down in these notes and not acted on is worse than one
nobody measured: it reads as settled.

**And the probe itself was wrong twice before it was right.** The first pass
treated the first non-empty background as opaque, which turned a 13% chip tint
into a solid and produced false findings. The second read
`color(srgb 0.98 0.97 0.98 / 0.82)` as an `rgb()` triple, so the sticky bar's
white glass came back as near-black and four more were invented. **A measuring
tool gets audited before what it measures**: 24 findings became 14 became 4,
and the 4 were all real.

Every text style on seven views, both themes, both sites now clears WCAG AA.

### Standing, drawn

A hundred rows of rank, name and time say who is faster and never by how much,
so a two-second gap and a two-minute one look identical going down the list.
Every board row carries the same bar the growth board and the Who's Who
honours already use - **a length is a standing** - scaled over the times
actually on screen, so a search that leaves three names still draws three
lengths that mean something against each other. A floor of 4%, because a row
with no bar reads as a row with no time.

It is softer than the growth board's, where the bar *is* the headline. Here
the time is, and a hundred rows of full-strength accent under a hundred names
is a second headline arguing with the first. The top three keep it.

The record book's ten get it too, for nothing: ten rows rather than a hundred,
and the shape of a record book - one name clear, then a pack - is worth
seeing.

**`display:block` is load-bearing, and finding that out is the whole reason
this was worth doing.** `.standing` sets a height and its `<i>` takes
`height:100%`. That works on the honours card, where it is a `<div>`. Inside a
board row it is a `<span>` - an inline box, which `height` does not apply to -
so the fill asked for 100% of nothing and drew **0.0px**. The Most improved
board has been shipping an invisible bar since it was written and nobody
noticed, because a bar that is not there looks exactly like a board that never
had one. Anything that sets a height has to set a display to go with it.

### The leverage, drawn

The Plan card says it in words - so many seconds outside the five, so many a
median year is worth - and the whole tab turns on the distance between those
two numbers. Three marks now: where they are, where a median year puts them,
and the line they are trying to cross.

**Faster is to the right**, the same way the Wall reads, because two places on
one page disagreeing about which way fast points is worse than either choice
on its own. Every mark is named underneath rather than left to be guessed at,
which is the rule the app's leading-card glow failed.

Absolutely positioned percentages rather than an SVG: it is repeated five
times at any column width, and a viewBox that small puts its own type under
the page's 10px floor.

### The crest, and the way home

The app already carries all 230 Oregon crests - `LOGO`, rebuilt free on every
crawl from the same `GetTree` call that finds the team ids - and a school page
needs exactly one of them.

**It is embedded, not linked.** The dashboard's CSP is `img-src 'self' data:`
with no googleusercontent in it, deliberately, and the page is one
self-contained file that fetches nothing. Linking the image would widen the
policy *and* make the page depend on somebody else's CDN staying up. A data
URI keeps both promises. `s96` rather than `s128`: a 32px crest on a 3x phone
wants 96 real pixels, and the base64 is 15KB against 23KB on a page that gzips
to 130.

`pull/crest.js` writes a **committed** artifact, so `build_dash.js` stays
offline like the rest of the build. It checks the magic number and the size,
because a CDN that has decided to say no returns a perfectly valid 60-byte
HTML page and "it wrote a file" is not the same as "it worked". Re-run it only
when a school changes its mascot.

```
node pull/crest.js 284 Tualatin
node pull/crest.js 159 Sherwood
node pull/build_dash.js 284        # picks it up from INFO.crest
```

**The masthead is the way home.** Somebody three athletes deep had no way back
to the board except the tab bar, and the wordmark is the thing every reader on
the web already tries. Crest and wordmark are one link to `#/board`, which
resolves to the default view because a missing parameter means the default.

### The class chip stands down at 320px

318 of 351 board rows ellipsised the name at 320px, and "CLASS OF 2022" was
the reason - it takes half the column before the name has finished. Measured
while adding the standing bar and not caused by it: the count is identical
with the bar, with it inline, and with it removed altogether.

The class year has a whole view of its own - the athlete page, the slug, the
palette - so it is the one thing on that row that can go, which is the call
the app already makes about the league abbreviation below 430px. The "running
now" chip stays: it is short, and it is the one fact on that row you cannot
get anywhere else at a glance. 318 down to 43, and the 43 are long names
rather than chips.

### An empty grade has to say why it is empty

`everyRace` draws one ruler over four grade columns and skipped the cohort
band for a grade with no races in it - correctly - while `gradeBands` went on
printing the grade's name underneath. So Mark French's cross country chart
carried a **Freshman** column with nothing in it, beside three full ones,
which reads as a year missing from the record. It is not missing. He raced
track that spring, which this page knows and could not say, and the owner read
the blank as a data fault. The one thing on that chart there was nothing to
say about was the only thing it was inviting anybody to look at.

The column says what the year was instead: **track that year**, **cross
country that year**, **no 5,000m** when they raced the right sport at the
wrong distance, and **no season** for a genuine gap. It wraps against the
measured column, because "cross country that year" wants eighty units and a
phone gives each grade thirty-eight.

**Only grades inside the athlete's own record are annotated.** A sophomore's
senior year is empty because it has not happened, and writing "no season"
across it would be a claim about the future - the same reasoning that stops
the twins chart drawing past the record, and the same rule `TWINS_SHOW_FUTURE`
exists for. Checked rather than asserted: 2,106 charts across the two sites,
1,192 notes, **none outside its athlete's own first and last grade**.

### A counter that grows re-wraps the paragraph around it

`countTo` writes `fmt(0)` and counts up, so its text goes from one character
to four while it runs. That was harmless while the figure had a line to
itself. The tile strip put it in a grid cell sized `auto` beside a `1fr`
column of prose, so every frame of the count resized the column and re-wrapped
the note - the owner's words were that the animations looked glitchy because
the text kept changing which line it was on, which is exactly what it was
doing.

The number is the thing that is supposed to move. So `countTo` writes the
**final** value first, measures it, and holds that width for the length of the
count: one forced layout per counter, a dozen on the busiest tab. Verified by
sampling every counter's box and its containing block three times mid-flight
across both sites and both widths - nothing changes size any more, on any tab.

### The bar is the width of the glass, so the controls are too

The sticky switches sat at their own content width against the left edge. On a
1440 desktop that is 745px of a 1,008px bar with **479px empty to the right**,
and on a phone it leaves one row filling and the next stopping short. The
groups grow to fill the row they land on and their buttons grow with them, so
every row ends where the bar ends. Measured at 375 and 1440 on all five tabs:
every row now spans the full inner width.

### The revamp: a bar, a ribbon and a rail

Both pages were a single 600px column of identical rounded cards with every
section heading set at 13px uppercase, on a phone that four readers in five are
holding. Nothing was allowed to be more important than anything else, so there
was nothing to scroll to.

**Section headings are headings now.** `--d1` is `clamp(26px,7.4vw,38px)` and
carries an eyebrow number - `counter(sec)` in `h2::before` - which is what gives
a stack of sections a spine. A section's first paragraph is a standfirst at
`--d2` and everything after it drops to 14px detail. Three sizes where there
was one.

**Sections came off the card.** Eight identical boxes on one background is a
list of rectangles, and the border plus its padding cost 36px of a 375px screen
while carrying no information. A hairline and space instead. Charts keep 5px of
padding rather than going flush: a rotated y-axis label sits at x=0 of its own
viewBox, and a chart drawn to the glass writes it into the bezel.

**The bar spans the glass and condenses.** The masthead and the controls for
whichever panel is open stack into one app bar, so four thousand pixels down you
still know it is the boys on the 5,000m. At rest it is 139px of an 812px phone -
seventeen per cent of the screen given permanently to chrome - so past 110px of
scroll `body.condensed` shrinks the wordmark, drops the counts and tightens the
tab row: **139px to 80px**. The wordmark *shrinks* rather than disappearing,
because `.themer` lives inside `.brand` and hiding the row takes the only theme
control on the page with it.

**`--vw` is measured, not `100vw`.** A full-bleed rule written in `vw` includes
the scrollbar, which is how a desktop page starts scrolling sideways by fifteen
pixels. It comes from `clientWidth`, re-set on resize. `--hdr-h` is measured the
same way by a `ResizeObserver` on the header, which is what lets the condensing
bar move the sticky control row without being told.

**The board's two fields are a second control row and deliberately not sticky.**
Three segments and two inputs came to 160px that never scrolled away - more
chrome than the board underneath it. The switches say what you are looking at
and have to stay; a search box is somewhere you go once.

**The masthead ribbon is decoration that is not decoration.** One tick a school
year, height by athletes on record, muted before `INFO.solid` and lit for the
season in progress. It says how far back the record goes and where it thickens,
which is the first thing to know about an archive and the thing a date range
cannot show. Built from the same seasons table every number comes from, so it
cannot drift from what the page says.

**The stat tiles are a hairline strip on a phone.** Two columns put every pair
on one grid row and a grid row is as tall as its tallest cell, so the four-year
tile's seven-line note left its neighbour carrying 85px of dead space.
Shortening the note was the other fix and it is the wrong one - that note is the
tile saying what it means. Below 560px they stop being a grid: number on the
right, label and note on the left with 200px to run in, every row its own
height.

### The desktop rail, and why it is a float

Above 1,080px a section is two columns - eyebrow, heading and standfirst in a
336px rail, the evidence beside it. A 1,008px column running a 66ch measure had
left four hundred pixels of nothing down the right of every section with a
heading wrapping at seventeen characters beside it, which is a phone page
stretched rather than a desktop one.

`:has(>h2)` is load-bearing: only a section with a heading gets a rail, and an
engine without `:has()` drops the whole block and keeps the single column, which
is the right thing to fall back to.

**It was a grid first and the grid separated a heading from its own
standfirst by six hundred pixels.** Heading in the rail's row 1, standfirst in
its row 2 - and a grid row is as tall as its tallest cell, so on the athlete
page the standfirst waited for a 600px career chart in the content column and
landed below the bottom of the figure it was introducing. A float has no rows:
the two rail items stack against the top-left corner and everything else clears
them by a margin. The newspaper sidebar, which is what this layout is.

**A percentage width resolves against the card, not against what is left of
it.** `width:100%` beside a 392px rail margin is 392px off the right of the
screen whatever the float is doing. The 760px rule hands figures back exactly
that, and the pack canvas carried it as an **inline** style, which no stylesheet
rule can reach - 356px of sideways page scroll at 1080. The canvas's width moved
into the stylesheet and the content column takes an explicit
`calc(100% - var(--rail) - var(--railgap))`.

**And the rail is not part of the chart's column.** `sizeCharts()` measured the
panel, which was right until a section became two columns: at 1440px the athlete
page and all three History views drew a 545-unit viewBox into a 616px box, a
scale of 1.13, every axis label at **7.3px** against the page's 10.2px floor.
The same fault as the original 200-unit viewBox arriving from the other
direction, and invisible unless measured - the charts looked fine, only small.
`colWidth()` subtracts `--rail` and `--railgap`, read out of the stylesheet
rather than written down twice. It is safe because every chart-bearing card on
both sites has a heading, which was checked rather than assumed.

**The rail is not sticky, and a tall section leaves it empty.** Making it stick
means the heading and its standfirst have to be one element, which is a markup
change across a dozen render paths. Left as it is.

### Three more things the revamp turned up

**The section treatment reached seven of nine views and the two it missed were
the ones people land on.** The athlete page and all three History views render
into `#ath` and `#h-out`, so `[role=tabpanel] > .card` walked straight past them
and every board row led to a page still wearing 13px labels inside boxes. The
selector is `:is([role=tabpanel],#ath,#h-out)>.card` now. Found by opening an
athlete page, not by reading the selector.

**A status is not the headline.** "Running now" was a solid maroon chip with
white ink, louder than the rank, the name and the time on a board that is about
the time. It is the outlined chip the graduated years wear, in the school's
colour instead of grey: still the first thing you can pick out down the column.
Measured at 5.0:1 or better in both themes on both sites.

**Four label collisions, found by measuring every pair of `<text>` boxes in
every chart rather than by looking at screenshots.**

- The waterfall's "steps sum to" ran inside the measured-total outline, because
  it was anchored at the far end of its own rule. It ends at the outline's left
  edge now, shortens to "sum 58s off", and is gated on the room that is actually
  there - a column width minus half a bar, in the chart's own units - rather
  than on the chart's overall pixel width, which says nothing about the gap the
  label has to live in.
- The record-over-time axis ticked every four years, which is a number rather
  than a measurement: forty-four seasons is eleven labels in about 170 units and
  five pairs overlapped at 320px. The step comes off the room and off round
  years, so the axis reads 1990, 2000, 2010.
- The lean scatter's name boxes ran from the baseline upwards only, so two
  labels eight units apart could still touch below the line. The box holds the
  descenders now and the width estimate went from 0.58em to 0.62em.
- The pack network's names were 5.8px, which renders at 9.8px on a 320px phone.
  6.2px, with the collision test's width estimate raised to match - raising the
  face without raising the estimate leaves a stale test. **This retires the "one
  thing knowingly left" above.**

**Verified at 320, 375, 414, 768, 1080, 1200, 1440 and 1920, both themes, both
sites, all seven views**: no horizontal page scroll, nothing past the content
column, no console errors, no SVG text under 10.1px or over 22px, and no two
chart labels overlapping anywhere. Both page audits read 0 values changed -
nothing here touches a number.

### What it says

Over distance athletes, four-year completion is **45% boys, 50% girls**, and
**29% of the boys joined after grade 9** — 41% of the girls. The girls' senior year is **negative**
across every population on the cross country ruler, and the boys' turns negative
too once you switch to the track 3,000m. None of that is visible on any board,
in any poll, or in any result athletic.net publishes.

The freshman-to-sophomore step being the largest survives on every ruler and in
every population, which is the one finding here that has not moved under any
amount of re-cutting.


## A second school

`sherwood/index.html` is the same page for Sherwood, built from the same
tooling by the same two commands. It exists because the answer to "could you
do this for another school" turned out to be mostly yes already: everything
that does the work had been written to take the school as an argument, and
what was hardcoded was the output path, one filter string and six literals in
the copy.

**Live at `sherwoodxctf.vercel.app`**, the third Vercel project, root
directory `sherwood/`, framework preset **Other** like the other two. It is
`noindex` at both the meta and header level, the same as Tualatin.

That address went unrecorded for a fortnight and had to be **guessed** -
`sherwoodxctf` by analogy with `tualatinxctf`, then confirmed by the page's own
title - when all three sites needed checking after a change. Two of the three
domains were in this file and the third was not, which is the sort of gap that
costs nothing until somebody has to verify something. Every deployed address
this repo owns:

| project | address | root | indexed |
|---|---|---|---|
| chutexc | `chutexc.vercel.app` | repo root | yes |
| tualatinxctf | `tualatinxctf.vercel.app` | `tualatin/` | no |
| sherwoodxctf | `sherwoodxctf.vercel.app` | `sherwood/` | no |

```
node pull/roster.js 159 --name Sherwood    # Sherwood is athletic.net team 159
node pull/tfmeets.js 159                   # championship track placings
node pull/build_dash.js 159                # writes sherwood/index.html
node pull/test_page.js sherwood            # its own baseline
```

**The team id came from the call the crawl already makes.** One `GetTree` on
Oregon division 87377 returns every school with its `SchoolID`: Sherwood is
**159**, and the same response gives Tualatin as 284, which is how the number
was checked rather than trusted.

**`SCHOOLS` in `build_dash.js` is two lines and should stay small.** At three
schools this wants the school to be its own file and the slug to come off it.
Factoring on the second copy guesses at which parts vary; the second copy is
what tells you, and here it said: the path, the Who's Who filter, and the
palette. Nothing else.

### The school's name is data, and the page was typing it anyway

Six literal "Tualatin"s sat in the title, the meta description, the wordmark
and three sentences of prose while `INFO.label` sat two lines from the top of
the script holding the same string. That is the fault the How tab already had
on record - a sentence that should have read from `RECORD` was typed instead
and went stale - repeated in a place nobody had looked.

`SCHOOL = INFO.label` now, and the title, description and wordmark are written
from it on load. The head keeps a literal so a reader with no JavaScript still
sees a name. **The wordmark is set with `textContent`, not `innerHTML` and not
`esc()`** - `esc` is declared two hundred lines further down and would be in
its temporal dead zone, which is the same shadowing trap `ord` and `T` fell
into on the athlete page.

It is what makes the second school a copy rather than a rewrite: the whole diff
between the two pages is the head fallbacks and the palette.

### Sherwood's colours, measured the same way and coming out different

Maroon and black, the Bowmen. `shs.sherwood.k12.or.us` paints with
**#A91E2F**, which is the true colour and fills wherever there is light behind
it.

Same rule, different answer. #A91E2F on the dark ground is **2.74:1** - better
than Tualatin's #880000 at 1.93:1 and still nowhere near readable - so the
maroon fills and a lifted crimson writes. On the light ground it needs no help
at all: **6.88:1**, so it is its own accent there, and white on it is 7.21:1.

**The lift keeps the hue and the saturation.** Mixing a maroon toward white
turns it pink, which is a different colour rather than a lighter one. The
accent is Sherwood's own hue (353) at its own saturation (70%) carried up in
lightness until it clears: **#E05262 at 5.22:1**.

**`--on-accent` is near-black on both pages now**, and that is measured rather
than a house style. Ink on #E05262 is 4.98:1 where white would be 3.78:1, and
on Tualatin's #EE5566 dark ink is 5.50:1 where white was **3.43:1** - under
AA, on every selected pill and every primary button of the dark theme. This
paragraph used to record that 3.43 and call it "the weaker of the two and was
there first", which is a measurement standing in for a decision. See the audit
section.

Sherwood's hue is 353 and Tualatin's lifted accent is also 353, so the two
sites read as siblings. That is the two schools' colours, not a shortcut.

**The favicon is a data URI and cannot read a custom property**, so each page
writes its own three circles by hand - the same trap the app's favicon has
carried since the start, now present in three files rather than two.

### Two bugs a second school found, both invisible with one

**`roster.js` could not see a 429.** Its `curl` asked for the body and the
status and never for the headers, while `crawl.js`'s has always passed `-D -`.
Two copies of one helper, one of which could read the rate limit and one of
which could not - the drift this file keeps predicting whenever a thing is
written out twice.

The cost was not theoretical. Sherwood's first pull stalled at 100 of 1,632
athletes: each 429 burned its athlete after four retries spaced 1.4 to 3.5
seconds, and the run was heading for the one-in-fifty failure floor that makes
it refuse to write at all. **A 429 is not a failure, it is an instruction** -
it gets its own ladder now, waits what the server asks for with a margin, and
does not spend the ordinary retry budget, because "the bucket is empty" says
nothing about whether this athlete's record exists.

Worth knowing: this endpoint mostly does **not** send `Retry-After`. The header
is read when it is there and the fallback is 23 seconds, so the fix that
actually matters is the long wait and not burning the athlete. Do not record
this as "it reads Retry-After now" - it reads it when offered.

**Eleven schools carry a trailing comma in the Who's Who four-year list.**
Crescent Valley, Elgin, Lakeridge, Lincoln, Madison, Oregon City, Redmond,
Sherwood, Siuslaw, South Eugene and Waldport. The source line runs
`... Kylie Thalhofer, Sherwood, 2008-2011` and the name/school split keeps the
separator.

Tualatin has no such row, which is the only reason this survived: the page
filters on an exact string and `"Sherwood,"` is not `"Sherwood"`, so the first
other school picked up dropped an athlete on it - Kylie Thalhofer, 545th
all-time. Silent, and permanent. `school()` strips trailing punctuation and
nineteen rows were corrected.

**A co-op is left exactly as published.** `Sherwood/Jesuit`, `Bend/Mt.View`,
`Grant/Central Catholic` and the rest are two real schools, and deciding which
one owns the athlete is a guess. The rule here has always been that an entry
which does not match is reported rather than guessed at, so Bailey Schuttle
stays under `Sherwood/Jesuit` and off both boards.

### What Sherwood holds

**953 athletes on the page**, 2,830 athlete-seasons, 22,293 results, 638 meets,
from an archive of 1,702 athletes - the other 748 are sprint-only and stay in
the CSVs for the same reason they do at Tualatin. 1,039KB on disk.

**Fourteen Who's Who honours.** Both teams ranked all-time: the girls **34th in
Oregon** off 28 trips to State, the boys 95th off 15. Eight four-year State
qualifiers. Four all-time State-meet bests, of which **James Crabtree is 11th in
Oregon** at 15:04.

### FIRST_SEASON was a Tualatin-shaped constant

It was 2004, carrying the note that "athletic.net's Tualatin coverage thins out
before this and stops entirely before 2004". Measured, that is wrong in both
halves, and a reader asking whether one athlete made the board is what found it.

**Sherwood answers back to 1969** - sparsely, one to eight athletes a season
through the seventies and eighties, and continuously from 2001. 94 pre-2004
athlete-seasons that a 2004 floor drops on the floor.

**Ross Krempley is the worked example.** Class of 1997: a 16:41.0 cross country
5,000m in November 1995 and five track marks in his senior spring, including a
**48.83 400m** and a 1:54.03 800m. He clears the page's 800m floor, so he
belongs on the board, and he would have been silently absent from it.

**Tualatin has the same hole and still has it.** Measured the same way: results
in both sports back to **1993** - thin in cross country, and 12 to 29 track
athletes a season through 1993-2003 that the pull has never asked for. Kate
Alexander raced cross country in 2002 and the live page has her starting in
2005. The floor is 1969 for every school now; Tualatin needs a re-pull to
collect what that reaches, and it will move published numbers.

**The horizon assertion was passing for the wrong reason.** `test_roster.js`
had `horizon <= FIRST_SEASON`, which held because the constant was too *late*:
the bio endpoint reached 2001 and the pull started asking at 2004. Lowering the
constant broke it, which is the test doing its job about a claim that had gone
stale. It now asserts the horizon equals the earliest school year the data
actually holds, and that a pull cannot hold a season it never asked for.

### Summer is not the season, except when it is

The statewide seed has always cut at `SEASON_START`, 08-15, because athletic.net
files July camp time trials under the season. `roster.js` never learned it, and
Sherwood surfaced it as **seven races landing on no season row at all** -
counting toward a career best while carrying no grade, which `test_page.js`
caught on the first build. Tualatin has five of the same thing and they never
orphaned, because its summer races happen to fall in a school year it also
raced cross country in. Luck, not correctness.

**The first fix was too blunt and deleted a national championship.** Dropping
everything between July 1 and August 15 took 70 track rows off Sherwood, and
four of them were **The Outdoor Nationals Presented by Nike** - where Jeffery
Rogers ran 3:58.81, one of the better 1500s this programme has. The outdoor
season's tail genuinely falls in early July. What does not belong is the thing
that runs every week all summer.

So the window is **necessary and not sufficient**: inside it, a meet is dropped
when it names itself a series, an all-comers meet, a camp, an intrasquad or a
time trial. `tfmeets.js`'s `CHAMP` regex was the obvious authority and is the
wrong one - it knows district, state, league and OSAA, which is Oregon high
school, and Nike Outdoor Nationals is none of those.

A name test is the fragile kind of rule this file keeps warning about, so **the
pull prints every meet it drops this way**, with counts. Steens Mountain's
uphill 5k appears three times under three different capitalisations, which is
the sort of thing that list is for.

**The filter sits where rows enter the list, not where they are fetched.** The
resume cache on disk was written before the rule existed and still holds July
rows; filtering only what comes off the wire would let a cached athlete keep
theirs, so a resumed run and a cold one would disagree.

### Three projects share one .vercelignore

The trap is unchanged and now has one more way to spring. The file is applied
at **upload** time, before any project narrows to its root directory, so
listing `sherwood/` there to keep the page off chutexc would strip it from the
Sherwood project's own upload and deploy it empty - every path 404, which is
what `X-Vercel-Error: NOT_FOUND` means rather than `DEPLOYMENT_NOT_FOUND`.

So the split runs the other way round, as it already did: the school folders
ship to every project and chutexc's own `vercel.json` redirects `/tualatin/*`
and `/sherwood/*` to `/`. Redirects are matched in the routing phase before
static files; a rewrite would not work, because those run after the filesystem
check and the page would still be served.

**Each school keeps its own baseline.** `pull/test_page.js [slug]` reads
`.page-baseline-<slug>.json`, because a baseline is a statement about one
page's numbers and two schools share none of them.

### An expected time for a track race

`log(time) = the athlete's form that season + what the race did to everyone in
it` is the same fit cross country has always used. **What changes is what
counts as one race.** Cross country has a single event, so a meet is a race.
Track does not: the 1500 and the 100 at one meet share a date and nothing else,
and wind down the home straight is not even the same sign for both.

So the cell is **meet + distance + division + round + clock**, and each of
those four earns its place:

- **Distance**, because a meet effect on a 100m says nothing about a 1500m.
- **Division**, because the JV 1500 and the varsity 1500 are two races run in
  different company. Sharing an effect lets the varsity field set the
  expectation for the JV one. Twenty-nine distinct division strings turn up,
  including meet-specific heat names like "Thursday Twilight" and "Coach Moen";
  they fragment the cells, which costs coverage and never costs correctness.
- **Round**, because a prelim is a heat run to qualify. An athlete easing off
  the last hundred to place fourth is not having a bad day, and giving prelims
  their own cell is what lets the fit say so: the cell absorbs "everyone here
  was jogging" and the residual comes out near zero. That is a modelling
  choice rather than a mechanical one and it is the one most worth arguing
  with.
- **Clock**, because a hand time runs about a quarter of a second fast. That is
  nothing on a 5,000m and most of the spread on a 100m. Tualatin has **2,173**
  hand-timed marks, so this is not a rounding concern.

Exhibitions are dropped outright rather than given a cell: there is no day for
a mark taken deliberately outside the competition to be measured against.

**The worked example.** Mark French's district double, 13 May 2016: a 1500m in
3:59.63 against an expected 4:02.0, and a 3000m an hour later in 8:33.45
against 8:45.6 - twelve seconds up. Those were the two best races of his senior
track season and nothing on the page could previously say so.

**`bestRace` is still cross country only**, deliberately. Residuals are
unitless so they compare arithmetically, but the spread of a 100m residual is
not the spread of a 5,000m one, and whichever event is noisiest would win.

### Four fields the bio row was throwing away

`Round`, `FAT`, `Exhibition` and `Division` are all on the raw result and were
all being discarded. They are written to the results block as **deviations
from the ordinary case** - a final, on an automatic clock, not an exhibition,
in the modal division is the empty string - because the ordinary case is most
of twenty thousand rows. Cross country is empty there by nature.

`Wind` is on the row too and is not kept. For a sprint it is the single largest
thing a meet effect currently absorbs, and it is the obvious next refinement.

### The grade that was never checked

athletic.net's "grade unknown" sentinel is **99**, and
`classOf = schoolYear + (12 - grade)` turns that into a class of **1938**.
`bioRow` read the grade map raw where `gridRow` and `recordRow` had both always
gone through `gradeOf`. Seven athletes shipped on Tualatin's live page with
class years between 1917 and 1938, and one of them was not a person at all:
**"Relay Team"**, athletic.net's placeholder for a relay entry, published as an
athlete with a class of 1925.

A reader spotted Evylee Bugher on Sherwood before any test did. There are three
assertions now - no class year outside the record, no entry grade outside 9 to
12, and no relay entry published as a person - and they were red against the
committed data until the re-pull landed, which is what an assertion is for.

The same check drops the grade 6 and grade 8 rows, which are middle-schoolers
in an open race rather than a cohort.

### A grade that is not a high school grade

`byGrade` has bins for 9, 10, 11 and 12 and nothing else, so any other grade
reaching it is `bins[undefined].push(...)` and the athlete's **whole page
renders empty**. `gradeMap`'s fallback path had always tested the range; its
lookup path never did.

**Seventeen athletes across the two schools had one.** Grade 8, 7 and 6 are
middle-schoolers who raced up, which is real and stays in the archive; 13 and
21 are upstream nonsense. Every one of those pages was blank and had been
since `gradeMap` was written. Nobody had clicked one until somebody clicked
**Evylee Bugher**, who ran a track season here in grade 8.

Both paths go through one `HS_GRADE` clamp now. The audit lifts that rule out
of the page **by text** rather than restating it, the way `test_crawl.js`
lifts the crawl's write guard, and it was verified non-vacuous the same way:
put the bug back and the suite fails.

Worth generalising past this one line. The bug was a *missing* check sitting
two lines above an identical check that was present - the same shape as
`bioRow` reading the grade map raw while `gridRow` and `recordRow` both went
through `gradeOf`. **When one branch validates and its neighbour does not, the
neighbour is the bug**, and neither of these announced itself: one produced a
class of 1938, the other produced nothing at all.

And the thing that actually caught them both was a reader clicking a name.
3,482 athlete pages across the two sites now open under a headless browser
with zero empty and zero thrown, which is a check worth re-running after
anything that touches `drawAthlete`.

### ID_ALIAS: one person, two profiles

athletic.net carries duplicate athlete records and the page reads each id as a
separate career - two athletes who each stopped after a year rather than one
who did not. That is counted in the retention figures.

The puller **reports collisions and never resolves them**, because a name is
not an identity: two brothers share a surname and a transfer shares nothing.
`ID_ALIAS` is four decisions somebody made by looking, each written down with
its evidence:

| stray | keeps | why |
|---|---|---|
| 21091465 | 30367518 | Evylee Bugher, Sherwood - 3 marks against 73, overlapping in 2025 |
| 5699195 | 289980 | Kanya Sesser, Tualatin - 3 against 58 |
| 22188148 | 22081316 | Caroline Fischer, Sherwood - grade 9 in 2023, grade 10 in 2024, same sprints |
| 15115875 | 30847929 | Eli King, Sherwood - one 100m at 12.27 inside the other profile's 12.23-12.91 |

Applied at **one choke point**, where every row is first in one place, rather
than inside the three row parsers. The tests assert what is testable: that no
stray id still carries results and that `canonId` moves each one.

### The cache holds the response, not what we made of it

It used to hold parsed rows. That survives a dropped connection, which is what
it was built for, and it does not survive a change to the parser - and the
parser is the thing that actually changes. Three parser changes in one
afternoon meant three cold pulls of about an hour a school, for data already
sitting on disk.

It stores the raw response now, and `parseBio` is shared by the cache and the
wire so a resumed run and a cold one cannot diverge. **A parser change is a
re-parse: seconds, no network.** It earned the four minutes back within the
hour, when the shrink guard refused a write and both schools re-ran from cache.

A cache line with no `raw` is the old format and is treated as absent, so the
first run after the change is cold and every run after it is not.

### Depth: what the page needs against what the archive keeps

The expensive half of a pull is one request an athlete, and **about half those
athletes are sprinters the dashboard never shows**. Which is which is known
before a request is spent: `GetTeamAthleteRecords` returns a season best per
event, so anybody who has ever contested 800m or longer has a row saying so.
Nobody is guessed at.

Tualatin went from 1,643 requests to **794**, Sherwood from 1,703 to **953**.

**Nobody is dropped from the archive.** What changes is depth: a distance
athlete gets every race, a sprint-only athlete keeps the season bests the
roster call already returned, which is what the archive held for everybody
before the bio endpoint existed. `--deep` restores the old behaviour.

**And the shrink guard had to learn about it.** It compares total rows against
the previous pull and fired on the first shallow one: 24,824 to 18,797, a
quarter gone, which is exactly the shape of a partial crawl. Lowering the
threshold would have blinded it to the real thing it catches. So the pull
records its `depth` and the guard compares like with like - same depth, same
question; different depth, and the row count is not evidence either way, so it
falls back on the roster count, because people do not disappear because you
asked for less detail about some of them.

A meets file with no `depth` on it predates the idea and means **deep**.
Reading a missing field as "same as now" is how the guard went on firing after
it had been taught not to.

### The horizon is a school year

It was the minimum athletic.net **season label**, which is the same number for
track and one less for cross country. Tualatin's single 1982 race - run on the
4th of December - put the horizon at 1982 while the earliest row in the seasons
table said 1983, so the page advertised a start date with nothing behind it.
Both `horizon` and `solid` are school years now.

### What the deeper floor found

**Tualatin: 1983-2026, 790 athletes** (was 748 over 2001-2026), 16,189 marks.
**Sherwood: 1969-2026, 951 athletes**, 22,295 marks.

**Meghan Peyton's freshman autumn is first-hand now.** Every earlier version of
this pull started at 2004, the bio endpoint reaches 2001, and both had her
starting in a spring with the autumn before it inferred. The cross country grid
actually holds it - **19:21.0 on 2000-11-04, grade 9** - and nobody had ever
asked it for a season that early. The inference was right and the evidence for
it is now direct.

**Two published figures moved and both moved for a reason.** Tualatin's girls'
four-year completion went 50% to **51%**, one athlete, from the deeper floor.
And one season best got *slower*: Mason Siewert's 2027 cross country best was
23:46.04 at the **Steens Mountain uphill camp 5k**, which the summer rule now
drops, leaving his real best of 24:18.46. The audit flagged it as a slower
value, which is exactly why it splits the report by direction.

## Two coach questions on the What if tab

**"Who can't we lose?"** (`runLose`) sits each of the seven out in turn against
identical simulated seasons and promotes the team's **eighth** - `buildModel`
now keeps `team.bench`, the next runner by rated mark, because the seed is
twelve deep and a real team would put that runner in. The substitution is an
`adj` on the missing runner: their draw, slowed to the eighth's level, so the
comparison stays paired. No eighth, the team runs six. It reports the chance of
reaching Lane without each runner and the points the team gives up at its league
championship - including the sixth and seventh, who score nothing there and are
still worth points by finishing in front of other teams' scorers. On Tualatin
boys: losing the #1 takes them from 26% to 6% and costs 18 league points; the
sixth and seventh are worth about a point each.

**"Who do we have to beat?"** (`runBeat`) keeps every simulated league
championship and splits the chance of reaching Lane by the result against each
rival. `runWorlds` takes an optional per-season function for it. Three shapes,
chosen by what the numbers say rather than by one template:

- **several rivals swinging it about equally** - the answer is how many of them
  to finish ahead of. Tualatin boys: ahead of all three of Lakeridge, Lake Oswego
  and Oregon City, 100% (that is second, an automatic place); two of three, 21%
  (third, the at-large pool); one, 0%. Leading with a single name there was wrong
  and was the first version.
- **one rival** - "X is the one", with a line for winning by 20 or more.
- **a team that is nearly certain** (85%+) - the one result that could keep it
  home, chosen as **the loss that hurts most when it happens, not the one that
  happens most**. Picking by frequency named Sunset for Jesuit, a loss that
  leaves Jesuit at 98%; the real danger is Mountainside, 4% likely and 68% after.

## Lane-equivalent times: measured, not built

Asked whether a mark could be shown as "what it is worth at Lane".
`backtest/lane_equiv.js` converts each state finisher's race-rated marks with a
Lane factor learned from the other seasons and compares with the clock at Lane:

| weeks out | typical miss | two in three within | nine in ten within |
|---|---|---|---|
| 4 | 1.6% (17s on a 17:00) | 25s | 47s |
| 2 | 1.7% | 25s | 46s |
| 1 | 1.5% (16s) | 23s | 41s |

About 3 seconds (15%) better than the same conversion from a plain season best
(`--raw`). **Lane itself runs 1.5-2% fast or slow from one year to the next**
(2022 -1.8%, 2023 +1.4 to +2.3%), about 20 seconds, which is weather and nothing
a conversion can know - a third of the error. So it would be honest as "a
typical day at Lane, give or take 25 seconds", not as a prediction of the clock.

## A ranking is not a forecast

The Track record scores three things on the same raw season bests at every
horizon (`RECORD.vsRanking`): **a plain ranking** where the fastest N go to
state, **season bests run through OSAA's league and at-large rules**, and the
board. From six weeks in, ignoring the rules costs 10-12 real qualifiers of 144 -
every season three to five teams inside a ranking's top sixteen stay home as
third in a strong league (Lincoln boys, 8th in the state in 2023) and three to
five from its twenties and thirties go (Clackamas boys, 32nd in 2022). **Eight
weeks out a plain ranking is better, 112 to 107**, because September has too few
races to read league places, and the page says so rather than hiding it.

**It names the method, never the site.** athletic.net does apply OSAA's rules -
it runs the state advancement after the league championships. What a ranking or
a whole-classification hypothetical meet does not do is project qualification
before them. "athletic.net ignores OSAA's rules" would be false as stated.

Against a season-best projection with the rules applied (`baseline.js`, its
reconstruction from meet dates), qualifiers are level at every horizon;
champions 18 of 32 to 14; and a season-best list states 28 to 74 wrong calls a
horizon as certainties where the board, from six weeks, states none.

## The How tab's design

It read as one paragraph at one volume: 13px body, 10.5px captions, 9.5px
labels, headings a point above the text, a box around everything. Scoped under
`#p-doc` at the end of the sheet: section headings are display lines with a
hairline above; the first paragraph under each is a standfirst in the text
colour; body is 15.5px on a 64ch measure; figures sit on a borderless surface
and run to the glass on a phone, which is what lifts the smallest diagram label
from 9px to 10.3px; above 600px they cap at 500px so labels stop near 14px
instead of ballooning to 24. Stats and the scorecard are ruled lists, not tiles.
Captions, notes and table text take `--muted`: `--dim` is 3.8:1 on the dark
ground, under the 4.5:1 small text needs. In tables a figure never wraps and the
label column does; the season table scrolls instead. **No eyebrow labels and no
section numbers** - the headings carry the hierarchy.

**The stats under the first diagram are counted off DATA** (`syncHowStats`).
They had been typed once and sat at 2,221 athletes and 2,974 results for a month
while the database passed 3,500 and 9,000.

## Race ratings, and a scorecard that can see them

**Every mark is divided by how fast its race was on the day before the model
sees it.** That is Bill Meylan's idea from Tully Runners - rate the race, not the
course - done as a fit rather than by judgment, and it is the first course
correction this project has measured as helping rather than hurting.

**The Called It archive straddles the change.** Every entry up to Sep 26 was
taken on raw marks at a 2.3% race-day dial; entries from the next refresh on are
race-rated at 1.6%. The archive records the sigma on each entry, so the dial
change shows; the race ratings do not, so when November scores the archive, a
column that moves between Sep 26 and the next entry moved partly because the
model did.

### Why the old course adjustment failed, and what fixes it

`fit_courses.js` fitted `log(time) = athlete + course` with **one** ability per
athlete for the season, so the course term soaked up about 1% a week of fitness
and forecasts got 3% worse. Meylan never has that problem: he compares each race
against runners' ratings as they stand, which already hold the fitness gained.

`fitRaces` (in `pull/seed.js`, so the crawl, the browser harness and the backtest
run one implementation; `backtest/race_ratings.js` re-exports it) fits

    log(time) = athlete + tau x week + race + noise

with the race terms shrunk toward zero by n/(n+8) and medians throughout.
**`tau` is fixed, not fitted: `RACE_TAU = -1`, a runner 1% faster a week.**
Fitted freely it swings from +18% to -20% a week between cutoffs, because with
the races barely shrunk, "everyone got fitter" and "the later races were quicker"
are the same equation. Chosen by leaving one season out, the rate came back -1 or
-1.25 every time. A race is a meet and a gender. A mark nobody can rate (no id,
no date, a race nobody raced twice around) keeps a factor of 1.

**The seed carries it as a `race` column** - `1.0500` means the race was 5%
slow - and the time actually run stays in `mark`. `buildSeed` ranks and trims on
the rated value; `parseCSV` reads it as `f`; `buildModel`, `draftPool` and
`stateModel` divide by it. Nothing a reader sees is ever the rated figure:
`sbRaw` is the time run, the same rule as the 3-mile conversion. On the Sep 26
data every 5,000m mark is rated, from 6% fast to 10% slow, median 0.985.

### The scorecard was the problem

Every earlier test - `MARK_W`, course adjustment, race ratings at team level -
came back "better in about two thirds of bootstrap draws". The team backtest
scores a yes/no over 144 qualifiers in four seasons, most never in doubt, and it
cannot see a 2% effect. **`backtest/athlete_level.js`** scores the thing every one
of those changes is actually about: each athlete's championship time, predicted
from marks at the cutoff, centred per race. 6,000-odd paired observations.

| weeks out | shipped (raw marks) | race-rated | wins |
|---|---|---|---|
| 8 | 3.32% | 3.27% | 64% |
| 6 | 2.90% | 2.62% | 100% |
| 4 | 2.31% | 2.14% | 100% |
| 2 | 2.02% | 1.85% | 100% |
| 1 (state only) | 1.75% | 1.57% | 100% |

Robust standard deviation of the error; "wins" is the share of cluster bootstrap
draws. **Leave one season out, the held-out error falls in every season: 1%, 8%,
6% and 15%, 7.3% pooled.** Race ratings with no week term help at six weeks and
turn worse than raw from two weeks in - the confound, reproduced. Carrying marks
forward to race day at the same rate hurts late, because improvement slows.

At the team level the same change is about 2% better and indistinguishable from
luck (65%), and `backtest/oracle.js` says why.

### Where the team error lives

`oracle.js` runs the simulator on the board as it was, on the real league
championship lineups, and on those lineups with every mark up to the day before:

| weeks | board | real lineups | everything | error that did not exist yet |
|---|---|---|---|---|
| 8 | 0.1388 | 0.1450 | 0.0549 | ~60% |
| 6 | 0.0650 | 0.0655 | 0.0549 | ~16% |
| 4 | 0.0575 | 0.0602 | 0.0553 | ~4% |
| 2 | 0.0527 | 0.0551 | 0.0551 | none |

**Knowing the roster does not help** - "fastest seven on current marks" already
picks the right runners. **Eight weeks out most of the error is information that
has not happened yet** (19% of eventual scorers had no 5k mark at all), which no
method can recover and the horizon allowance is right to cover with width. **From
four weeks the team board is at the ceiling** of this simulator: what is left is
race day and the model's structure, which is why better times cannot move the
team score late while they visibly improve the athletes.

### Race-day spread: 1.6%, not 2.3%

`CAL.sd` was the spread of the **gap between two races** (fair-course meet to
state), and a gap carries two races of luck, so one race's is 2.3/√2 = 1.6.
The backtest agrees on its own: allowed below 2.0, the best total spread four and
two weeks out on raw marks is 1.4-1.6%, and at 2.3 the October boards were too
cautious. **`publish.js` had been starting its sweep at 2.0 and picking 2.0** -
the bottom edge, which this file's own rule calls unmeasured. It starts at 1.0
now, and scores race-rated seeds (`CUTOFF-race-1`), because what is published has
to be what ships. Dial presets moved with it: 1.1 / 1.6 / 2.8.

### Measured and not shipped

Kept here so nobody has to rediscover them.

- **Teammates share far less of a race than assumed: 8%, not `TEAM_SHARE`'s
  30%** (ANOVA of championship residuals by team). **Blow-ups are far commoner
  than a skewed bell curve**: beyond four robust SDs slow, 1.1% of real finishers
  against 0.03% simulated; beyond six, one in two hundred against none.
  `athlete_level.js --noise` measures both. **Neither changes the team forecast**
  (`noise_value.js`: 46-51% of draws, identical pooled Brier) - less sharing and
  more disasters roughly cancel, and a disaster usually lands on a team that was
  safe or out either way. `setNoise(share, blowP)` and `BLOW_P` stay in the code,
  switched off, so the test can be re-run.
- **Boys and girls, separately.** Boys pick 1.25%/wk and girls 1% in every
  held-out season - consistent, and worth a hundredth of a point. Girls want a
  tighter spread than boys from six weeks in (their team scores are further
  apart) and a wider one at eight; splitting gains under 1% on flat curves. One
  rate and one spread for both.
- **Per division rather than per meet** could not be tested: the backtest's season
  grid carries a division name only for the championships (14 of 153 meet-genders
  in 2024). It needs the slow meet-by-meet pull.
- **Rough courses, Sep 30.** Ultimook and Three Course Challenge rate about 9%
  slow and are right on average, but individual results there scatter twice
  as widely as at a normal meet (IQR 6-7% against 3-4%), and `MARK_W` leans on
  each runner's best rated race, so a good day on a rough course goes straight
  into the odds: Neah-Kah-Nie's three runners held 89% of the 3A boys'
  individual title between them, Knappa's 85% in 2A/1A. Two fixes were scored
  on the four seasons' race-rated seeds with paired random draws:
  **capping** a best mark at N% inside the next-best (2, 3, 4, 6%) was worse at
  every N, for qualifying and for winning; and **shrinking marks from
  high-scatter races** toward the runner's median, by (median scatter / race
  scatter)^2, won the win predictions in about 80% of bootstrap draws and lost
  the qualifying ones in about 70%. Neither shipped. The sensitive test is
  `athlete_level.js`, which needs `backtest/raw/` (gitignored, rebuilt by
  `pull_season.js` from a home connection); run the shrink there before
  deciding again. A cap throws away real late-season breakthroughs, which is
  why it lost.
- **Per classification** could not be tested: every backtest season is 6A.
  Pulling 5A and 4A for the same seasons is about 1,000 requests; the right
  design is one algorithm with each classification's parameters shrunk toward it
  in proportion to how little evidence that classification has.

```
node backtest/athlete_level.js 1000 --taus=0,-0.5,-1,-1.25,-1.5 --bygender --noise
node backtest/oracle.js 4000
node backtest/race_value.js ; node backtest/race_sigma.js ; node backtest/noise_value.js
node backtest/build_season.js <year> --race=-1   # the race-rated seeds publish.js reads
```

## How the simulation works

One "season" is: draw times → score seven league meets → allocate 14 automatic
and 2 at-large berths → **redraw all times** → score the 16-team state meet.

The redraw matters. A team that got hot at districts starts again from its
marks. Carrying one draw through both would amplify luck instead of averaging it.

**Sampling.** Each race draws from an athlete's top three marks, weighted by
`MARK_W` — an explicit table, `[[1], [0.67, 0.33], [0.50, 0.30, 0.20]]`, with a
row per mark count and the best mark leading every row (`pickMark`).

**This paragraph said "25/50/25, renormalised when fewer exist" for weeks after
that scheme was replaced**, which is the description of the bug rather than the
fix. Truncating `[0.25, 0.50, 0.25]` and renormalising handed a two-mark athlete
`[0.33, 0.67]`, two thirds of the weight on their *slower* race, which was a
penalty for racing more often. The table exists precisely so that cannot happen.
Anybody reading only this section would have described the model wrongly, and
somebody did.

Live as of the Oct 2 pull: **3,245 of 3,623** athlete-boards carry two or three
marks, **90%** (85% on Sep 26), up from 53% in mid-September and 348 of 1,172 before the
automated pull. That is the ordinary case now rather than the exception.

What the weights still cannot do is judge a second mark fairly, because a slower
race and a harder course look identical — **open item 1**, not item 2, which is
the shipped horizon allowance and has nothing to do with marks. Re-run
`markw.js` when the course/date confound breaks; the gradient toward the best
mark should flatten.

**Noise.** `time = mark × (1 + teamShock + individual)`. 30% of variance is
shared across a squad (`TEAM_SHARE`); variances add, so the two components are
`√0.30` and `√0.70` of the dial. Independent draws cancel inside a five-runner
sum and made favourites look far safer than they are.

Individual noise is right-skewed (`skew()`): slow half stretched ×1.45, fast
half compressed ×0.75, then recentred and rescaled so the dial still means one
standard deviation. Good days are capped by fitness; bad ones are not.

There is deliberately **no meet-wide shock**. Multiplying everyone in a race by
the same factor cannot change finishing order.

**Calibration** (`CAL`). Race-day spread is **1.6%** - the 2.3% below is the
spread of the gap between two races, and one race's is that over √2 (see **Race
ratings**). From 2025 athletes who ran both a fair-course meet and the state meet
at Lane:

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

**Qualification** (`playDistricts`). Top two per league auto-qualify. Third- and
fourth-place teams enter the at-large pool, ranked by the committee rule below;
a fourth-place team is only eligible once its own league's third is taken. Two
at-large spots.

**Head to head decides the at-large order, because OSAA says it does.** The
2025 seeding criteria (`osaa.org/docs/planbooks/XCSeedingCriteria.pdf`) list
what the committee weighs: district order, district score against the automatic
teams, last year's state results for district strength, and "head-to-head
competition with more consideration given to meets later in the season".
`rankByCommittee` does a Borda count over the pool: for each pair, the real
head-to-head record this season where they met, otherwise the simulated
district-day five-average through a logistic ten seconds wide. Meetings are
weighted `e^(day/28)`, so a race four weeks later counts e times as much.

Measured before it shipped (`backtest/atlarge_h2h.js`, real pools 2022-2025,
32 picks): scoring-five average **26 of 32**, this rule **28 of 32** (27-28
across tau), random about 11. District score margin, the committee's second
criterion, is a poor predictor alone (13) and makes head-to-head worse when
blended in. +2 of 32 is not distinguishable from noise - a sign test across
boards is p ~ 0.6 - so it ships as the committee's own stated rule, which
does at least as well, not as a measured improvement. Only 44% of
cross-district pool pairs meet in a race before districts, so most pairs still
fall back to time.

`H2H` is a constant beside `RACES`, written by the crawl (`Seed.headToHead`,
`patchH2H`): per board, the teams and every meeting as `[a, b, "MM-DD", scoreA,
scoreB, result, meetId]`. **A meeting is the same meet AND the same division** -
varsity and JV share a meet id - which is why `resultRow` now carries `div`;
rows without one are skipped, not guessed. **And only each team's A race
counts**: the division where its own five ran fastest at that meet. The first
version paired every division, and Grant and Franklin girls "met" twice at Nike
Portland on one afternoon - varsity and their JV fives. Caught on the overlay,
not by a test; `test_seed` now has both fives in a JV race and a star in an
individual elite race, and asserts one meeting. The score is the dual those two
would have had in that race (`dualScore`: their runners only, seven a side,
sixth breaks a tie), not the meet's own team scores. `buildModel` folds it into
an n-by-n matrix (`h2hMatrix`, NaN where they never met); Next season gets none.
`model.js` lifts both functions but not `H2H`, so **the backtest still ranks on
time** and the published Track record is untouched by this.

The same table is shown: every team overlay and Team page carries "Head to head
this season", rival by rival, latest first (`h2hFor`, `h2hBlock`).

**The at-large count is a season's rule, not a constant.** OSAA sets it each
year and it has moved: 2024 and 2025 both ran 14 automatic + **4** at-large
(18 teams at Lane), 2026 runs 14 + **2** (16). The 2026 figure is confirmed
against OSAA's own qualification page, so `AT_LARGE=2` is right for this
season - but check it each August, and never assume a past season used it.
The backtest sets it per season from that year's results.

## The horizon allowance (open item 2, shipped)

**`total² = raceDay² + drift²`.** `CAL.sd` still means race-day spread, which
is what the dial's own helper text says it means. The drift covers the eight
weeks between the last result and Lane: training, injury, runners arriving and
leaving.

**The curve is read off `RECORD.horizon`, not written down.**
`drift = sqrt(best² − raceDay²)` at each measured cutoff, so re-running
`backtest/publish.js` moves the curve with the evidence. Today that is
5.54% at eight weeks and 1.21% at six, and zero from four weeks in, where the
best-fitting dial is already below the race-day floor.

**Between the measured points it interpolates. Outside them it holds the nearest
measured value.** Eleven weeks out is not something the backtest has ever looked
at, and a curve through four points should not be asked about a fifth.

**`STATE_DATE` is `2026-11-07`, from OSAA's own season dates page.** Check
it each August with the qualification allocations: the championship is not
always the same Saturday. The four backtested seasons ran Nov 5, Nov 4, Nov 9
and Nov 8.

**What it does to the board**, 6A boys on the September data: the favourite's
chance of winning falls from 44% to 24%, qualifying comes off the ceiling
(99.9% to 90%), and the field spreads. **The leader changes**, because Lincoln's
five is more robust to noise than Grant's. That is the calibration fix the
backtest asked for, worth about 9% off the error at this range with no new data.

**It narrows on its own, and five refreshes running have shown it.** Nobody has
touched a constant:

| data through | weeks to Lane | drift | total |
|---|---|---|---|
| Sep 12 | 8.01 | 5.54% | 6.00% |
| Sep 17 | 7.29 | 4.01% | 4.62% |
| Sep 19 | 7.01 | 3.39% | 4.10% |
| Sep 24 | 6.30 | 1.84% | 2.95% |
| Sep 26 | 6.00 | 1.23% | 2.61% |
| Oct 2 | 5.14 | 1.47% | 2.17% |

The Oct 2 row sits on the 1.6% race-day spread that came in with race
ratings; the rows above it were taken at 2.3%, so the drop in the total is
partly the dial and not only the calendar.

If a refresh ever leaves the total unchanged, the horizon is not being read -
check `DATA_DATE` and `STATE_DATE` before believing the board.

**The fall is steeper than the calendar**, and the curve is why. `RECORD.horizon`
is measured at 6.0% eight weeks out and 2.6% at six, so most of the allowance is
spent in that first fortnight: a week of calendar between Sep 17 and Sep 24 took
1.67 points off the total, and the two days to Sep 26 took another 0.34.

**Sep 26 sits exactly on a measured point**, 6.00 weeks, so the drift is read
rather than interpolated - the first refresh where that is true. From here the
curve flattens: the board is 0.31 points above the 2.3% race-day floor and
reaches it in late October, after which a refresh moves the odds without moving
the spread.

**The Dream Team does not get drift**, deliberately. It is a race today between
a squad that does not exist and the sixteen fastest schools in the state. There
is no horizon to cover.

**Three things had to follow the model, and missing any one would have made the
site lie:**

- the dial's note and the collapsed summary now say the allowance and the total
- the Track record's last column could no longer be called "the dial we ship",
  because at eight weeks we ship the middle one. It is "a flat 2.3%" now.
- `backtest/snapshot.js` runs at the same sigma and records it on the entry.
  An archive taken at a different spread from the live page is a record of
  nothing. Where entries disagree, the Called it view says so, because a column
  can then move because **we** moved rather than because a race happened.

## Find a school, and link to one

**A link is split before it is decoded, and decoding never throws.** Found by
feeding the site broken links on Sep 30. The site writes 2A/1A as `2A%2F1A`,
and `readHash` decoded the whole hash first, so the slash came back, the class
split into "2A" and "1A", and **every shared 2A/1A link opened 6A boys**. A
malformed escape (`#%E0%A4%A`, or a `%` in a name) threw from
`decodeURIComponent` at startup and **left the page blank**. Each segment is
decoded on its own inside a try now, an unescaped `2A/1A` is rejoined, and the
team is matched case-insensitively against `SCHOOLS` and written back in the
board's spelling - an unknown name is dropped rather than carried in the URL.

**An edited address reloads.** The site writes its hash with `replaceState`,
which fires no event, so a `hashchange` can only be the reader pasting or
editing a link in an open tab. It used to do nothing.

The board shows one classification and one gender at a time, so a visitor who
wants their own school had to know which of ten boards it is on, and anybody
sharing the page could only send somebody to 6A boys.

**The hash names a board: `#6A/boys` or `#6A/boys/Grant`.** It is written
with `replaceState` on every switch, so the address bar always describes what
is on screen and the back button is not filled with every toggle. A link that
names a team **runs the board and reveals that card**, because a link that named
a team asked a question.

**`SCHOOLS` is built from `CLASSES`**, which is already the authority on who
is on which board: 452 school-boards, matched on name or league.

**Revealing happens in `settle`, not on the click.** The card has to be in its
final position first, or the scroll lands on whichever team was in that slot
while the board was still sorting.

## Share cards: a page and a picture per team

**A shared link used to preview as the same card for every team.** The board
names a team in the hash (`#6A/boys/Grant`), and a link-preview crawler
(iMessage, Facebook, Slack, X) never sees the hash and never runs script. So
`pull/cards.js` writes, for every school on every board (452 today):

- `t/<slug>.html` - that team's own `og:`/`twitter:` title, description and
  image, `noindex`, and a `location.replace` to `/#6A/boys/Grant/team` (meta refresh
  inside `<noscript>`, because some crawlers follow a meta refresh and would
  lose the tags). People run the script and land on that school's Team page:
  somebody opening a team's link came for that team, not the board.
- `t/img/<slug>.png` - 1200x630: wordmark, board, school name as large as one
  line allows, league, then wins state / reaches Lane / points when there, the
  same three a board card leads with, and the left rail as the chance of
  reaching Lane. A team that cannot field five says so instead.
- Two more things, at the owner's request, both only when they apply. **The rank**
  top right, "#3 of 45 to win 6A boys": by chance of winning, ties broken on
  reaching Lane, out of every team on the board, and only from 1% to win up -
  nobody shares #31 (`rankOf`). **The coaches' poll** as an outlined chip beside
  the league, "Preseason poll #10" or "· votes" for receiving votes, read from
  `POLL`/`POLL_KIND` in index.html; an unranked team shows nothing, the same
  rule as the board. The league line drops " · Oregon cross country", then
  shrinks, to clear the chip.
- The fill's bounding box has to take every corner, flat edge or not. Skipping
  flat edges first clipped the left stroke of every W on every card.

`vercel.json` rewrites `/t/:slug` to `/t/:slug.html`, so the shared address is
`chutexc.vercel.app/t/6a-boys-grant`. The image URL carries `?d=<DATA_DATE>`
because every platform caches previews hard and the picture changes weekly.

**The slug rule exists twice** - `slugOf` in `cards.js`, `teamSlug` in
`index.html` - and `pull/test_cards.js` lifts the page's copy by text and checks
all 452 agree, are unique, have a page and a 1200x630 PNG, and send people to
their own school. 921 checks.

**The numbers are the archive's when they can be.** If the newest `SNAPSHOTS`
entry was taken from this database (`through` and `marks` match) on the current
`MODEL`, the cards use it, so a card and Called it say the same thing. Otherwise
(a hand run, a model change) it simulates 20,000 seasons a board itself, with the
sigma worked out the way `snapshot.js` does - **a copy of that logic, so change
both together.** About a minute.

**Poppins, not the site's faces.** The renderer is dependency-free like
`make-icon.js`: a small TrueType reader and a scanline filler, 4 sample rows a
pixel and exact coverage across, rounded to 32 levels so every card fits a
palette PNG (~25KB, about 11MB for the set). Oswald and Anton live on Google's
font servers, which an unattended job should not depend on and which this
sandbox cannot reach; Poppins Bold/Medium are committed in `pull/fonts` with the
OFL. To match the site exactly, drop static TTFs in and point `BOLD`/`MED` at
them - a variable font would render at its default weight.

**It runs weekly**: `refresh.cmd` calls it after the snapshot and commits `t/`
with `index.html`. A school that leaves a board has its files deleted. The site
offers the link from the team overlay and the Team tab ("Share Grant's odds"):
the phone's share sheet where there is one, otherwise the link is copied.

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

## Type and colour

**Three faces, and each has one job.** `--disp` is Oswald and names things:
team names, section headings, league headings. `--num` is Rajdhani and counts
them: every figure on every board. **Anton is no longer the site's face** - it is
the logo's, used for the CHUTE wordmark and for the number on the trophy plate,
and nowhere else. That is deliberate: the award should read as the same object
as the mark at the top of the page.

Both are tokens, so changing the pairing is two lines rather than thirty-five.

**The accent is gold, and gold is a light colour.** Red could carry white text;
`#E8A33D` cannot. `--on-accent` exists for that: near-black on the dark
theme, white on the light one, and every surface that fills with `--accent` -
the Run button, the solver button, the draft's remove button - takes its ink
from it rather than hardcoding `#fff`.

Measured rather than eyeballed: dark ink on `#E8A33D` is 8.5:1 and the gold on
the dark card is 8.3:1. The light theme's gold had to be walked down from
`#B77A15` to `#A06811` to clear 4.5:1 with white in both directions -
`#B77A15` was 3.6:1, which is not enough for a button.

**The favicon is a data URI and cannot read a custom property.** Its accent is
hardcoded twice in that one string. Change `--accent` and change those too.

**The micro-labels were 7 and 8px, and a phone pass on Sep 29 raised them.**
Scripted at 320, 375, 414 and 1280, every view: the labels under a card's
headline numbers, the Runners column labels and the OSAA chip's "OSAA" were 8px
or 7px, which is fine print on a phone. They are 9.5px now (the chip 8.5, to
stay inside its fixed 56px), the How diagrams' small labels 5.8 units rather
than 5.4. **5.8 is the ceiling there**: the two-line labels sit 7 units apart,
and at 6.2 their boxes touch on desktop.

Two narrow-width trades, both giving up something the row repeats elsewhere
rather than the name: **below 430px the Runners rows drop the crest** (the
school is on the line under the name; at 375 that took truncated names from 27
to 1), and **below 360px** the figure columns narrow to 42px and the team
overlay drops its gap column, which is best and sim subtracted. At 320 the
overlay had given a name 44px.

**Oswald sets wider than Anton at the same size.** Nine team names started
truncating on a phone the moment the face changed. Two fixes: the name scales
with the viewport (`clamp(15.5px, 4.5vw, 19px)`) and the league abbreviation
is hidden below 430px - it is the one thing on that row with a whole view of its
own, so it is the one that goes. Zero names truncate at 375px or at 1280px now.
**Re-check this after any type change.**

## Fitting a name that does not fit

A few schools are longer than the card's name column: "Oregon School for the
Deaf" wants 310px of a 245px slot. `fitNames()` shrinks **only** the names
that overflow, then gives up the league abbreviation if that is still not
enough. Three of 231 schools ever reach the first step and two reach the second.

**Overflow is `scrollWidth > clientWidth` and nothing else.** When the text
fits, the two are *equal*, so writing the test as `scrollWidth > clientWidth - 6`
to "leave some slack" is true for every card on the board. That version sent all
forty-five names into the shrink loop, 360 forced reflows, and took
`buildBoard` from 25ms to **372ms**. Slack is taken *after* a name fits, by
stepping down twice more. Never by loosening the test.

**Write everything, then read everything, then fit.** Interleaving a style write
with a geometry read makes the browser lay out on the spot, once per card.

**It runs more than once on purpose.** `measure()` calls it at build time,
when every rank still reads `#-`; `settle()` calls it again, plus once more
on the next tick, because `paint` swaps four ranks for wider trophy marks and
a rank grows from `#5` to `#32`. The column a name was fitted against is
not the column it ends up in.

**Card heights must stay identical**, because the step is measured from them.
They were not: `.rank.tr` was 5px taller than `.rank`, so the four trophy
cards ran into their gap. Both are the same height now, and `measure()` takes
the **tallest** card rather than the first, so the next thing that breaks this
costs a little dead space instead of an overlap.

## Performance

Measured, on the live board: **135µs a season**, so 89 fit in the 12ms visible
budget and a 5,000-season run needs about 7% of one core. `paint` is 0.12ms
light and 0.93ms full, `renderLeagues` 1.1ms twice a second. None of that is
close to a problem.

`buildBoard` is 25ms and is the only real hitch, once per press of Run. It is
innerHTML parsing for forty-five cards, not insertion - batching them into a
DocumentFragment first barely moved it. Left alone rather than optimised into
something harder to read.

**Measured on the live board**, desktop, after the fixes above:

| | |
|---|---|
| `domInteractive` | ~70ms |
| seed parse, 8,893 rows | 7ms |
| `buildModel` | 0.45ms |
| `buildBoard`, 45 cards | 25ms, once per press of Run |
| `fitNames` | 0.3ms typical, 9ms on the one board with long names |
| one simulated season | ~90µs, so 135 fit in a 12ms frame |
| `paint` full | 0.8ms |
| page, gzipped | 211KB of a 804KB file |

The seed has grown by half again since those first numbers and the per-season
cost went **down**, not up: more marks per athlete means `pickMark` picks from
a longer list, but the race itself is still the same 315 runners. What scales
with the seed is the parse, once, at 7ms.

Nothing here is close to a problem. `buildBoard` is the only hitch and it is
one frame at the moment of a button press, before a ten-second animation.

**Two font faults worth knowing about, both invisible until measured.** Oswald
500 was being downloaded and never used. Barlow 700 was being *rendered* and
never downloaded, so every bold word in the prose was synthesised by the browser
rather than drawn, which is a smear rather than a weight. Body bold is 600 now.
**Check what the page actually renders against what the link actually asks for**
after any type change.

**The rule that matters: anything animating continuously on N elements must
animate `transform` or `opacity`.** Everything else is a repaint per
element per frame. A board-wide `border-color` pulse was added and removed
within a day for exactly this - it re-rastered forty-five rounded rectangles,
each carrying a gradient, an inset highlight and a drop shadow, on every frame
of a ten-second run. The progress strip and the churning digits already say a
run is live, and they cost one element between them.

`will-change:transform` stays on the cards, because they really do transform
while sorting. It stays **off** the ninety runner rows for the same arithmetic.

## The bottom bar

Three tabs and one button. The tabs are how you move around the site; the button
does one thing. So the tabs take the room (`flex:1`, set in the display face,
uppercase) and Run is a quarter of the bar, capped at 128px - still the loudest
element on the page by colour, no longer by area. It was two thirds button once,
then 38%; at 38% four tabs got 48px each and the owner found them fiddly to hit.
Each tab is at least 44px tall, the usual floor for a thumb.

## The home-screen icon

**iOS will not use an SVG favicon for a home-screen shortcut.** Given no
`apple-touch-icon` it renders a screenshot of the page or the first letter of
the title, which is why a shortcut showed a bare "C".

`node pull/make-icon.js` writes `apple-touch-icon.png` at the repo root: 180
square, no dependencies, PNG written by hand around Node's own zlib. It draws
the same seven runners from the same coordinates as the tab icon, supersampled
four times and box-averaged down, which is the antialiasing. The formation is
laid into 74% of the square because iOS masks the corners to a squircle and
crops a few percent off every edge.

**That is now three copies of one drawing** - the page mark, the tab icon and
this - and none of them can share a source: the page bakes its scale into the
coordinates, the tab icon is a data URI that cannot read a custom property, and
this one is pixels. Redraw the formation and all three need it. The accent is
hardcoded here for the same reason it is in the favicon.

The app still works without the file; only the shortcut changes.

## Security

**The site cannot be stopped from being duplicated, and nothing here pretends
otherwise.** It is a static page; every visitor is handed the complete source,
including the seed. Minifying or obfuscating would cost readability and buy
nothing against anybody who can press View Source. What is actually protected is
the *domain* and the *record* - the archive's commit dates live in a public
repository, which is a claim a copy cannot make.

**There is a LICENCE now, and it is the restrictive kind.** No `LICENSE` file
meant all rights reserved by default, which is the strongest position already -
public is not open source, and a reader acquires no right to copy. The file
makes that explicit rather than leaving it to be inferred, because a silent
protection deters nobody.

**It deters; it does not prevent.** Nothing technical changed and nothing can:
the model ships to every browser, and that is a consequence of the one-file
rule rather than an oversight. A copy is still one right-click away. What the
notice does is remove "I assumed it was open" as an answer.

**The notice is in the served page as well as the repo**, at the top of all
three `index.html` files, because the file somebody copies is the one View
Source hands them and a repo LICENSE does not travel with it. Safe from the
weekly refresh: `patchIndex` only rewrites the seed block and `DATA_DATE`, and
`build_dash.js` only the `d-*` blocks and `INFO`.

**The claim over the data is a compilation claim, and that is the honest one.**
Race results are facts and belong to nobody. Deciding that a junior varsity
race is not a varsity one, that a July camp time trial is not the season, that
a relay split is not an open 400, and that two athlete profiles are one person
is editorial judgement - most of the work in `pull/`, and none of it obvious.

**Keeping the repo public was considered against monetising and rejected, for
the opposite of the obvious reason.** Going private would protect the algorithm
by exactly zero, because it has shipped to every visitor since day one, and it
would delete the forward archive's whole claim: commit dates a stranger can
verify. The record is the asset and the code is the implementation. If a deal
ever needs the model server-side, move it then - the model and the seed are
separable, and by that point the record is what is being bought.

**The real exposure to an athletic.net partnership is the crawl, not the IP.**
Whether a weekly automated pull sits inside their terms is worth answering
before approaching them rather than discovering mid-conversation.

**The one untrusted input is an athlete's name.** It comes from athletic.net and
ends up interpolated into `innerHTML` on five boards. `pull/seed.js` strips
`< > & "` and unprintable control characters at ingest, so nothing that could
be read as markup ever enters the data. Tab, newline and return are left for the
whitespace collapse. **Apostrophes stay** - O'Brien and St Mary's are real, and
an apostrophe cannot escape a double-quoted attribute or a text node.

Sanitising at ingest rather than escaping at twenty render sites is deliberate:
one choke point that the tests can aim at, instead of a rule every future
`innerHTML` has to remember. `pull/test_seed.js` fires real payloads at it -
an `<img onerror>`, a `</script>` break-out, entities, a null byte - and
asserts on the string that comes out, not on the regex restated.

`initials()` was already safe and worth knowing why: it strips everything but
`[A-Za-z ]` and returns at most two letters, which is what makes the inline
`onerror` in `crest()` unexploitable.

**`vercel.json` carries the headers.** `nosniff`, `frame-ancestors none`
and `X-Frame-Options: DENY` (the site is never framed), HSTS with preload, a
locked-down Permissions-Policy, and a CSP whose `default-src` is `none` with
each source opened only where it is used: fonts from gstatic, crests from
googleusercontent, and `connect-src 'self'` on the app. `/pull/` gets its own
looser policy, because the refresh harness genuinely does call athletic.net.

**`connect-src` was `none` and is `'self'`, and the reason is Vercel Web
Analytics.** The old note said `none` was right "because the page makes no
requests of its own", which was true until the site started counting its
visitors. The script is served from the site's own origin and beacons to
`/_vercel/insights/view` on the same origin, so `'self'` is the whole of the
widening - no third-party host is allowed anything.

**It would have failed silently and looked like Vercel's fault.** `script-src`
already had `'self'`, so the script loads and runs either way; only the beacon
is blocked. The dashboard then sits empty, which is indistinguishable from
"analytics has not started collecting yet" - and Vercel's own troubleshooting
points at ad blockers, which is the wrong place to look. If a future pass
tightens this back to `none`, that is what breaks.

**The npm package is not an option and the dashboard will keep offering it.**
Vercel's setup panel shows `npm i @vercel/analytics` under every framework
including "Other", and offers an agent that opens a pull request adding it. The
app is one static file with no build step, so it takes the HTML route instead:
a queue shim and a deferred script tag above `</head>`. The shim must come
first, because the deferred script can load after the page has already tried to
record something.

**The path is `/_vercel/insights/script.js`, and there is a second one.**
Enabling Analytics provisions both that stable path and a per-project path that
ad blockers cannot pattern-match. The stable one is used because it can be
written down; swapping in the unique path costs one line and no CSP change,
since `'self'` covers both.

**The CSP has to keep `unsafe-inline` for scripts, and that is a real
limitation rather than an oversight.** The app is one inline `<script>`, so the
alternatives are a nonce or a hash. A nonce needs a server rendering the page
per request, which there isn't. A hash would work - and would also block
injected inline handlers, which is the whole prize - but **the weekly refresh
rewrites `index.html`**, so the hash would go stale on every data pull and
take the site down until somebody noticed. Adding hash recomputation to an
unattended job that already refuses more readily than it writes is a worse trade
than sanitising at ingest. If `crawl.js` ever learns to write the hash into
`vercel.json`, revisit this.

Adding `vercel.json` does **not** change the framework preset. It must stay
**Other**.

## Presentability

**The Teams board is the default view of the default tab**, and it was an empty
div until somebody pressed Run - Runners and Leagues both said "press Run",
Teams said nothing at all. It now carries a real empty state that names what the
board is rather than only that it is not filled in yet.

**Shared links carried no title, description or image.** There is a description,
an Open Graph set and a Twitter card now, and `og.png` comes out of the same
generator as the home-screen icon. That card has no wordmark on purpose: the
encoder has no font, and drawing letters would mean shipping a rasteriser to
repeat what the preview's own title already says.

## The How tab diagrams

**The qualification diagram ("the road to Lane") was removed on Sep 30, at the
owner's request: it never looked right.** Its caption carried the actual rule -
top two per league straight through, the committee picks two more from the
thirds - and survives as a paragraph under "A season is not one race". The two
notes below about its bracket and its animation are history, kept so nobody
rebuilds it from them. `qlPop` and `qlDraw` stay: the dots and the curve use
them. Two diagrams remain, the hundred dots and the lopsided curve.


**The bracket is a bracket now, and what it was before is worth recording.** The
seven wires were each drawn as `M46 y H 54 V 29`: every one ran to the same
point and then along it, so six drew over each other down a column that also sat
*underneath* the node rectangle. The two nodes had different left edges and
different widths, and two paths ended in mid-air.

A bracket has four parts and each is drawn **once**: a stub out of each lane, one
spine collecting them, one feed into each node, and a merge back out. Nothing
overlaps anything and every line ends on something. If it looks tangled again,
count how many times a path covers the same pixels.

**The qualification diagram animates the process rather than labelling a picture
of it.** Two teams light up in each of the seven leagues, wires carry them
across, and sixteen seats fill at Lane - fourteen in order, then two more a beat
later with a dashed ring, because those two were chosen rather than earned. It
replays on tap or Enter, and plays itself once when it first scrolls into view.

**The rule that makes that safe: at rest the drawing is COMPLETE.** `.run`
parks the parts at `scale(0)` so they can pop in, which means that while it is
set the figure is *incomplete*. So `play()` takes the class off again on a
timer longer than the longest animation in any of the three. The entrance plays,
and either way the figure ends up back at its resting state. **A timer fires
when a frame callback might not** - a throttled tab, a frozen clock, an engine
that skips the animation - and without that fallback the figure would sit empty
for good. Never leave content depending on an animation to become visible.

**All three are drawn on a 200-unit-wide viewBox, and that is the whole mobile
fix.** A figure is always the column width, so a label written at 8 units on a
336-wide box rendered at 7.7px on a phone. The same label on a 200-wide box
renders at 13px. Nothing about the drawings was too complex; the coordinate
space was too wide for the type in it. **Check the effective pixel size after
any change** - multiply the CSS font-size by (rendered width / viewBox width).

They carry the accent now rather than `--t1e`, so they belong to the site
rather than to the trophy palette. The percentage figure fills 53 of 100 dots in
accent and leaves 47 as hollow rings, which is a clearer read than a hundred
dots at graded opacity. Labels inside a box have to fit that box: two of them
overflowed at the first attempt and were shortened, with the long version moved
to the caption where it has the full column width.

## Deferred work must re-check its state

`refreshView` guarded `RUN` at the top and then did the work inside
`nextTick`, which is a frame later. Switch classification in that window and
`clearOut` sets `RUN=null` before the callback runs, which threw
`Cannot read properties of null` in ordinary use. Checking once on the way in
only proves the state existed when the frame was **scheduled**.

Anything deferred re-checks what it captured. The same reasoning as the run
generation below, one level down.

## Cancelling a run

**Every paced loop carries the generation it started in.** `runGen` increments
in `cancelRun()`, which `clearOut()` calls, so every switch that invalidates
the model stops the loop for free rather than each handler having to remember.

This was a real bug and the symptom was misleading. Changing classification
mid-run left the loop stepping against a model that had just been thrown away:
`clearOut` sets `RUN=null` and `cards=[]`, the next tick dereferenced
`RUN`, the exception killed the loop, and **`running` was left true for the
life of the page** - so every later press of Run hit the `if(running)` guard and
did nothing at all. It looked like a rendering fault and was a state-machine
one. Guarded loops: the Odds run, `runWorlds`, and the solver.

## Timers

**Three ways in, not two.** `nextTick` schedules a frame, a timer, and a
visibilitychange listener, and the first to arrive wins. The third matters
because a hidden tab’s timers are clamped to about once a second and, after a
few minutes hidden, to once a minute - so the timer is a promise of an eventual
tick, not a prompt one. Waking on the return to the tab is what stops coming
back from feeling like the page has seized.

**And no tick may block.** Both season loops pace against the wall clock: each
tick works out how far along the run should be and catches up. Leave the tab for
a minute and the target on return is the whole remaining run, which the old code
did in one synchronous batch - a dead page at the moment somebody is looking at
it again. `catchUp` caps the work by time instead, 12ms visible and 250ms hidden,
checking the clock every sixteenth season. Falling behind costs a run that ends
a little after its nominal ten seconds, which nobody notices; blocking costs a
page that appears hung, which everybody does.

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

## How the site is written

The owner's note was "so much of the language reeks of AI", and it was right.
The tics, all mine:

- an em-dash aside bolted onto a sentence that had already finished
- "not X but Y" and "X rather than Y" used for rhythm, not contrast
- a closing aphorism telling the reader what to think about what they just read
- explaining the reasoning behind a design decision to somebody who did not ask
- three-part lists where two items were the honest number

**The rule: short sentences, concrete nouns, and no summing up.** State the
thing, then stop. A reader who wants the reasoning can read this file.

**Name the jargon once, at the bottom, or not at all.** The Track record view
led with a Brier score, called the calibration plot "reliability" and used
"information set" as a column heading. Every number on that page is the same
number it was; what changed is that each now says what it *means* before it says
what it is, the chart has labelled axes, and the two statistical terms are
defined in one line at the foot of the page for anyone checking the work. The
page is read by parents, runners and coaches. Write for them.

**The em-dash aside is the loudest tell, and the fix is never to swap the
punctuation.** It is to work out what the sentence was doing. Half of them were
two sentences pretending to be one, and the rest were a list that wanted a
colon. Eighteen were rewritten. A dash standing in for a missing value stays:
that is what a dash is for.

Other tics found in the same pass: an opening line that performed modesty
("this is the part we would want to see if we were you"), `rather than` used
three times in four paragraphs as filler contrast, and a third consecutive
heading of the form "X is not Y".

**The pass also caught a factual error, which is the real argument for doing
it.** The How tab still said "the 2024 and 2025 seasons" long after the harness
had grown to four, so the page was understating its own evidence. It reads from
`RECORD.seasons` now, via `syncHowText()`. **Nothing the site publishes
should be typed in, and that includes the parts that read as prose** - the
`RECORD` constant existed precisely to stop this and the sentence had simply
never been wired to it. When proofreading copy, check the numbers in it too.

**This applies to the site only.** Commit messages and this file are working
notes and can say why.

## One accent, and where the medals are allowed

The site had drifted into two accents without anyone deciding to. **`--accent`
(gold) is the site's colour**: it marks the thing the reader came for and the
controls that get them there. **`--t1`..`--t4` are the OSAA medals and
belong only where a place is being named** - the trophy plates, the distribution
bars, and the legend above them.

Everything else is neutral. Hover states, focus rings, a search field's border,
and "how confident are we" have nothing to do with finishing first, and painting
them first-place blue is how the page ended up with two accents arguing.
Thirteen such uses were found and changed. In particular:

- `oddColor` ramped dim toward `--t1e`, which said *first place* on a number
  about at-large berths. It ramps toward `--text` now. Confidence is not a medal.
- The coaches chip was a blue outline. It is neutral: someone else's opinion,
  stated quietly. **The legend described it as "the blue chip" and had to change
  with it** - a colour named in prose is a second place the palette can rot.

**The fourth plate is black, and it is the one plate that does not take black
ink.** OSAA's fourth-place award really is a dark plaque, so `trg4` is
`#3C4047 -> #101215` and `.rank.p4 .tro-n` engraves in pewter instead. A
black number on a black plate is not a choice anyone would defend. The
distribution bar keeps a lighter `--t4`, because a bar has to be visible
against the card and a plate does not.

## The coaches poll

Every card carries the team's place in the **OSAAtoday coaches poll**, in an
outlined blue chip labelled POLL so it cannot be mistaken for one of our own
numbers. It is the only statewide human ranking of these teams and it is
genuinely different information: coaches see head-to-head results, who is hurt
and who is peaking, none of which the model knows. Where the two disagree is the
interesting part of the board - on the September data Grant leads the 6A boys at
44% to win and sits **tenth** in the poll, while poll-leading Lincoln is second.

`node pull/poll.js` rebuilds it. Three things to know:

**Cross country gets three polls a season, not a weekly one.** This was wrong
in `poll.js` for a month: the comment said the poll is "REWRITTEN WEEKLY on
Thursdays", which is true of football and volleyball and not of this sport.
There is a preseason poll in late August, a midseason one in early October and
a final one at the end. The 2025 set ran Aug 21, Oct 9 and Oct 29.

That mattered because three consecutive refreshes each went looking for a
weekly poll that was never going to exist, and each had to re-derive that
nothing was missing. **A September with no new poll is the normal state of
things and not a failed pull.** The 2026 preseason poll is Aug 26 and still
the only one; expect the midseason pair around Oct 8.

**Find the ids on the tag pages, never by guessing the number.**
`osaa.org/today/tag/Boys+Cross+Country` and the girls' equivalent list every
poll this sport has ever published, which is a complete answer in one request.
`osaa.org/today` only carries the last eleven articles, so in a busy football
week it shows no cross country at all and says nothing about whether a poll
exists. Each poll is a new article at `osaa.org/today/article/<id>/view`, so
the defaults in the file go stale three times a season: pass the new pair,
`node pull/poll.js 5100 5101` (boys, girls). `--dry` parses and reports
without writing.

**The 2026 midseason poll came out Oct 2, not around Oct 8**, so do not plan
on a fixed date. **And osaa.org now sits behind an interactive Cloudflare
check**: curl gets a 403 and the browser gets "Verify you are human", which a
script must not try to pass. So `poll.js` also reads saved copies of the two
articles: `node pull/poll.js --file boys.html girls.html`. The Oct 2 poll was
transcribed from the owner's phone screenshots of the two article pages into
that shape (rank line, then school, then votes) - check a transcription against
the source before writing it, because a misread rank goes on a card. Four
aliases were added for it: `Union / Cove`, `Faith Bible / Life Christian`,
`Trout Lake / Glenwood` and `St. Mary's Acad., Portland`. 107 of 112 entries
matched; the five that do not are entries the board has no team for.

**A poll that has not been re-published is not stale data, it is the data.** Do
not invent a refresh to make the page look current - the chip says when it was
voted, which is the honest way to carry an old opinion.

**The page says when the poll was voted, because it is often much older than the
board beside it.** `POLL_DATE` is the article's own byline date and `POLL_KIND`
carries "preseason" when the headline says so, both written by `poll.js`; the
legend and the chip's tooltip render them through `pollWhen()`. Before this the
site showed "Results through Sep 17" next to a chip voted three weeks earlier
with nothing to say so. `POLL_DATE` used to hold the date of the *pull*, which
is a different fact and no use to a reader.

**It is parsed off the text, not the markup.** Strip the tags, then walk the
lines: a classification on its own line, then `1.`, then the school, then the
vote count. The markup around the poll changes; the shape of the poll does not.

**"Others receiving significant votes" is kept, as rank 0, shown as RV.** Those
teams are ranked ahead of every unranked team, so throwing them away loses real
information. An entry only counts if the next line is a vote count - without
that check the author's byline, which sits just past the last classification,
parsed as a 2A/1A team.

**118 of 121 poll entries match a board team.** The three that do not are two
co-ops that do not exist on the board and girls' Enterprise, which the poll
lists under 2A/1A and the board carries in 3A. Unmatched entries are reported,
never guessed at. The alias table maps poll spelling to board spelling and is
mostly co-ops written out in full: `The Dalles / Dufur` to `The Dalles`,
`Heppner / Ione` to `Heppner`. **Map poll to board, never the reverse** - the
same rule the athletic.net alias table had to learn.

Only about twelve teams a board are ranked. Everyone else shows nothing, because
"unranked" is what the poll actually says about them.

## The board is a broadcast graphic

**The team card is a lower-third, not a list row.** It used to be five equal
chips with the headline figure set at the same size as "top 10", which is a
table pretending to be a card - nothing on it was louder than anything else.
Now three numbers carry the card at roughly three times the size of everything
else: **wins state** in the accent, **reaches Lane** in the text colour, and
**points when there** muted. Auto, at-large, top 10 and top 4 sit under a rule
as a support strip.

**The left rail is the chance of reaching Lane, read as a height.** `.tcard::before`
fills from the bottom off a `--q` custom property that `paint` writes every
frame from the same number the hero chip prints, so the two cannot disagree. It
is the one fact every visitor came for, and the rail makes it legible without
reading anything - the eye runs down the left edge and sees where the field
thins out.

**Qualify moved into the headline but kept its `data-k`.** `paint` finds the
chips with `el.querySelectorAll(".odd")` and reads `o.dataset.k`, so the hero
updates for free wherever it sits in the card. Anything given the `odd` class
**must** carry a `data-k`, or `t[undefined]` silently prints a dash - which is
why the points figure is `.pnum` and styled separately rather than being a
sixth `.odd`.

**The hero is exempt from `oddColor`.** That function fades dim toward a pale
blue as a chip earns its value, which is right for a support number and wrong
for a headline that should read at full strength from the first frame. `paint`
skips it for `.hero`.

**`.tcard`'s `transform` belongs to `translateY`, and that is now three
separate bugs' worth of lesson.** The sorting owns it, so no hover scale, no
entrance slide, no pop may touch it. An effect that wants movement either
animates a **child** - which has its own transform - or uses a property the
sorting does not own: opacity, box-shadow, border-color. The cards fade in on
opacity with the stagger on `--n`; hover lights the card instead of lifting it;
the rank chip's flip keeps `skewX(-9deg)` inside every keyframe, because leaving
it out un-skews the chip for the length of the animation. Same family as the
mark's baked-in skew and the pace line's split of `translate` from `transform`.

**Restarting a CSS animation needs the reflow read.** `classList.remove`, then
`void el.offsetWidth`, then `classList.add`. Without the read the browser
coalesces both changes into one style pass and nothing plays.

**`.tcard .tc-big b` is two classes deep on purpose.** It has to beat `.odd b`
further down the sheet whatever order the two end up in, or a rule meant for the
small chips silently shrinks the headline figures. Same lesson as the `.wirow`
override below, learned before it cost anything this time.

**Team names are set in Anton, uppercase** - the wordmark's own face, which is
what ties the card to the mark at the top of the page.

**Runners and Leagues got the type, not the card.** The individual board is a
leaderboard of ninety absolutely-positioned rows and every point of row height
is multiplied by ninety, so it takes the larger condensed numerals and the
bigger place chip and nothing else. Do not give it a card.

## Desktop

**It was a 600px column at every width.** On a laptop the site used under half
the viewport, forty-five cards in one column, and read as a phone app somebody
had opened by mistake. Everything below is additive and lives behind
`@media (min-width:900px)`; the phone layout is the one that was designed and
the one most people use, and it is unchanged.

**The column widened; the board did not split.** Two columns of team cards is
the obvious move and it is the one to avoid: the cards are absolutely positioned
against a *measured* step, so a second column means teaching `measure()` and
`paint()` an x axis — the machinery that put cards on top of each other once
already. Widening to 880px gets most of the benefit for none of that risk.

**Leagues is the exception, and the reason is worth generalising.** It is the
one board rebuilt wholesale by `innerHTML` rather than moved against a measured
step, so it has no positioning machinery to teach and `columns:2` is free. It
also needed it most: a `.drow` is `1fr auto auto`, so every pixel the widening
added went straight into the gap between a team's name and its two numbers. Two
columns of ~420px put the numbers back beside the names and halve the scroll.
**A view can take a second column exactly when nothing measures it.**

**The card turns on its side above 900px, and that made the board shorter.**
Stacked, the three headline numbers strung themselves across 854px of card with
nothing between them, reading as three unrelated figures rather than one
graphic. The desktop rule makes `.tcard` a two-column grid and spans `.tc-big`
across all three rows, so identity, distribution and the support strip run down
the left and the numbers sit grouped and vertically centred on the right - a
real lower-third. The board went from about 7,900px to **5,850px** while the
numbers went from 31.5px to 38px. Bigger and shorter, which is usually a sign
the layout was wrong rather than the sizes.

**Prose was the one thing the extra room made worse.** The How tab ran to 131
characters a line at 880px, about twice a comfortable measure. Only text-level
elements are capped at `66ch`; figures, tables and the stat tiles still take the
full width, because a diagram genuinely wants it.

**The three switches are one row.** Classification, gender and season were three
full-width rows stacked, which put the first team below the fold behind controls
the reader had already set. The `.ctl-row` wrapper deliberately has **no styles
outside the media query**, so below 900px it is an inert `div` and the phone
layout is byte-for-byte what it was.

**The desktop blocks sit at the end of the stylesheet, and must stay there.** A
media query carries no specificity — it is a condition, not a weight — so an
override written up among the layout rules loses to any base rule further down
the file. That is not hypothetical: `.wirow`'s override sat 340 lines above
`.wirow`'s own `grid-template-columns` and did nothing at all, silently, until
it moved. Anything added below that point must stay below it.

## Audit harness

`extract_model.js` regenerates `model.js` by lifting the pure functions out of
`index.html`; `audit2.js` runs them under Node. Neither touches the DOM. Run:

```
node extract_model.js        # regenerate model.js after any signature change
node audit2.js               # 114 checks, 1 deliberate failure
node pull/test_seed.js       # 120 checks on the seed builder, no network
node pull/test_crawl.js      # 8 checks on the scheduled crawl's write guards
node pull/test_roster.js     # 93 checks on the roster builder, no network
node pull/test_whoswho.js    # 67 checks on the Who's Who parser, no network
node backtest/test_snapshot.js   # 38 checks that the archive REFUSES, both line endings
node pull/test_cards.js      # 918 checks that every team has a share card and one slug
```

The two `pull` suites are quick and touch no network, so there is no reason not
to run them alongside the audit. `test_crawl.js` lifts the guard rule out of
`crawl.js` by text rather than restating it, so it fails loudly if that block
moves rather than passing against a stale copy of the rule.

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

## The forward archive

`backtest/snapshot.js` freezes what the board says today, before the races it is
predicting, and `refresh.cmd` runs it on every successful crawl so the entry is
committed and pushed the same morning. Git carries an external timestamp on each
one. The **Called it** view in the How tab renders it.

**It is a different artifact from the Track record, and that is the point.** The
Track record is retrodictive: it rebuilds 2022-2025 and scores the model against
a November everyone already knows, and every choice in it was made by someone who
could see the answer. Honest work, and the kind nobody has to believe. A forward
archive cannot be argued with the same way.

**Five numbers, not the whole tally.** A team is `[qualify, auto, win, points]`
and a runner is `[mean place x10, all-state, win]`, top thirty a board, all in
tenths of a percent as integers. At-large is deliberately *not* stored, because
`auto + wild == qual` is an invariant `audit2` asserts - the Leagues reading
derives from the two rather than taking a column of its own. Points is the same
conditional mean the card shows.

**It costs about 21KB a snapshot.** Five entries are 105KB of a 804KB file, and
a full season of weekly pulls would add roughly 250KB. That is the one thing to
watch, and it is now the second-fastest-growing part of the file after the seed
itself. If it gets uncomfortable the answer is a shared name table, not fewer
columns - the names are most of the bytes.

**`taken` is the LOCAL date, not UTC.** `toISOString` labelled a Saturday
evening in Oregon as Sunday, because Oregon is seven hours behind it. Every
other date here is local - the meet dates, `DATA_DATE`, OSAA's own calendar -
and an archive keyed on the wrong day is worse than one keyed on no day. The
entry written under the UTC date was never pushed, so it was restored from HEAD
and rewritten rather than amended.

The test had the same bug one level up: it worked out "today" with
`toISOString` and then looked for an entry snapshot.js had stamped locally.
**Two places deciding separately what day it is will disagree eventually**, so
the test now finds the entry this run wrote by its own `--why` stamp, and
separately asserts the stamp equals the local date. For seventeen hours a day
UTC and Oregon agree, which is exactly how a bug like this hides.

**Called it carries its own classification and gender.** `#ctl` owns both
everywhere else and is hidden on the How tab, so without `FWD_CLS`/`FWD_G` the
archive was stuck on whatever the Odds board happened to be set to and nine of
the ten boards were unreachable. They start from the board so the first look is
never arbitrary - the same rule the draft's own gender switch follows.

**The Called it grid shows one figure at a time**, chosen by a switch, because
five numbers times N dates times 45 teams is a wall. Qualify ties break on win:
half the field sits at 100% and those ties break on nothing otherwise, which is
the same trap that once made `backtest.js` publish the champion record a team
too high.

**One column per race weekend (Sep 30).** The owner wanted the columns a week
apart. A week ends on the Saturday and a snapshot belongs to the week its
`through` date falls in; the latest in a week is shown, a week with none still
gets an empty column, and the rest are listed under the table as "also
archived". Nothing is dropped from `SNAPSHOTS` - this is display only.

**Arrows say which way a team moved since the week before**, up always better
(turned round on Points and Runners, where smaller wins), nothing under a
point or a place. **The comparison is on the numbers as printed** (`shown`),
not the stored tenths: 575 against 584 is under a point but prints as 57% and
58%, and a reader saw two different numbers marked as no change. A **change** column runs from the first week on the current
model to the latest. **Arrows skip any step into a week where the model
changed** and that column carries a diamond: Sep 12 to Sep 19 had every team
falling because the horizon allowance arrived, which is us, not the season.
`modelOf` reads an entry's `model` field, or infers it for old ones (no
`weeks` = pre-horizon). `snapshot.js` now writes `model: 'race-rated'`;
**bump `MODEL` there whenever the board's method changes.** The table opens
scrolled to the newest week.

**Every heading sorts** (`FWD_SORT`), the Races pattern: first tap is the
column's natural order (A-Z, or best first - smaller first on Points and
Runners), a second reverses, blanks always sink. A week is keyed by its date
(`w:2026-09-26`), the newest is `latest`, which is the default. It sorts the
rows shown (top 24 teams, 30 runners, chosen by the latest call) and keeps the
scroll position (`FWD_KEEP`). The off arrows take no width, or four headers
grow 44px and the 375 table scrolls the team names out of view.

**Early entries are narrower, and are not rewritten to match.** `fwdTeam` reads
both the wide shape and the original `[qual, win]` one, and a column that did not
exist yet prints as a dash. Widening the archive must never mean going back over
what it already said.

### The out-of-state runners, recomputed out

**Every snapshot from Sep 15 to Sep 26 carried other states' runners.** Until
the Sep 28 fix (`8deedf4`, match on athletic.net team id) results were filed by
school name, and 23 Oregon names share one with a school elsewhere. The archive
had Centennial's 5A girls - seven Boise, Idaho runners - at 81% to win, and
Century (6A girls, six of seven), Redmond (5A, six of seven from Sep 25),
Riverside, Rainier, Toledo, Union and others carrying them too.

**They were recomputed on Sep 30, at the owner's request.** The first answer
was an errata table (`ARCHIVE_ERRATA`) that marked the affected teams with a
double dagger and struck dates through. The owner wanted the mistakes gone
rather than highlighted, so the five entries were re-run, and the errata table
and its styles were deleted.

How, so it can be checked or repeated:

- Each entry was re-run with **its own commit's** `snapshot.js`, `model.js` and
  `pull/seed.js` (Sep 15 `b0a2905`, Sep 17 `67a638e`, Sep 19 `ba79bee`, Sep 25
  `5e0dc1f`, Sep 26 `636315f`), on its own seed, at 20,000 seasons. The sigma
  came out identical on all five, which is the check that the same model ran.
- The affected teams' rows were rebuilt from their Oregon athletic.net team
  grids, read with dates. **Only meet dates the old seed already held were
  used**: a date counts if any of that team's seed marks matches a dated mark
  exactly. So foreign runners leave and the Oregon runners they had pushed past
  the twelve-deep cap come back, and no meet the database did not yet have gets
  in. Checked first: every Oregon athlete already in each old seed has exactly
  the top three marks the dated grid gives up to that cutoff, 0 mismatches.
- Only the boards whose seed changed were replaced. Unaffected boards kept
  their published figures; re-running them reproduced those to within a point.
- Each entry carries `recomputed: {on, boards}`, and Called it prints one
  footnote saying so. The originals are in the repository history.
- **Westview was a false positive** in the errata and was left alone. **Elgin**
  has no athletic.net team and was left alone too.

What moved most: Centennial's 5A girls had been the favourite on every date
and are now not a team at all (one Oregon runner). Union's 2A/1A girls went from
87-99% to win (Sep 17-26) to 16-83%, and Century's 6A girls, called as high
as 49% to reach Lane, go to none on every date.

**The same view printed the wrong field size**: "one of the 12 teams" on 6A
girls, because it read `FIELD`, which belongs to whatever board Odds is on. It
computes the field from `CLASSES[FWD_CLS][FWD_G]` now.

### The guard was inert for a day, and how

Everything below was silent. It is the most useful thing in this section.

`index.html` is CRLF on this machine. The regex looked for `];\n` and the file
has `];\r\n`, so it **never matched**. Three things followed, none of which
announced themselves:

- `found` was null, so the replace branch was never taken and the else branch
  *inserted* a fresh `const SNAPSHOTS` above `DATA_DATE`. Three declarations
  accumulated. That does not show up as a wrong number - the browser refuses the
  whole script with "Identifier 'SNAPSHOTS' has already been declared" and the
  **page goes blank**.
- `list` was therefore always `[]`, so the clash check compared today against
  nothing. **The append-only guard - the entire reason the file exists - could
  never fire.** It reported success every time.
- Separately, `RUNS` was `+process.argv[2]`, so `snapshot.js --force` parsed the
  flag as the season count, ran `for(i=0;i<NaN;i++)`, and wrote an entry of nulls
  that was structurally perfect and completely empty.

**A guard that cannot fail looks exactly like a guard that works.**
`backtest/test_snapshot.js` now provokes real refusals against a real file in
both line endings, and asserts that a permitted write leaves *exactly one*
declaration. Verified non-vacuous the way `test_crawl.js` is: put the LF-only
regex back and the suite fails - 15 of 46 when last checked.

**And then the suite itself was only right one day in six.** `sandbox()` copies
the live `index.html`, and six checks leaned on that copy "already holding
today's entry, so a plain run must refuse". True on the day a snapshot was
taken and false every other day: on Sep 28, against a Sep 26 archive, a plain
run correctly wrote a new entry and the clash check had nothing to clash with.
It read as the guard failing and was the fixture lying.

The fixture re-dates its newest entry to today, so the clash is there whatever
day the suite runs. Same family as the UTC/local fault above: **anything that
reasons about "today" has to own that decision**, not inherit it from whenever
somebody last ran something.

Worth knowing because of how it hides. The suite was green on Sep 26, when it
was run minutes after a snapshot, and red on the 28th with nothing changed in
between. A test whose result depends on the calendar gets read as flaky, and a
suite that is usually red is a suite nobody reads - which would have cost the
append-only guard its whole value a second time.

**`--force` now requires `--why` and staples the reason to the entry**, which the
site renders beside the date with a dagger. The rule was never "never rewrite" -
it is "never rewrite *quietly*". An archive that records its own amendments is
still an archive; one that can be silently edited is a slower way of tuning after
the fact. The Sep 15 entry carries such a stamp: it was rewritten the same day,
from the same database, with no race in between, only to add the columns above.

## Backtest

`backtest/` rebuilds a past season's database as of a chosen date, simulates it,
and compares against Lane in November. See `backtest/README.md`. **Four seasons
are committed, 2022 through 2025**, at four cutoffs each, and the whole pipeline
is now scripted: `pull_season.js` then `build_season.js`, with 155 checks in
`test_build.js`.

**A season pulls in about two and a half minutes**, because a team's entire
season comes back from `TeamHome/GetResultsGrid?teamId=N&seasonId=YYYY` in one
unauthenticated GET — every result, not just bests, with a `meets[]` array
carrying the dates. One request per team. Walking calendars and then every
division of every meet costs several hundred requests against the one rate
limited endpoint and takes forty minutes a season. The eight championship meets
are still read the slow way, because only the meet endpoint carries division
names and the district varsity race has to be told from the junior varsity one.

**Two bugs in the ground truth were found when the seasons were added, and both
had been there the whole time.**

*Junior Varsity is not Varsity.* Five of the seven districts spell their second
race "5,000 Meters Junior Varsity", and `/Varsity/i` matches it, so the district
result quietly contained the JV race. It did not look wrong - a team's five
fastest are its varsity five either way, so the winning score barely moved - but
every score below the winner inflated and schools that could not field five
varsity runners suddenly could. 2025 PIL was published as nine scoring teams
when it had seven. Verified against athletic.net before touching it: the
committed file matched with-JV scoring exactly. The state field is unchanged, so
the outcome variable was never wrong; what was wrong was which teams get scored
and the district places feeding the top-14 individual-qualifier rule.

*Summer was in the database.* athletic.net files the Steens Mountain camp's July
**uphill** 5k under the season - 108 of them in 2022, running 21:19 to 47:39,
with 26 athletes carrying nothing else at the September cutoff. The live seed
already dropped these via `SEASON_START`; the backtest did not, so it was
scoring a model fed differently from the live one. Same mid-August floor now.

**And one in the new puller**: the 2025 state meet page hosts all nine
classifications where 2022-2024 are 6A only, so taking every 5,000m division
pulled 145 schools into 2025 instead of 50. Harmless to the seeds, which filter
to league members, but it made the seasons look unlike each other. The state
meet is now read through the same `/6A/` filter `build_season.js` uses.

**What four seasons say, and it is worse than two did.** Pooled at the September
cutoff: 107 of 144 qualifiers inside the board, 2 of 8 champions, Brier 0.1536
against 0.2319 for knowing nothing, 35% skill. The calibration is now
overconfident at both ends, not just the middle - below-10% teams qualified 11%
of the time and above-90% teams only 85%. **Do not leave the How tab saying the
calibration is "honest at both ends".**

**But the model is not worse on the older seasons.** At the October cutoffs all
four land between 72% and 81% skill, a spread of 5 to 9 points. What differs is
the September information set: athletic.net held 14 meets by the 2022 cutoff and
33 by the same point in 2025, every cutoff being exactly 8.0 weeks from its own
state meet. The September figure is a statement about how thin the database is
that early, not about the season. Quote per cutoff; pooling describes neither.

**Excluding meets was tried properly and bought nothing.** Five reasons for
dropping a meet were written down first in `exclusion_rules.js`, 2023 was held
out, and the rules were judged on the other three and then applied once to it.
The only rule that helped in development - dropping small fields - was the worst
of all on the holdout, 0.2197 against a baseline of 0.1869. Nothing survived.
That is a better footing for the published numbers than a tuned figure would
have been: picking exclusions by their effect on the score and then quoting the
score measures the search, not the model. `backtest/exclusions.js`, and the
README section, keep the full table including the losers. Restricting to meets
common to all four seasons was also tried (`common_meets.js`,
`common_value.js`) and is worse still - only twenty meets recur, none early
enough for September, and forcing every team onto whichever of them they
happened to attend widens the spread between seasons from 5 points to 66.

**The variance dial depends on how far out you are.** Sweeping sigma against
actual outcomes at each cutoff:

| information set | weeks to state | best sigma | implied drift |
|---|---|---|---|
| mid-September | 8 | **6.0%** | 5.5% |
| late September | 6 | 3.0% | 1.9% |
| mid-October | 4 | 2.0% | 0.0% |
| late October | 2 | 2.0% | 0.0% |

Four seasons, and the September figure is no longer pinned to the edge of the
sweep - `publish.js` stopped at 6.0% and returned exactly 6.0%, which is a sweep
running out rather than a measurement. The range now runs to 9.0% and still
picks 6%. **Using it is the largest honest gain available**: September Brier
falls from 0.1535 to 0.1392, about 9%, with no change to the data at all.

(Those fell after the `MARK_W` and `LONE` fixes — a better model needs less
slack. Regenerate with `node backtest/publish.js`, which writes them into the
site.)

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

## Backtesting every classification (in progress, Oct 1)

Everything in `backtest/` is 6A because `pull_season.js` needs each season's
eight championship meet ids typed into `seasons.json`, and nobody has typed the
other forty leagues'. `backtest/pull_history.js` asks for everything instead:
GetTree on Oregon, every school's season grid for 2022-2025 (one GET each), then
the championships found in what came back - November meets named "state", and
every meet three or more schools ran in the 25 days before them, read division
by division because only the meet endpoint says which race was varsity. Schools
seen at a championship but missing from today's tree get pulled too. The 6A ids
already in `seasons.json` are read whatever the window says, and the log says if
the window would have missed one.

It writes `backtest/hist/<year>-results.csv.gz`, `<year>-meets.json` and
`tree.json`, **committed** (about 2MB), so the per-classification builds run
here where athletic.net cannot be reached. `backtest/hist/` is in
`.vercelignore`. It resumes from `backtest/raw/hist-<year>.jsonl` and refuses a
year with no state meet, a state meet that never answered, or more than 2% of
schools failing.

Mark has no terminal, so it runs two ways: double-click
`backtest/pull-history.cmd`, or the Monday `refresh.cmd` calls it once at the
end of its run while `backtest/hist/2025-results.csv.gz` does not exist. About
45 minutes; it commits only `backtest/hist`. The hook sits below `refresh.cmd`'s
`git pull` line, so a run that pulls its own new version keeps reading the same
bytes up to that point.

Still to build once the data lands: class assignment per school-season (the
state division a school raced in is authoritative; otherwise the district race
it ran and today's `CLASSES`), per-league automatic berths per season (OSAA
moves them, and results alone cannot tell three automatic from two plus an
at-large), scoring depth, and whether the small-school girls' combined races in
2025 can be scored at all.

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
- The at-large ranking uses this season's head-to-head and district-day times.
  The committee also weighs last year's state results for district strength,
  and it discusses before it votes; neither is modelled.
- A league with only two scoring teams shows both at 100% — arithmetic, not
  prediction. This no longer bites on the 5,000m board: the meet-results pull
  filled Three Rivers out from two scoring teams to six, and the 5,000m board
  from 39 teams to 45. Watch for it returning on thin boards early next season.

## Open items

1. **Break the course/date confound.** ~~Largely done~~ - race ratings hold the
   weekly improvement fixed and rate each race against it; see **Race ratings**.
   What remains is the old note below, kept for the venue idea, which could still
   let the rate be fitted rather than fixed. Course adjustment is built and fails
   because a course factor currently absorbs about 1% per week of seasonal
   fitness — see the backtest section. The identifying trick is venues that host
   more than one meet on different dates: the venue effect is shared while the
   dates differ, which pins the time trend and lets the two be separated. Find
   the repeat venues, add a shared week term, re-run `course_value.js`. If it
   then beats raw marks, ship it and re-run `marks_value.js` and `markw.js` —
   both should flip.
2. ~~Horizon-dependent variance.~~ **Shipped** - see The horizon allowance.
   The next step is to re-run `publish.js` once a season has been scored against
   the drift term in place, so the horizon table measures what now ships rather
   than what used to.
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
