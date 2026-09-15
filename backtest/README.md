# Backtest

Builds the marks database as it stood on a date in a past season, simulates that
season, and compares the result to what actually happened at Lane in November. It
answers a different question from "does the ranking look right" — it asks whether
the probabilities are honest.

```
node backtest/backtest.js                # every season, mid-September cutoff
node backtest/backtest.js 2025           # one season
node backtest/backtest.js 5.0            # with the variance dial at 5.0%
node backtest/backtest.js --cut 3        # the fourth cutoff (late October)

node backtest/sweep.js                   # which sigma fits the outcomes best
node backtest/horizon.js                 # does the best sigma fall toward November?
node backtest/confound.js                # is that horizon, or just thin data?
node backtest/marks_value.js             # do extra marks per athlete actually help?
node backtest/bootstrap.js               # how well pinned is the best sigma?
```

`lib.js` holds the shared loading and simulation; everything else is a thin
script on top of it.

## Data

Each season contributes two kinds of committed artifact:

- `data/<year>-truth.json` — league alignment, district results, the state
  result, and the berth counts for that year
- `data/<year>-seed-<cutoff>.csv` — the marks database as of that date, built
  exactly the way `index.html` builds its own seed

Four cutoffs per season walk from mid-September to late October, so the same
season can be replayed at different distances from the state meet. That is what
makes the horizon measurable.

## Each season is its own contest

Do not assume today's rules. League membership, league names and the size of the
state field all move year to year:

| season | seventh league | state field |
|---|---|---|
| 2024 | Southwest Conference | 18 (14 automatic + 4 at-large) |
| 2025 | Southwest Conference | 18 (14 automatic + 4 at-large) |
| 2026 | Special District 1 | 16 (14 automatic + 2 at-large) |

`build_season.js` derives all of it from the season's own district and state
results rather than hardcoding, and `lib.js` sets `AUTO_PER` / `AT_LARGE` per
season accordingly.

Telling a qualifying team from a cluster of individual qualifiers needs care.
OSAA advances any runner in a district's top 14 who is not on a qualifying team,
so a strong third-place squad can send five runners to state without holding a
team berth — 2024 Sprague did exactly that, with district places 3, 8, 10, 13 and
14. Six or more entries is always a team; exactly five is a team only if those
five were not all inside their own district's top 14.

## Regenerating a season

The raw pulls are large and stay out of the repo (`backtest/raw/` is
gitignored), but they are no longer hand-made. Put the season's eight meet ids
and four cutoffs in `seasons.json`, then:

```
node backtest/pull_season.js 2023      # ~15 min, resumable with --resume
node backtest/build_season.js 2023
node backtest/test_build.js            # the ground truth's own checks
```

This used to be a prose recipe and nothing else, which is exactly why a bug in
how the raw data was *read* could not be corrected: there was no way to rebuild
what had been pulled. Now there is.

**Finding a season's eight meet ids.** Only the state meet has to be found by
hand — walk a perennial qualifier's calendar for that year and look for "OSAA 6A
State Championships". Everything else falls out of it: the state result carries
a `TeamID` on every row and covers all seven leagues, so walking those teams'
calendars for meets named like a league championship turns up all seven
districts. They are numbered `6A-1` through `6A-7` in the meet names, which is
a useful check that none is missing.

`pull_season.js` then needs nothing else. It takes the roster from the districts
rather than from today's alignment — league membership moves every year — and it
skips meets dated after the last cutoff unless they are the districts or the
state meet, since nothing later can enter an information set.

**Exclusions.** `exclude` drops a meet from the marks database without dropping
it from the truth. It exists for the Ultimook at the Hydrangea Ranch, which is
effectively an obstacle course; the same organisers also run an ordinary meet at
Alderbrook which must be kept. The pull records each meet's venue in
`y<year>_meta.json`, so the right ids can be read off after a pull rather than
guessed at.

Cutoffs sit at the same point in the season across years, starting from the
second Saturday of September, which is where the live database sits in-season.

`confound.js` and `marks_value.js` write `*-single.csv` variants into `data/`;
those are generated and gitignored.

## Junior Varsity is not Varsity

Worth knowing about, because it was wrong for a long time and did not look it.

Five of the seven districts label their second race "5,000 Meters Junior
Varsity". `/Varsity/i` matches that string, so the filter that was meant to pick
out the district varsity race quietly folded the JV race in with it.

It was invisible from the output. A team's five fastest are its varsity five
either way, so the *winning* score barely moved. What moved was everything
under it: JV runners take places, so every score below the winner inflated, and
a school that could not field five varsity runners suddenly could. 2025 PIL was
published as nine scoring teams when it had seven — Benson Tech and
Jefferson-Portland only exist in that table because their JV runners were
counted.

That matters more than a cosmetic slip, because the district result is not an
output — it is *ground truth*. It decides league membership, it decides which
teams the model is scored against, and it feeds the top-14 rule that separates a
qualifying team from a cluster of individual qualifiers. An error there does not
look like a bug. It looks like a model that is slightly better or worse than it
really is.

`isVarsity` in `build_season.js` now excludes it explicitly, and
`test_build.js` pins the classifier against every division-name spelling the
seven districts actually use.


## Excluding meets does not buy accuracy

The obvious way to make the published percentages look better is to drop meets
that "clearly" do not belong. It was tried properly and it does not work, and
the way it fails is worth keeping.

Five reasons for dropping a meet were written down **first**, in
`exclusion_rules.js`, each having to stand on its own without reference to any
score. 2023 was held out. The rules were judged on 2022, 2024 and 2025 and then
applied once to the season none of them had been allowed to influence.

```
node backtest/exclusions.js
```

| rule | development Brier | holdout 2023 |
|---|---|---|
| none — what ships | 0.1427 | **0.1869** |
| intrasquad time trials | 0.1428 | 0.1872 |
| tiny fields | **0.1391** best | **0.2197** worst |
| too few schools | 0.2003 | 0.2609 |
| odd fitted course | 0.1495 | 0.2077 |

**The only rule that helped in development was the worst of all on the holdout.**
Dropping meets with small fields improved pooled Brier from 0.1427 to 0.1391 on
the seasons it was chosen on, and then made it *worse* than doing nothing on the
season it had never seen — 0.2197 against 0.1869, skill falling from 22% to 8%.
The gap is around thirty times the sampling noise, so it is not a close call.

Nothing survived. The seed keeps every 5,000m race from mid-August on, minus the
Ultimook at the Hydrangea Ranch, which is excluded for a reason that was true
before anyone scored it: it is run at an obstacle course.

**This is a stronger claim than a tuned number would have been.** "Five
principled exclusions were tested against a held-out season and none of them
improved it" is something the published figures can rest on. "We found the meet
set that produced the best Brier" is not evidence about the model at all — it is
a description of the search, and the first genuinely new season would expose it.

If a future rule is proposed, it goes in `exclusion_rules.js` with its reason,
it gets run with everything else, and the holdout number is the only one worth
quoting.

## Where the accuracy actually is

Two things move the published figures honestly, and neither is data selection.

**The variance dial is wrong in September.** The shipped `CAL.sd` is 2.3% and
the eight-week optimum across four seasons is **6%**. Using it would improve the
September Brier from 0.1535 to 0.1392, about 9% better, for free. That is open
item 2 in CLAUDE.md and it is the single largest legitimate gain available.

**Most of the apparent weakness is September itself, not the model.** At the
October cutoffs all four seasons land between 72% and 81% skill, a spread of 5
to 9 points — the model is not worse on the older seasons. What differs is how
much had been raced and recorded by the September cutoff: 14 meets in 2022,
33 by the same point in 2025. Quote the figures per cutoff, not pooled, or the
number describes neither regime.
