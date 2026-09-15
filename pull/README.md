# Refreshing the database

The seed inside `index.html` is a snapshot of this season's 5,000 m results.
This folder replaces it. There are two ways to run it and they share all the
code that matters.

## Scheduled, on this machine

```
pull\install-schedule.cmd        double-click once
```

Every Monday at 07:30 it crawls, rewrites `index.html`, commits and pushes;
Vercel redeploys on the push. Nobody has to be watching. The log of the last run
is `pull/last-run.log`.

```
schtasks /run    /tn "Chute database refresh"     run it now
schtasks /delete /tn "Chute database refresh" /f  stop it
node pull/crawl.js --dry                          crawl and report, write nothing
node pull/crawl.js --resume                       pick up an interrupted run
```

Run the `schtasks` lines from Command Prompt or PowerShell, not Git Bash — Git
Bash rewrites `/run` into a Windows path and the command fails with a confusing
complaint about `C:/Program Files/Git/run`. The `node` lines are fine anywhere.

`--resume` is for a crawl that stopped minutes ago. Anything older than twelve
hours is discarded rather than resumed: it would hold results from before the
weekend's meets, and half-stale results give a `DATA_DATE` belonging to neither
half.

`crawl.js` exits **0** when it wrote a new database, **2** when it refused to
because something looked wrong, and **3** when nothing had changed. Only 0 is
committed. The refusals matter more than the successes: it will not write a seed
that shrank by more than a tenth, or one built from a run where meets went
unanswered or most races came back empty. Those are what a half-finished crawl
looks like from the outside, and an unattended job that writes anyway is worse
than no job at all.

**The machine has to be on.** A missed Monday is not made up; it simply goes
again the following week, and the site keeps serving the seed it already has.

**The push needs credentials that work without anyone there.** The scheduled
task runs as you but with no console to prompt at, so a git push that would stop
to ask for a password just fails, and the log says so. This machine has
`credential.helper=manager`, so Windows Credential Manager already holds a token
and it should go through — but that is the thing most likely to break one day,
typically when the token expires. Nothing is lost when it does: everything up to
the push still happened, so the rebuilt `index.html` is sitting in the working
tree ready to commit by hand, and a single manual `git push` refreshes the
stored token for next time.

## By hand, from any browser

**https://chutexc.vercel.app/pull/refresh.html** — press Start, wait about
fifteen minutes, read the summary, press Download, and drop the file on GitHub.
It saves as it goes, so the tab can be closed and reopened.

Worth keeping for three reasons: it works from a machine that has no checkout,
it shows the crawl happening rather than a log after the fact, and it is the
fallback if the scheduled run is ever wrong.

**Do not run both at once.** They compete for the same per-endpoint budget and
rate-limit each other; both back off and recover, but between them they take far
longer than either alone. If a scheduled run is in progress, wait for it.

## Why this cannot run in the cloud

It was the obvious design and it does not work. Cloudflare serves athletic.net
and it answers a **datacenter address** with a challenge page whatever asks —
measured, not assumed: from a GitHub Actions runner, `curl` and Node's `fetch`
both got `403` and `Just a moment...`. From an ordinary home connection curl is
served normally. So there is no serverless function and no CI job, and it is not
worth hunting for a cloud host that happens not to be blocked — the block is the
site saying what it wants.

That is also why the scheduled job lives on this machine, and why the browser
harness was built first.

**And why curl rather than `fetch`.** Node's own fetch is challenged even from
here and even given perfect browser headers, because undici's TLS fingerprint is
unusual. curl is served. Nothing is being worked around: from this address curl
is simply allowed.

## What it does

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

## Three traps

**The rate limit is per endpoint, and it is invisible from JavaScript.** This is
the one that actually broke a run, so it is worth the detail.

`GetResultsData3` allows roughly ten requests per ten seconds. Nothing else
shares that budget — hammer it until it 429s and `GetMeetData` and
`GetTeamCore` still answer 200 — which is why the calendar stage can make 450
requests without a scratch while the results stage falls over after seven meets.

When it trips, Cloudflare answers the CORS **preflight** with `429` and
`Retry-After: 17`, and that reply carries no `Access-Control-Allow-Origin`. So
the browser refuses to show it: `fetch` rejects with `TypeError: Failed to
fetch` and the status and the retry hint are both unreadable from the page. The
only fingerprint is the timing — it fails in about 20ms, and nothing real fails
that fast.

Two consequences are baked into the code. Results POSTs are spaced **2 seconds**
(measured: at 1.0s it trips on the eleventh request, at 2.0s it ran fourteen for
fourteen clean), which also keeps Chrome's preflight cache warm — the server
sends no `Access-Control-Max-Age`, so the default is about five seconds, and a
POST inside that window costs one request instead of two. And a suspected limit
is backed off **30s, 60s, 120s, 180s**, blind. Retrying after a couple of
seconds is worse than not retrying: every attempt spends another preflight and
re-arms the limit.

The preflight cannot be avoided. The endpoint requires `Content-Type:
application/json` (`text/plain` gets 415) and the `anettokens` header (without
it, 403), and either one alone forces a preflight.

**An empty race is usually just an empty race.** Plenty of JV and novice races
sit on the schedule with no results ever posted, and the response for one is a
clean 200 with an empty `resultsXC`. Nothing distinguishes it from a blank
handed back under load — the `teams` array is the whole meet's entry list and
comes back populated either way. So the code retries once and then believes it,
and puts the suspicion in the aggregate instead: if more than 40% of a run's
races come back empty, the report says so.

**Distance lives in the division's name and nowhere else.** There is no
distance field — `"5,000 Meters Varsity"`, `"3,000 Meters Novice"`,
`"3 Miles Varsity Boys"`. `divMetres` parses it. The imperial ones are dropped
on purpose: the board is 5,000 m and nothing is ever converted between
distances, so a meet whose only races are 3-mile races correctly contributes
nothing, and a `0 results` line against one is right rather than broken.

Summer is dropped too. athletic.net files July running-camp time trials under
the same season (`"5,000 Meters Week 1"`); `SEASON_START` cuts at mid-August.

## The files

- **`seed.js`** — the transformation: result rows in, seed CSV out, plus the
  patchers for the seed block, `DATA_DATE` and the `LOGO` map. No network, no
  DOM, loadable from both Node and the page, so the tested code is the code
  that runs.
- **`refresh.html`** — the crawl in a browser: pacing, resumption, the live log
  and the report.
- **`crawl.js`** — the same crawl headless, for the scheduled run. Talks through
  curl, so unlike the page it can read a 429 and its `Retry-After` instead of
  backing off blind.
- **`refresh.cmd`**, **`install-schedule.cmd`** — the weekly job and its
  one-double-click installer.
- **`test_seed.js`** — `node pull/test_seed.js`. Round-trips the shipped seed
  through the builder and requires the same rows back, then checks the caps,
  the dedupe, the season floor, the plausibility bounds and all three patchers.
  42 checks, no network — which is the whole reason the transformation lives
  apart from the two crawls that call it.

`index.html` is untouched by all of this and stays a single self-contained
file — these are maintenance tools that sit beside it, not parts of it.
