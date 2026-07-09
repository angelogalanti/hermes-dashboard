#!/usr/bin/env python3
"""Scrape OpenCode workspace usage from opencode.ai.

Reads 2 accounts from env vars (OPENCODE_ACCOUNT{1,2}_{COOKIE,WORKSPACE}),
curls the /go page of each workspace, parses usage percentages from the
data-slot HTML attributes, and writes a JSON summary to disk.

Cache TTL: 300s (5 min). Pass --force to bypass cache.
On scrape failure the last valid data for that account is preserved.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

# ── Paths ───────────────────────────────────────────────────────────

CACHE_FILE = Path.home() / '.hermes' / 'dashboard-data' / 'opencode-usage.json'
LOG_FILE = Path.home() / '.hermes' / 'dashboard-data' / 'opencode-usage.log'
ENV_FILE = Path.home() / '.hermes' / '.env'
CACHE_TTL = 300       # 5 minuti
TIMEOUT = 15          # secondi per ogni HTTP request

# ── Account definitions ─────────────────────────────────────────────
# (display_name, cookie_env_key, workspace_env_key)

ACCOUNTS = [
    ("Account A", "OPENCODE_ACCOUNT2_COOKIE", "OPENCODE_ACCOUNT2_WORKSPACE"),
    ("Account J", "OPENCODE_ACCOUNT1_COOKIE", "OPENCODE_ACCOUNT1_WORKSPACE"),
]


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


# ── HTML Parser ─────────────────────────────────────────────────────

class UsageHTMLParser(HTMLParser):
    """Estrae coppie (data-slot name, text content) dall'HTML.

    Funziona anche con elementi annidati: se un tag child (es. <span>)
    è dentro un elemento con data-slot, ne eredita il contesto.
    """

    def __init__(self):
        super().__init__()
        self.slots: list[tuple[str, str]] = []
        self._slot_stack: list[str | None] = [None]  # root context

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        slot_name = attrs_dict.get('data-slot')
        if slot_name is not None:
            self._slot_stack.append(slot_name)
        else:
            # Eredita il contesto dal genitore
            self._slot_stack.append(self._slot_stack[-1])

    def handle_endtag(self, tag):
        if len(self._slot_stack) > 1:
            self._slot_stack.pop()

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        top = self._slot_stack[-1]
        if top is not None:
            # Accumulate text for same slot (streaming framework splits text)
            if self.slots and self.slots[-1][0] == top:
                prev_name, prev_text = self.slots[-1]
                self.slots[-1] = (prev_name, prev_text + " " + text)
            else:
                self.slots.append((top, text))


def parse_usage(html: str) -> dict:
    """Parse HTML and return usage windows.

    Groups consecutive data-slot elements into windows by cycling
    through usage-label → usage-value → reset-time.

    Returns:
        {label: {"pct": float, "resets_in": str}, ...}
    """
    parser = UsageHTMLParser()
    parser.feed(html)

    slots = parser.slots

    windows: dict = {}
    label: str | None = None
    pct_value: float = 0

    for name, text in slots:
        if name == 'usage-label':
            label = text
        elif name == 'usage-value':
            pct_str = re.sub(r'[^0-9.]', '', text)
            try:
                pct_value = round(float(pct_str), 1)
            except ValueError:
                pct_value = 0
        elif name == 'reset-time':
            if label is not None:
                windows[label] = {'pct': pct_value, 'resets_in': text}
                label = None
                pct_value = 0

    return windows


# ── Scrape ──────────────────────────────────────────────────────────

def scrape_account(cookie: str, workspace: str) -> dict | None:
    """Scrape one OpenCode /go page and return windows dict.

    Returns None on any error (HTTP, network, parse failure).
    Prints errors to stderr for cron logging.
    """
    url = f'https://opencode.ai/workspace/{workspace}/go'
    req = urllib.request.Request(url)
    req.add_header(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/131.0.0.0 Safari/537.36',
    )
    req.add_header('Cookie', f'auth={cookie}')

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            html = resp.read().decode('utf-8', errors='replace')
            _log(f'[scrape {workspace[:12]}...] HTTP {resp.status} {len(html)} bytes')
    except urllib.error.HTTPError as e:
        _log(f'[scrape {workspace[:12]}...] HTTP {e.code} {e.reason}')
        try:
            body = e.read().decode(errors='replace')[:200]
            if body:
                _log(f'[scrape] response: {body}')
        except Exception:
            pass
        return None
    except urllib.error.URLError as e:
        _log(f'[scrape {workspace[:12]}...] URLError: {e.reason}')
        return None
    except OSError as e:
        _log(f'[scrape {workspace[:12]}...] OSError: {e}')
        return None

    if not html:
        _log(f'[scrape {workspace[:12]}...] Empty response')
        return None

    windows = parse_usage(html)
    if not windows:
        _log(f'[scrape {workspace[:12]}...] No data-slot elements found in HTML')
        return None

    return {'windows': windows}


# ── Main entry ──────────────────────────────────────────────────────

def run(force: bool = False) -> dict:
    """Run scraper or return cached data.

    Args:
        force: True → ignora cache e rifà tutte le chiamate.

    Returns:
        dict con accounts + errors (e _ts per cache).
    """
    if not force:
        cached = _read_cache()
        if cached:
            _log(f'Cache HIT — returning cached data from _ts={cached.get("_ts", "?")}')
            return cached

    _log(f'run(force={force}) — starting scrape')
    env_file = _load_env()
    last_valid = _read_last_valid()

    accounts_data: list[dict] = []
    errors: list[str] = []
    used_fallback = False

    for name, cookie_key, workspace_key in ACCOUNTS:
        cookie = _get_env(cookie_key, env_file)
        workspace = _get_env(workspace_key, env_file)

        if not cookie or not workspace:
            errors.append(f'{name}: missing {cookie_key} or {workspace_key}')
            _log(f'{name}: missing {cookie_key} or {workspace_key}')
            continue

        result = scrape_account(cookie, workspace)
        if result is not None:
            accounts_data.append({'name': name, **result})
            _log(f'{name}: scraped OK — {result.get("windows", {})}')
        else:
            errors.append(f'{name}: scrape failed or no data-slot elements found')
            _log(f'{name}: scrape FAILED — using fallback if available')
            used_fallback = True
            # Fallback: keep last valid data for this account
            if last_valid:
                for acc in last_valid.get('accounts', []):
                    if acc.get('name') == name:
                        accounts_data.append(acc)
                        _log(f'{name}: fallback used — pct={acc.get("windows", {}).get("Rolling Usage", {}).get("pct", "?")}')
                        break
                else:
                    _log(f'{name}: fallback NOT found in last_valid (name mismatch?)')
            else:
                _log(f'{name}: no last_valid available')

    result: dict = {'accounts': accounts_data}

    # If all accounts failed and we have nothing at all, return last valid
    if not accounts_data and last_valid:
        _log(f'All accounts failed — returning last_valid (accounts={len(last_valid.get("accounts", []))})')
        return last_valid

    # Only write cache if ALL data is fresh (no fallback used)
    if accounts_data and not used_fallback:
        _log(f'Writing cache — {len(accounts_data)} accounts fresh')
        _write_cache(result)
    elif accounts_data and used_fallback:
        _log(f'NOT writing cache — used_fallback=True, keeping existing cache')

    return result


if __name__ == '__main__':
    force = '--force' in sys.argv
    data = run(force=force)
    print(json.dumps(data, indent=2))
