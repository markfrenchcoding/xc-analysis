"""
Not deployed to Vercel -- this is a local-only test to verify the logic
inside api/score.py still works correctly after being inlined into one
file. Run with: python3 test_api_score.py
"""
import json
import sys
import os
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))
import score as score_mod  # noqa: E402


SAMPLE_PAYLOAD = [
    {"Place": 1, "Bib": "1", "FirstName": "A1", "LastName": "Runner", "Team": "Alpha", "Time": "17:00.0"},
    {"Place": 2, "Bib": "2", "FirstName": "B1", "LastName": "Runner", "Team": "Beta", "Time": "17:10.0"},
    {"Place": 3, "Bib": "3", "FirstName": "A2", "LastName": "Runner", "Team": "Alpha", "Time": "17:20.0"},
    {"Place": 4, "Bib": "4", "FirstName": "B2", "LastName": "Runner", "Team": "Beta", "Time": "17:30.0"},
    {"Place": 5, "Bib": "5", "FirstName": "A3", "LastName": "Runner", "Team": "Alpha", "Time": "17:40.0"},
    {"Place": 6, "Bib": "6", "FirstName": "B3", "LastName": "Runner", "Team": "Beta", "Time": "17:50.0"},
    {"Place": 7, "Bib": "7", "FirstName": "A4", "LastName": "Runner", "Team": "Alpha", "Time": "18:00.0"},
    {"Place": 8, "Bib": "8", "FirstName": "B4", "LastName": "Runner", "Team": "Beta", "Time": "18:10.0"},
    {"Place": 9, "Bib": "9", "FirstName": "A5", "LastName": "Runner", "Team": "Alpha", "Time": "18:20.0"},
    {"Place": 10, "Bib": "10", "FirstName": "B5", "LastName": "Runner", "Team": "Beta", "Time": "18:30.0"},
]


def test_parse_and_score():
    records = score_mod.parse_event(SAMPLE_PAYLOAD, event_id="1234")
    assert len(records) == 10
    assert records[0]["name"] == "A1 Runner"
    assert records[0]["team"] == "Alpha"
    assert records[0]["time_seconds"] == 17 * 60.0

    scores = score_mod.score_meet(records)
    by_team = {s["team"]: s for s in scores}
    assert by_team["Alpha"]["score"] == 1 + 3 + 5 + 7 + 9
    assert by_team["Beta"]["score"] == 2 + 4 + 6 + 8 + 10
    print("PASS: parse_event + score_meet work correctly on inlined api/score.py")


def test_build_response_with_mocked_fetch():
    fake_resp = mock.Mock()
    fake_resp.status_code = 200
    fake_resp.headers = {"Content-Type": "application/json"}
    fake_resp.json.return_value = SAMPLE_PAYLOAD
    fake_resp.text = json.dumps(SAMPLE_PAYLOAD)

    with mock.patch.object(score_mod.requests, "get", return_value=fake_resp):
        result = score_mod.build_response(["1234"], [])
        assert len(result["results"]) == 10
        assert len(result["team_scores"]) == 2
        assert result["errors"] == []
    print("PASS: build_response works end-to-end against a mocked HTTP response")


def test_add_runner():
    result = score_mod.build_response([], ["Jayden Smith|Tualatin|9:02.0"])
    assert len(result["results"]) == 1
    assert result["results"][0]["team"] == "Tualatin"
    assert result["results"][0]["time_seconds"] == 9 * 60 + 2.0
    print("PASS: manual --add_runner path works")


def test_bad_events_param_reported_not_swallowed():
    result = score_mod.build_response(["not-a-valid-event-spec-xyz"], [])
    assert len(result["errors"]) == 1
    print("PASS: unparseable event spec is reported as an error, not silently dropped")


if __name__ == "__main__":
    test_parse_and_score()
    test_build_response_with_mocked_fetch()
    test_add_runner()
    test_bad_events_param_reported_not_swallowed()
    print("\nAll api/score.py logic tests passed.")
