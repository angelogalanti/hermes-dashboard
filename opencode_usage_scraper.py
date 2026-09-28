#!/usr/bin/env python3
"""OpenCode Go usage via official API (stesso metodo di resetwatch/probe.py).

GET https://opencode.ai/zen/go/v1/usage with Bearer OPENCODE_GO_API_KEY.
Niente scraping, niente cookie. Output invariato per il widget dashboard:
{accounts: [{name, windows: {label: {pct, resets_in, resets_short}}]}.

Cache TTL: 300s (5 min). Pass --force to bypass cache.
On API failure the last valid data is preserved.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ───────────────────────────────────────────────────────────

CACHE_FILE = Path.home() / '.hermes' / 'dashboard-data' / 'opencode-usage.json'
LOG_FILE = Path.home() / '.hermes' / 'dashboard-data' / 'opencode-usage.log'
ENV_FILE = Path.home() / '.hermes' / '.env'
CACHE_TTL = 300       # 5 minuti
TIMEOUT = 10          # secondi per la chiamata API

API_URL = 'https://opencode.ai/zen/go/v1/usage'
ACCOUNT_NAME = 'Account A'

# Chiave API → etichetta dashboard (stesse del vecchio scrape)
WINDOWS = (
    ('rolling', '5-hour Usage'),
    ('weekly', 'Weekly Usage'),
    ('monthly', 'Monthly Usage'),
)


# ── Logger ──────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    """Append timestamped message to log file."""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, 'a') as f:
            f.write(f'{time.strftime("%Y-%m-%d %H:%M:%S")} {msg}\n')
    except OSError:
        pass


# ── Env loader ──────────────────────────────────────────────────────

def _load_env() -> dict:
    """Carica ~/.hermes/.env in un dict (solo variabili semplici)."""
    env: dict = {}
    if not ENV_FILE.is_file():
        return env
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, val = line.partition('=')
                env[key.strip()] = val.strip().strip('"\'')
    except OSError:
        pass
    return env


def _get_env(key: str, env_file: dict) -> str | None:
    """Get env var: os.environ first, then .env file."""
    return os.environ.get(key) or env_file.get(key)


# ── Cache ───────────────────────────────────────────────────────────

def _read_cache() -> dict | None:
    """Legge cache se valida (< CACHE_TTL)."""
    if not CACHE_FILE.is_file():
        return None
    try:
        with open(CACHE_FILE) as f:
            data: dict = json.load(f)
        if time.time() - data.get('_ts', 0) < CACHE_TTL:
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return None


def _write_cache(data: dict) -> None:
    """Scrive cache su disco."""
    data['_ts'] = time.time()
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def _read_last_valid() -> dict | None:
    """Legge l'ultimo dato valido (anche scaduto) per fallback."""
    if not CACHE_FILE.is_file():
        return None
    try:
        with open(CACHE_FILE) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


# ── Formattazione ───────────────────────────────────────────────────

def _fmt_resets(resets_at: str | None) -> str:
    """'2026-09-28T00:00:00.000Z' → 'Resets in 2 days 14 hours' (stile vecchio scrape)."""
    if not resets_at:
        return '—'
    try:
        dt = datetime.fromisoformat(str(resets_at).replace('Z', '+00:00'))
        delta = (dt - datetime.now(timezone.utc)).total_seconds()
        if delta <= 0:
            return 'Resets soon'
        days, rem = divmod(int(delta), 86400)
        hours, rem = divmod(rem, 3600)
        minutes = rem // 60
        if days > 0:
            return f'Resets in {days} day{"s" if days != 1 else ""} {hours} hour{"s" if hours != 1 else ""}'
        if hours > 0:
            return f'Resets in {hours} hour{"s" if hours != 1 else ""} {minutes} minute{"s" if minutes != 1 else ""}'
        return f'Resets in {minutes} minute{"s" if minutes != 1 else ""}'
    except (ValueError, TypeError):
        return '—'


def _fmt_resets_short(resets_at: str | None) -> str:
    """'2026-09-28T00:00:00.000Z' → '3h49m' / '11g5h' (compatto per badge)."""
    if not resets_at:
        return ''
    try:
        dt = datetime.fromisoformat(str(resets_at).replace('Z', '+00:00'))
        delta = (dt - datetime.now(timezone.utc)).total_seconds()
        if delta <= 0:
            return 'a breve'
        days, rem = divmod(int(delta), 86400)
        hours, rem = divmod(rem, 3600)
        minutes = rem // 60
        if days > 0:
            return f'{days}g{hours}h' if hours else f'{days}g'
        if hours > 0:
            return f'{hours}h{minutes}m' if minutes else f'{hours}h'
        return f'{minutes}m'
    except (ValueError, TypeError):
        return ''


# ── API ─────────────────────────────────────────────────────────────

def fetch_usage(api_key: str) -> dict | None:
    """GET /zen/go/v1/usage → {label: {pct, resets_in}}. None on error."""
    req = urllib.request.Request(API_URL, headers={
        'Authorization': f'Bearer {api_key}',
        'Accept': 'application/json',
        'User-Agent': 'hermes-dashboard',
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            payload = json.loads(resp.read().decode())
            _log(f'[api] HTTP {resp.status}')
    except urllib.error.HTTPError as e:
        _log(f'[api] HTTP {e.code} {e.reason}')
        return None
    except (urllib.error.URLError, OSError, json.JSONDecodeError, ValueError) as e:
        _log(f'[api] error: {e}')
        return None

    usage = payload.get('usage') if isinstance(payload, dict) else None
    if not isinstance(usage, dict):
        _log('[api] missing usage dict')
        return None

    windows: dict = {}
    for api_field, label in WINDOWS:
        item = usage.get(api_field)
        if not isinstance(item, dict):
            continue
        try:
            pct = round(float(item.get('percent', 0)), 1)
        except (TypeError, ValueError):
            continue
        windows[label] = {'pct': pct, 'resets_in': _fmt_resets(item.get('resetsAt')), 'resets_short': _fmt_resets_short(item.get('resetsAt'))}
    return windows or None


# ── Main entry ──────────────────────────────────────────────────────

def run(force: bool = False) -> dict:
    """Run fetcher or return cached data.

    Args:
        force: True → ignora cache e rifà la chiamata.

    Returns:
        dict con accounts + errors (e _ts per cache).
    """
    if not force:
        cached = _read_cache()
        if cached:
            return cached

    env_file = _load_env()
    last_valid = _read_last_valid()
    api_key = _get_env('OPENCODE_GO_API_KEY', env_file)

    errors: list[str] = []
    if not api_key:
        errors.append(f'{ACCOUNT_NAME}: missing OPENCODE_GO_API_KEY')
        _log(f'{ACCOUNT_NAME}: missing OPENCODE_GO_API_KEY')
        if last_valid:
            return last_valid
        return {'accounts': [], 'errors': errors}

    windows = fetch_usage(api_key)
    if windows is not None:
        result = {'accounts': [{'name': ACCOUNT_NAME, 'windows': windows}]}
        _write_cache(result)
        _log(f'{ACCOUNT_NAME}: api OK')
        return result

    errors.append(f'{ACCOUNT_NAME}: api failed')
    if last_valid:
        _log(f'{ACCOUNT_NAME}: api FAILED — using fallback')
        return last_valid
    return {'accounts': [], 'errors': errors}


if __name__ == '__main__':
    force = '--force' in sys.argv
    data = run(force=force)
    print(json.dumps(data, indent=2))
