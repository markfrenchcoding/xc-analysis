# XC Analytics — deploy to Vercel (free tier)

## What you're deploying

- `index.html` — a simple web page with a form.
- `api/score.py` — a Python serverless function at `/api/score` that fetches
  AthleticLIVE results, parses them, and scores the meet.
- `requirements.txt` — tells Vercel to `pip install requests` for the function.

No `vercel.json` needed — Vercel auto-detects: anything in `api/*.py` becomes
a serverless function, everything else (like `index.html`) is served as a
static file. This is the simplest possible layout on purpose.

## Why this has a real shot at working (unlike testing it with me)

I have no network access in my own environment, so I could only test the
logic with mocked data (see `test_api_score.py` — it passes). **Vercel's
serverless functions run on real infrastructure with normal outbound
internet access**, the same as your own laptop's browser. So the one thing
I couldn't verify — does the actual fetch to AthleticLIVE succeed — has a
genuine chance of just working once it's deployed, unlike in my sandbox.

## Deploy without using git or the command line

You mentioned Command Prompt gave you trouble earlier, so here's a path
that avoids it entirely, using only web browsers.

### Step 1 — Put the files on GitHub

1. Go to https://github.com and sign in (or create a free account).
2. Click the **+** in the top right → **New repository**.
3. Name it something like `xc-analytics`, keep it **Public** or **Private**
   (either works), click **Create repository**.
4. On the new repo's page, click **Add file → Upload files**.
5. Drag in `index.html` and `requirements.txt` from this folder.
6. For `api/score.py`: GitHub's uploader will actually recreate the `api/`
   folder automatically if you drag the whole `api` folder in from your
   file explorer. If it doesn't accept a folder drag, instead click
   **Add file → Create new file**, type `api/score.py` as the filename
   (GitHub creates the folder for you), then paste in the contents of
   `api/score.py` from this package, and commit.
7. Click **Commit changes**.

### Step 2 — Import into Vercel

1. Go to https://vercel.com and sign up (free "Hobby" plan) — easiest is
   "Continue with GitHub" so it's already linked.
2. Click **Add New... → Project**.
3. Find your `xc-analytics` repo in the list and click **Import**.
4. Leave all settings on their defaults (Framework Preset: "Other" is fine).
5. Click **Deploy**.

That's it. In under a minute you'll get a URL like
`https://xc-analytics-yourname.vercel.app`. Open it, paste in an event id,
click **Score meet**.

## If the first request fails

Open your browser's dev tools (F12) → Network tab, click the failed
`/api/score` request, and look at the Response tab. Two likely outcomes:

- **A clear JSON error message** (e.g. `"fetch failed for '...': HTTP 403"`)
  — this means AthleticLIVE blocked or changed the endpoint. Send me the
  exact message.
- **A JSON parse error mentioning "Could not locate a list of result
  rows"** — this means the fetch worked but the real JSON shape doesn't
  match what `parse_event()` guesses. Vercel's function logs (in your
  Vercel dashboard, under the project → **Deployments** → the function's
  **Logs**) will show more detail. Send me what you find and I'll fix the
  field-name aliases in one pass.

Either way, this is a fast, targeted fix from here — not a rebuild.

## Local testing (optional, requires Python)

```bash
pip install requests
python3 test_api_score.py
```

This runs the same logic Vercel will run, against mocked data, so you can
confirm nothing broke before deploying. It does NOT make a real network
call (my environment can't either), so it can't tell you whether the live
AthleticLIVE endpoint itself will respond — only Vercel (or your own
machine with internet) can tell you that.

## Updating it later

Whenever you want to change something: edit the file on GitHub directly
(pencil icon on the file page → edit → commit), and Vercel automatically
redeploys within a minute or two. No command line needed for updates either.
