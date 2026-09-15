# Refreshing the database

The seed inside `index.html` is a snapshot of this season's 5,000 m results.
This folder is how it gets replaced without anyone typing a CSV.

## Doing it

1. Open **https://chutexc.vercel.app/pull/refresh.html**
2. Press **Start** and leave the tab open. It takes about fifteen minutes.
3. Read the summary it prints. If the row count collapsed or it says races
   would not answer, do not upload — wait an hour and press Start again.
4. Press **Download index.html**.
5. On GitHub, open `index.html` → **Edit** → upload, and drop the new file on
   top of the old one. Commit.

It saves as it goes, so closing the tab costs nothing. Reopen it and press
Start and it carries on from where it stopped. **Start over** throws the
part-finished run away.

## Why it is a web page and not a script

athletic.net sits behind Cloudflare, which answers Node with a challenge page
instead of data — verified, a plain `fetch` from Node gets a 403 and
`Just a moment...`. From a real browser session the same endpoints answer
normally, and they send permissive CORS, so the page can be served from
anywhere. It is confirmed working from `chutexc.vercel.app` and from
`localhost`.

Nothing is uploaded. The rebuilt file is assembled in the tab and handed to the
browser's own download.

## What it actually does

| step | requests |
|---|---|
| every Oregon high school, with team ids and crests | 1 |
| each board school's calendar, for meets with results | 2 per school |
| each meet's divisions, then each 5,000 m race | 1 + ~2 per meet |

Oregon is division **87377** (`World > United States > High School > Oregon`).
That one call returns 765 alignment rows covering 438 schools, which is where
team ids and mascot urls both come from — the crest map used to be a separate
167-request pass and no longer is.

230 of the 231 schools on the OSAA boards have an athletic.net team. **Elgin**
does not, and cannot be aliased into existence.

## Two traps

**An empty race is usually a throttle, not an empty race.** Asked too fast,
athletic.net answers `200` with an empty `resultsXC` rather than a `429`. A
harness that believes it ships a database missing half the state, and nothing
about the response looks like an error. The tell is inside the same payload: a
throttled division still lists its `teams`, where a division that genuinely
never ran lists none. `divRows` retries those, widens the gap between POSTs for
everything afterwards, and counts what it could never get so the summary can
say the database is incomplete.

**Distance lives in the division's name and nowhere else.** There is no
distance field — `"5,000 Meters Varsity"`, `"3,000 Meters Novice"`,
`"3 Miles Varsity Boys"`. `divMetres` parses it. The imperial ones are dropped
on purpose: the board is 5,000 m and nothing is ever converted between
distances, so a meet whose only races are 3-mile races correctly contributes
nothing.

Summer is dropped too. athletic.net files July running-camp time trials under
the same season (`"5,000 Meters Week 1"`); `SEASON_START` cuts at mid-August.

## The files

- **`seed.js`** — the transformation: result rows in, seed CSV out, plus the
  patchers for the seed block, `DATA_DATE` and the `LOGO` map. No network, no
  DOM, loadable from both Node and the page, so the tested code is the code
  that runs.
- **`refresh.html`** — the crawl: pacing, resumption, the log and the report.
- **`test_seed.js`** — `node pull/test_seed.js`. Round-trips the shipped seed
  through the builder and requires the same rows back, then checks the caps,
  the dedupe, the season floor and all three patchers. 39 checks.

`index.html` is untouched by all of this and stays a single self-contained
file — these are maintenance tools that sit beside it, not parts of it.
