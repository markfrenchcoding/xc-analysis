# Chute — Oregon 6A cross country state odds

Monte Carlo simulator for OSAA 6A cross country. Simulates whole seasons —
seven league meets, at-large selection, then the state meet at Lane — and
reports each team's odds of qualifying, placing and winning.

Live: https://chutexc.vercel.app
Repo: github.com/markfrenchcoding/xc-analysis (Vercel project is named `chutexc`)

## Shape of the thing

**One file.** `index.html` at the repo root, ~700KB, no build step, no
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
file. Columns: `gender,athlete,mark,grade,team,dist`.

- `gender` is `M`/`F`; `dist` is always `5000`
- one row per athlete per mark; duplicates are the point, not a mistake
- a `class` column selects the board: 6A, 5A, 4A, 3A or 2A/1A
- 7,604 rows currently across all five classifications: 3,524 athlete-boards,
  222 schools, up to twelve deep a team. Pulled through Sep 24, 2026 by the refresh
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
cutoff): 107 of 144 actual qualifiers inside the board's top group, 2 of 8
champions named, pooled Brier 0.1536 against 0.2319 for knowing nothing, 35%
skill.

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
node pull/test_seed.js        # 61 checks, no network
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

Current coverage: 7,604 marks, 3,524 athlete-boards, 222 schools, from 93 meets.
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

**Four-year completion, distance athletes: boys 46%, girls 44%.** It was 42%
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

### The horizon

athletic.net's Tualatin coverage stops before 2004 and thins before about 2008.
`FIRST_SEASON` records it and it is written into `t284_meets.json`, because an
"all-time" board that is silently a "since 2005" board is the same failure as a
stale `DATA_DATE`. The 47 unknown-gap entries cluster at the front of the record,
which is the horizon showing up honestly rather than being papered over.

Meghan Peyton is outside it under either name. That is a test, so a later pull
reaching further back fails here rather than surprising somebody.

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

`roster.html` is the second page, built from `pull/roster/` by
`node pull/build_dash.js 284`. Same shape as the app: one self-contained file,
data in a `<script type="text/plain">` block that a script rewrites, no build
step and no fetch. 426KB on disk, **127KB gzipped**, still smaller than the app.

**The page is narrower than the archive, on purpose.** `roster.js` keeps the
whole running programme because a roster that quietly drops people is what this
project keeps arguing against. The dashboard takes the 749 athletes with a mark
at 800m or longer and leaves the 817 sprint-only ones in the CSVs, because
nothing here reads them: VDOT does not take a 100m, a development curve over
that group is noise wearing a number, and a retention figure mixing two
programmes describes neither. Their own sprints stay in — a distance runner's
400m is worth seeing. It is about a fifth of the bytes, and the bytes are not
the reason.

It inherits the app's CSP without a change — inline script, Google fonts,
`connect-src none`, no images, nothing to relax.

**It is kept out of the deployment**, by `.vercelignore`. Everything on it is
already public on athletic.net under a full name, but a page that gathers one
named teenager's whole arc — their plateau, their attrition, the season they
got slower — onto a single screen is a different object from a results
database, and `chutexc.vercel.app` is a guessable address. Deleting two lines
publishes it. Do it deliberately or not at all. Current athletes are initialled
either way; `SHOW_CURRENT` in the page controls that.

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

**Cross country only, and not for want of trying.** athletic.net serves track as
season bests rather than as every race, so there is one mark per athlete per
event per season and nothing to take a residual against. A best is already the
best day. The page says this where the panel would otherwise look missing.

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
page and `roster.js` now use "strictly before the latest school year", and both
print the same number. Two places computing the same statistic differently is
how a dashboard ends up disagreeing with its own source.

### Charts carry the shape, tables carry the numbers

Three series in a grouped bar leaves about fifteen viewBox units a bar, and
`+2.76` at a size anybody can read on a phone is wider than that. They
collided. The values moved to a table under the chart with the sample size
beside each one, which is better on a desktop too. Bars keep `<title>`
tooltips.

Same 200-unit viewBox lesson as the How tab's diagrams: a label written at 6
units renders at about 10px on a 375px column, which is too small. `--axt` is
6.5 and `--lbl` is 7.

### What it says

Over distance athletes, four-year completion is **46% boys, 44% girls**, and
**28% of the boys joined after grade 9**. The girls' senior year is **negative**
across every population on the cross country ruler, and the boys' turns negative
too once you switch to the track 3,000m. None of that is visible on any board,
in any poll, or in any result athletic.net publishes.

The freshman-to-sophomore step being the largest survives on every ruler and in
every population, which is the one finding here that has not moved under any
amount of re-cutting.


## How the simulation works

One "season" is: draw times → score seven league meets → allocate 14 automatic
and 2 at-large berths → **redraw all times** → score the 16-team state meet.

The redraw matters. A team that got hot at districts starts again from its
marks. Carrying one draw through both would amplify luck instead of averaging it.

**Sampling.** Each race draws from an athlete's top three marks at 25/50/25,
renormalised when fewer exist (`MARK_W`, `pickMark`). Live as of the Sep 24
pull: **2,717 of 3,524** athlete-boards carry two or three marks, **77%**, up
from 53% a fortnight earlier and 348 of 1,172 before the automated pull. This is
now the ordinary case rather than the exception, which also means the `MARK_W`
unfairness below is biting less: it only hurts when *some* teams have raced
twice and others have not, and by late September most have. Read open item 2
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

**It narrows on its own, and four refreshes running have shown it.** Nobody has
touched a constant:

| data through | weeks to Lane | drift | total |
|---|---|---|---|
| Sep 12 | 8.01 | 5.54% | 6.00% |
| Sep 17 | 7.29 | 4.01% | 4.62% |
| Sep 19 | 7.01 | 3.39% | 4.10% |
| Sep 24 | 6.30 | 1.84% | 2.95% |

If a refresh ever leaves the total unchanged, the horizon is not being read -
check `DATA_DATE` and `STATE_DATE` before believing the board.

**The fall is steeper than the calendar**, and the curve is why. Five days of
racing took 0.71 weeks off the horizon and 1.15 points off the total, because
`RECORD.horizon` is measured at 6.0% eight weeks out and 2.6% at six: most of
the allowance is spent in that first fortnight. The board is now 0.65 points
above the 2.3% race-day floor and will reach it in late October, after which
further refreshes move the odds without moving the spread.

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
| seed parse, 7,604 rows | 7ms |
| `buildModel` | 0.45ms |
| `buildBoard`, 45 cards | 25ms, once per press of Run |
| `fitNames` | 0.3ms typical, 9ms on the one board with long names |
| one simulated season | ~90µs, so 135 fit in a 12ms frame |
| `paint` full | 0.8ms |
| page, gzipped | 198KB of a 723KB file |

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
uppercase) and Run is capped at 38% and 190px - still the loudest element on the
page by colour, no longer by area. It was the other way round, at roughly two
thirds button.

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
googleusercontent, and `connect-src none` on the app because the page makes no
requests of its own. `/pull/` gets its own looser policy, because the refresh
harness genuinely does call athletic.net.

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
node audit2.js               # 93 checks, 1 deliberate failure
node pull/test_seed.js       # 64 checks on the seed builder, no network
node pull/test_crawl.js      # 8 checks on the scheduled crawl's write guards
node pull/test_roster.js     # 93 checks on the roster builder, no network
node backtest/test_snapshot.js   # 38 checks that the archive REFUSES, both line endings
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

**It costs about 21KB a snapshot.** Four entries are 84KB of a 723KB file, and
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

**Early entries are narrower, and are not rewritten to match.** `fwdTeam` reads
both the wide shape and the original `[qual, win]` one, and a column that did not
exist yet prints as a dash. Widening the archive must never mean going back over
what it already said.

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
regex back and the suite fails.

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
