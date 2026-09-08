"""
api/score.py -- Vercel Python Serverless Function.

Deployed, this becomes: https://<your-project>.vercel.app/api/score

Everything (fetch, parse, scoring) is inlined into this single file
deliberately -- Vercel's Python builder bundles per-function, and keeping
one file per function avoids any ambiguity about whether sibling modules
get included.

Query params (GET):
    events        required. Comma-separated event ids or full race URLs.
                  e.g. /api/score?events=2909525,2909527,2909529
    add_runner    optional, repeatable. "Name|Team|Time" e.g.
                  add_runner=Jayden%20Smith|Tualatin|9:02.0

Response: JSON with "results" (every parsed finisher), "team_scores"
(NFHS-scored teams), and "errors" (any per-event fetch/parse problems --
partial failures don't kill the whole response).
"""
import json
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import requests

BLOB_URL_TEMPLATE = "https://athleticlive.blob.core.windows.net/$web/ind_res_list/_doc/{event_id}"
EVENT_URL_RE = re.compile(r"/events/xc/(\d+)")

_KEY_ALIASES = {
    "place": ["place", "Place", "overallPlace", "OverallPlace", "pos", "Pos", "rank", "Rank"],
    "bib": ["bib", "Bib", "bibNumber", "BibNumber"],
    "first_name": ["firstName", "FirstName", "first_name", "fname", "FName"],
    "last_name": ["lastName", "LastName", "last_name", "lname", "LName"],
    "full_name": ["name", "Name", "athleteName", "AthleteName", "fullName", "FullName"],
    "team": ["team", "Team", "school", "School", "teamName", "TeamName"],
    "grade": ["grade", "Grade", "yr", "Yr", "year", "Year"],
    "gender": ["gender", "Gender", "sex", "Sex"],
    "time": ["time", "Time", "finishTime", "FinishTime", "mark", "Mark"],
}
_LIST_CONTAINER_KEYS = ["results", "Results", "data", "Data", "items", "Items",
                         "athletes", "Athletes", "finishers", "Finishers", "rows", "Rows"]
_EVENT_NAME_KEYS = ["eventName", "EventName", "name", "Name", "description", "Description", "title", "Title"]


def extract_event_id(url_or_id: str) -> str:
    url_or_id = url_or_id.strip()
    if url_or_id.isdigit():
        return url_or_id
    m = EVENT_URL_RE.search(url_or_id)
    if m:
        return m.group(1)
    raise ValueError(f"Could not find an event id in {url_or_id!r}")


def fetch_event_json(event_id_or_url: str):
    event_id = extract_event_id(event_id_or_url)
    url = BLOB_URL_TEMPLATE.format(event_id=event_id)
    resp = requests.get(url, timeout=8, headers={
        "User-Agent": "Mozilla/5.0 (compatible; xc-analytics-vercel/1.0)"
    })
    if resp.status_code != 200:
        raise RuntimeError(f"event {event_id}: HTTP {resp.status_code} from {url}")
    try:
        payload = resp.json()
    except ValueError:
        raise RuntimeError(
            f"event {event_id}: response wasn't valid JSON "
            f"(content-type {resp.headers.get('Content-Type')}); "
            f"first 200 chars: {resp.text[:200]!r}"
        )
    return event_id, payload


def _first_present(d, keys):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def _parse_time_to_seconds(raw_time):
    if raw_time is None:
        return None
    if isinstance(raw_time, (int, float)):
        return float(raw_time)
    s = str(raw_time).strip()
    if not s:
        return None
    parts = s.split(":")
    try:
        if len(parts) == 1:
            return float(parts[0])
        elif len(parts) == 2:
            m, sec = parts
            return int(m) * 60 + float(sec)
        elif len(parts) == 3:
            h, m, sec = parts
            return int(h) * 3600 + int(m) * 60 + float(sec)
    except ValueError:
        return None
    return None


def _find_result_list(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in _LIST_CONTAINER_KEYS:
            if key in payload and isinstance(payload[key], list):
                return payload[key]
        for v in payload.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    raise ValueError(
        "Could not locate a list of result rows. Top-level type: "
        f"{type(payload).__name__}"
        + (f", keys: {list(payload.keys())}" if isinstance(payload, dict) else "")
    )


def parse_event(payload, event_id):
    event_name = _first_present(payload, _EVENT_NAME_KEYS) if isinstance(payload, dict) else None
    rows = _find_result_list(payload)
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        first_name = _first_present(row, _KEY_ALIASES["first_name"])
        last_name = _first_present(row, _KEY_ALIASES["last_name"])
        if first_name is None and last_name is None:
            full = _first_present(row, _KEY_ALIASES["full_name"])
            if full:
                bits = str(full).split(None, 1)
                first_name = bits[0] if bits else None
                last_name = bits[1] if len(bits) > 1 else None
        name = " ".join(p for p in (first_name, last_name) if p) or "(unknown)"
        raw_place = _first_present(row, _KEY_ALIASES["place"])
        out.append({
            "event_id": event_id,
            "event_name": event_name,
            "place": int(raw_place) if raw_place is not None and str(raw_place).isdigit() else None,
            "bib": str(_first_present(row, _KEY_ALIASES["bib"]) or "") or None,
            "name": name,
            "team": str(_first_present(row, _KEY_ALIASES["team"]) or "") or None,
            "grade": str(_first_present(row, _KEY_ALIASES["grade"]) or "") or None,
            "gender": str(_first_present(row, _KEY_ALIASES["gender"]) or "") or None,
            "time_seconds": _parse_time_to_seconds(_first_present(row, _KEY_ALIASES["time"])),
        })
    return out


def score_meet(runners):
    """runners: list of dicts with 'name', 'team', 'time_seconds'."""
    ranked = [r for r in runners if r.get("time_seconds") is not None]
    ranked.sort(key=lambda r: r["time_seconds"])

    team_finish_counts = {}
    for r in ranked:
        team_finish_counts[r["team"]] = team_finish_counts.get(r["team"], 0) + 1
    complete_teams = {t for t, c in team_finish_counts.items() if c >= 5}

    seen_count = {}
    retained = []
    for r in ranked:
        if r["team"] not in complete_teams:
            continue
        n = seen_count.get(r["team"], 0) + 1
        seen_count[r["team"]] = n
        if n <= 7:
            retained.append(r)

    team_places = {}
    for idx, r in enumerate(retained, start=1):
        team_places.setdefault(r["team"], []).append(idx)

    results = []
    for team, places in team_places.items():
        scoring = places[:5]
        displacers = places[5:7]
        score = sum(scoring) if len(scoring) == 5 else None
        results.append({
            "team": team, "score": score,
            "scoring_places": scoring, "displacer_places": displacers,
            "all_places": places,
        })

    def sort_key(ts):
        sixth = ts["displacer_places"][0] if len(ts["displacer_places"]) >= 1 else float("inf")
        seventh = ts["displacer_places"][1] if len(ts["displacer_places"]) >= 2 else float("inf")
        score = ts["score"] if ts["score"] is not None else float("inf")
        return (score, sixth, seventh)

    results.sort(key=sort_key)
    ranked_out = []
    rank = 0
    for ts in results:
        if ts["score"] is None:
            continue
        rank += 1
        ts_out = dict(ts)
        ts_out["rank"] = rank
        ranked_out.append(ts_out)
    return ranked_out


def _parse_add_runner(spec):
    try:
        name, team, time_str = spec.split("|")
    except ValueError:
        raise ValueError(f"add_runner must look like 'Name|Team|Time', got: {spec!r}")
    t = _parse_time_to_seconds(time_str)
    if t is None:
        raise ValueError(f"add_runner: could not parse time {time_str!r}")
    return {"name": name.strip(), "team": team.strip(), "time_seconds": t}


def build_response(events, add_runners):
    all_results = []
    errors = []
    for e in events:
        e = e.strip()
        if not e:
            continue
        try:
            event_id, payload = fetch_event_json(e)
        except Exception as ex:
            errors.append(f"fetch failed for {e!r}: {ex}")
            continue
        try:
            records = parse_event(payload, event_id)
        except Exception as ex:
            errors.append(f"parse failed for event {event_id}: {ex}")
            continue
        all_results.extend(records)

    for spec in add_runners:
        try:
            r = _parse_add_runner(spec)
            all_results.append({
                "event_id": None, "event_name": "manual-add", "place": None,
                "bib": None, "name": r["name"], "team": r["team"], "grade": None,
                "gender": None, "time_seconds": r["time_seconds"],
            })
        except Exception as ex:
            errors.append(str(ex))

    team_scores = score_meet(all_results)
    return {"results": all_results, "team_scores": team_scores, "errors": errors}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        events_param = qs.get("events", [""])[0]
        events = [e for e in events_param.split(",") if e.strip()]
        add_runners = qs.get("add_runner", [])

        if not events:
            body = json.dumps({"error": "missing required query param 'events'"}).encode()
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return

        try:
            result = build_response(events, add_runners)
            status = 200
        except Exception as ex:
            result = {"error": str(ex)}
            status = 500

        body = json.dumps(result, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
