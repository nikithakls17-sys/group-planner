from datetime import datetime, timezone

from app.times import find_windows, is_free, local_ok, local_to_utc, parse_iso

NOW = datetime(2026, 10, 20, tzinfo=timezone.utc)


def slots(tz, *ranges):
    return [(local_to_utc(d, a, tz), local_to_utc(d, b, tz)) for d, a, b in ranges]


def test_local_to_utc_india_and_us():
    assert local_to_utc("2026-10-31", "19:00", "Asia/Kolkata") == datetime(2026, 10, 31, 13, 30, tzinfo=timezone.utc)
    assert local_to_utc("2026-10-31", "09:00", "America/Chicago") == datetime(2026, 10, 31, 14, 0, tzinfo=timezone.utc)


def test_is_free_needs_full_cover_and_joins_slots():
    s = [(parse_iso("2026-10-31T10:00Z"), parse_iso("2026-10-31T11:00Z")),
         (parse_iso("2026-10-31T11:00Z"), parse_iso("2026-10-31T12:00Z"))]
    assert is_free(s, parse_iso("2026-10-31T10:30Z"), parse_iso("2026-10-31T12:00Z"))
    assert not is_free(s, parse_iso("2026-10-31T11:30Z"), parse_iso("2026-10-31T12:30Z"))


def test_no_3am_calls():
    # 2 PM UTC is 7:30 PM in India but 9 AM in Chicago: fine. 9 PM UTC is 2:30 AM in India: not fine.
    assert local_ok("Asia/Kolkata", parse_iso("2026-10-31T14:00Z"), parse_iso("2026-10-31T15:00Z"))
    assert not local_ok("Asia/Kolkata", parse_iso("2026-10-31T21:00Z"), parse_iso("2026-10-31T22:00Z"))


def test_finds_overlap_across_us_and_india():
    members = [
        {"id": "a", "tz": "Asia/Kolkata", "slots": slots("Asia/Kolkata", ("2026-10-31", "18:00", "23:00"))},
        {"id": "b", "tz": "America/Chicago", "slots": slots("America/Chicago", ("2026-10-31", "07:00", "12:00"))},
    ]
    w = find_windows(members, "2026-10-31", "2026-10-31", 1, now=NOW)
    assert w and w[0]["everyone"]
    s = parse_iso(w[0]["start"])
    # Chicago 8 AM = India 6:30 PM is the first slot inside both people's sensible hours
    assert s.hour >= 13 and parse_iso(w[0]["end"]) <= datetime(2026, 10, 31, 17, 0, tzinfo=timezone.utc)


def test_prefers_more_people_then_windows_dont_overlap():
    members = [
        {"id": "a", "tz": "UTC", "slots": slots("UTC", ("2026-10-31", "10:00", "20:00"))},
        {"id": "b", "tz": "UTC", "slots": slots("UTC", ("2026-10-31", "15:00", "18:00"))},
        {"id": "c", "tz": "UTC", "slots": slots("UTC", ("2026-10-31", "16:00", "18:00"))},
    ]
    w = find_windows(members, "2026-10-31", "2026-10-31", 2, now=NOW)
    assert w[0]["start"] == "2026-10-31T16:00:00Z" and len(w[0]["free"]) == 3
    starts = [parse_iso(x["start"]) for x in w]
    assert all(abs((x - y).total_seconds()) >= 7200 for i, x in enumerate(starts) for y in starts[i + 1:])


def test_nobody_free_gives_nothing():
    members = [{"id": "a", "tz": "UTC", "slots": []}]
    assert find_windows(members, "2026-10-31", "2026-10-31", 1, now=NOW) == []
