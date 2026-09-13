# Backtest

Builds the marks database as it stood in mid-September of a past season,
simulates that season, and compares the result to what actually happened at
Lane in November. It answers a different question from "does the ranking look
right" — it asks whether the probabilities are honest.

```
node backtest/backtest.js              # every season in data/
node backtest/backtest.js 2025         # one season
node backtest/backtest.js 5.0          # with the variance dial at 5.0%
node backtest/sweep.js                 # which sigma fits the outcomes best
```

`backtest.js` and `sweep.js` read only the two committed artifacts per season:

- `data/<year>-truth.json` — league alignment, district results, the state
  result, and the berth counts for that year
- `data/<year>-seed.csv` — the marks database as of that season's cutoff date,
  built exactly the way `index.html` builds its own seed

## Each season is its own contest

Do not assume today's rules. League membership, league names and the size of
the state field all move year to year:

| season | seventh league | state field |
|---|---|---|
| 2024 | Southwest Conference | 18 (14 automatic + 4 at-large) |
| 2025 | Southwest Conference | 18 (14 automatic + 4 at-large) |
| 2026 | Special District 1 | 16 (14 automatic + 2 at-large) |

`build_season.js` derives all of that from the season's own district and state
results rather than hardcoding it, and `backtest.js` sets `AUTO_PER` /
`AT_LARGE` per season accordingly.

Telling a qualifying team from a cluster of individual qualifiers needs care.
OSAA advances any runner in a district's top 14 who is not on a qualifying
team, so a strong third-place squad can send five runners to state without
holding a team berth — 2024 Sprague did exactly that. Six or more entries is
always a team; exactly five is a team only if those five were not all inside
their own district's top 14.

## Regenerating a season

The raw pulls are large and are not kept in the repo (`backtest/raw/` is
gitignored). To rebuild one, pull the season with the API recipe in
`CLAUDE.md` — every 6A team's calendar for that year, then every division of
the meets up to the cutoff plus the seven district championships and the state
meet — save it as `backtest/raw/y<year>_raw.csv` and `y<year>_meta.json`, add
the meet ids to `seasons.json`, then:

```
node backtest/build_season.js 2024 backtest/raw
```

Cutoffs sit at the same point in the season as the live database: the second
Saturday of September.
