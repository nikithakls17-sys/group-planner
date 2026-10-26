"""Google Calendar free/busy through Auth0 Token Vault. Off until the Auth0 keys are set.

Flow: the person signs in with Google through Auth0, asking Google for calendar.freebusy only. Auth0 keeps the Google
token in Token Vault; we swap our Auth0 refresh token for a Google access token, ask Google's freeBusy API when the
person is busy (never what the events are), turn that into free times, then revoke the refresh token. Nothing from
Google is stored except the free times the person then checks and saves."""
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx

from . import config
from .observability import tool_span

SCOPE = "https://www.googleapis.com/auth/calendar.freebusy"
CONNECTION = "google-oauth2"
DAY_FROM, DAY_TO = 8, 23  # local hours we'd ever plan in
MIN_FREE = timedelta(hours=1)


def ready() -> bool:
    return bool(config.AUTH0_DOMAIN and config.AUTH0_CLIENT_ID and config.AUTH0_CLIENT_SECRET)


def _base() -> str:
    d = config.AUTH0_DOMAIN.removeprefix("https://").rstrip("/")
    return f"https://{d}"


def _sign(data: bytes) -> str:
    return hmac.new(config.AUTH0_CLIENT_SECRET.encode(), data, hashlib.sha256).hexdigest()[:32]


def make_state(**fields) -> str:
    raw = base64.urlsafe_b64encode(json.dumps({**fields, "t": int(time.time())}).encode()).decode()
    return f"{raw}.{_sign(raw.encode())}"


def read_state(state: str, max_age: int = 900) -> dict | None:
    raw, _, sig = state.partition(".")
    if not hmac.compare_digest(sig, _sign(raw.encode())):
        return None
    data = json.loads(base64.urlsafe_b64decode(raw))
    return data if time.time() - data["t"] <= max_age else None


def authorize_url(redirect_uri: str, state: str) -> str:
    return f"{_base()}/authorize?" + urlencode({
        "response_type": "code", "client_id": config.AUTH0_CLIENT_ID, "redirect_uri": redirect_uri,
        "scope": "openid offline_access", "connection": CONNECTION, "connection_scope": SCOPE,
        "access_type": "offline", "prompt": "login", "state": state,
    })


def _token(**form) -> dict:
    r = httpx.post(f"{_base()}/oauth/token", data={"client_id": config.AUTH0_CLIENT_ID,
                                                   "client_secret": config.AUTH0_CLIENT_SECRET, **form}, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"auth0 {form.get('grant_type', '')[-40:]}: {r.status_code} {r.text[:200]}")
    return r.json()


def google_token(code: str, redirect_uri: str) -> tuple[str, str]:
    """Auth code -> Auth0 refresh token -> Google access token from Token Vault."""
    tok = _token(grant_type="authorization_code", code=code, redirect_uri=redirect_uri)
    refresh = tok.get("refresh_token")
    if not refresh:
        raise RuntimeError("no refresh token (is Refresh Token grant on and offline_access allowed?)")
    with tool_span("auth0_token_vault", CONNECTION):
        g = _token(grant_type="urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
                   subject_token_type="urn:ietf:params:oauth:token-type:refresh_token", subject_token=refresh,
                   requested_token_type="http://auth0.com/oauth/token-type/federated-connection-access-token",
                   connection=CONNECTION)
    return g["access_token"], refresh


def revoke(refresh: str) -> None:
    try:
        httpx.post(f"{_base()}/oauth/revoke", json={"client_id": config.AUTH0_CLIENT_ID,
                                                   "client_secret": config.AUTH0_CLIENT_SECRET, "token": refresh}, timeout=10)
    except httpx.HTTPError:
        pass


def busy(access_token: str, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    with tool_span("google_freebusy", f"{start.date()}..{end.date()}"):
        r = httpx.post("https://www.googleapis.com/calendar/v3/freeBusy", headers={"Authorization": f"Bearer {access_token}"},
                       json={"timeMin": start.isoformat(), "timeMax": end.isoformat(), "items": [{"id": "primary"}]}, timeout=20)
    r.raise_for_status()
    cal = r.json()["calendars"]["primary"]
    if cal.get("errors"):
        raise RuntimeError(f"freebusy: {cal['errors']}")
    return [(datetime.fromisoformat(b["start"].replace("Z", "+00:00")), datetime.fromisoformat(b["end"].replace("Z", "+00:00")))
            for b in cal.get("busy", [])]


def free_slots(days: list[str], tz: str, busy_: list[tuple[datetime, datetime]], now: datetime | None = None) -> list[dict]:
    """Each day's 8:00-23:00 (local) minus busy times, keeping gaps of an hour or more, as ISO UTC slots."""
    zone = ZoneInfo(tz or "UTC")
    out = []
    for day in sorted(set(days)):
        d = datetime.fromisoformat(day)
        cur = d.replace(hour=DAY_FROM, tzinfo=zone)
        end = d.replace(hour=DAY_TO, tzinfo=zone)
        if now and now > cur:
            cur = min(end, now.astimezone(zone))
        for b0, b1 in sorted(busy_):
            if b1 <= cur or b0 >= end:
                continue
            if b0 - cur >= MIN_FREE:
                out.append((cur, b0))
            cur = max(cur, b1)
        if end - cur >= MIN_FREE:
            out.append((cur, end))
    return [{"start": a.astimezone(ZoneInfo("UTC")).isoformat(), "end": b.astimezone(ZoneInfo("UTC")).isoformat()} for a, b in out]


def day_range(days: list[str], tz: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(tz or "UTC")
    first, last = min(days), max(days)
    return (datetime.fromisoformat(first).replace(tzinfo=zone),
            datetime.fromisoformat(last).replace(tzinfo=zone) + timedelta(days=1))
