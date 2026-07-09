#!/usr/bin/env python3
"""Check API credit usage for Tavily and Exa.

Integrates with Hermes dashboard — same cache pattern as health_check.py.
Output: dict with per-service usage info and TTL cache at ~/.hermes/dashboard-credits.json.
"""

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

ENV_FILE = Path.home() / '.hermes' / '.env'
CACHE_FILE = Path.home() / '.hermes' / 'dashboard-credits.json'
CACHE_TTL = 600  # 10 minuti
TIMEOUT = 10     # secondi


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


# ── Env helper ──────────────────────────────────────────────────────

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


# ── Tavily ──────────────────────────────────────────────────────────

def check_tavily(api_key: str) -> dict:
    """GET api.tavily.com/usage → usage/limit/percentage.

    La risposta ha sia `key` (per-key) che `account` (piano).
    Usiamo account.plan_usage / account.plan_limit per la percentuale,
    perché key.limit è spesso null sui piani Researcher.
    """
    url = 'https://api.tavily.com/usage'
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Bearer {api_key}')

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data: dict = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode(errors='replace')[:200]
        except Exception:
            pass
        return {'status': 'error', 'error': f'HTTP {e.code} {detail}'.strip()}
    except urllib.error.URLError as e:
        return {'status': 'error', 'error': f'Connection: {e.reason}'}
    except (OSError, json.JSONDecodeError) as e:
        return {'status': 'error', 'error': str(e)}

    account = data.get('account', {})
    plan_usage = account.get('plan_usage', 0)
    plan_limit = account.get('plan_limit')
    key_info = data.get('key', {})

    if plan_limit and plan_limit > 0:
        percentage = round(plan_usage / plan_limit * 100, 1)
    else:
        percentage = None  # nessun limite definito

    return {
        'status': 'ok',
        'usage': plan_usage,
        'limit': plan_limit,
        'percentage': percentage,
        'search_usage': key_info.get('search_usage', 0),
        'crawl_usage': key_info.get('crawl_usage', 0),
        'extract_usage': key_info.get('extract_usage', 0),
        'plan': account.get('current_plan', 'unknown'),
    }


# ── Exa ─────────────────────────────────────────────────────────────

def check_exa(api_key: str) -> dict:
    """Prova a chiamare l'endpoint admin di Exa per l'usage.

    Endpoint reale (docs.exa.ai): GET admin-api.exa.ai/team-management/api-keys/
    ma richiede un team-admin key, non una search key normale.
    Se fallisce con 401 → 'unauthorized'; se 404 → 'error'.
    """
    url = f'https://admin-api.exa.ai/team-management/api-keys'
    req = urllib.request.Request(url)
    req.add_header('x-api-key', api_key)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            keys_data: list = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {
                'status': 'unauthorized',
                'error': 'API key non autorizzata per team-management (search key ≠ admin key)',
            }
        detail = ''
        try:
            detail = e.read().decode(errors='replace')[:200]
        except Exception:
            pass
        return {'status': 'error', 'error': f'HTTP {e.code} {detail}'.strip()}
    except urllib.error.URLError as e:
        return {'status': 'error', 'error': f'Connection: {e.reason}'}
    except (OSError, json.JSONDecodeError) as e:
        return {'status': 'error', 'error': str(e)}

    # Se abbiamo accesso, prendi il primo api key id e chiama usage
    if isinstance(keys_data, list) and len(keys_data) > 0:
        first_key = keys_data[0] if isinstance(keys_data[0], dict) else {}
        api_key_id = first_key.get('id') or first_key.get('api_key_id')
        if api_key_id:
            return _check_exa_usage(api_key, api_key_id)

    return {'status': 'ok', 'usage': None, 'limit': None, 'percentage': None}


def _check_exa_usage(api_key: str, api_key_id: str) -> dict:
    """Chiama l'endpoint usage di Exa con un api_key_id valido."""
    url = f'https://admin-api.exa.ai/team-management/api-keys/{api_key_id}/usage'
    req = urllib.request.Request(url)
    req.add_header('x-api-key', api_key)

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            usage_data: dict = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode(errors='replace')[:200]
        except Exception:
            pass
        return {'status': 'error', 'error': f'HTTP {e.code} {detail}'.strip()}
    except (OSError, json.JSONDecodeError) as e:
        return {'status': 'error', 'error': str(e)}

    total_cost = usage_data.get('total_cost_usd', 0)
    # Exa non ha un "limite" nel senso classico, è pagamento per uso
    return {
        'status': 'ok',
        'usage': total_cost,
        'limit': None,
        'percentage': None,
        'cost_breakdown': usage_data.get('cost_breakdown', []),
    }


# ── Main ────────────────────────────────────────────────────────────

def run(force: bool = False) -> dict:
    """Esegue credit-check API o torna cache.

    Args:
        force: True → ignora cache e rifà tutte le chiamate.

    Returns:
        dict con:
            services: {tavily: {...}, exa: {...}}
            errors: [str, ...]
    """
    if not force:
        cached = _read_cache()
        if cached:
            return cached

    env = _load_env()
    result: dict = {
        'services': {},
    }

    # ── Tavily ──
    tavily_key = env.get('TAVILY_API_KEY')
    if tavily_key:
        result['services']['tavily'] = check_tavily(tavily_key)
    else:
        result['services']['tavily'] = {'status': 'unconfigured'}

    # ── Exa ──
    exa_key = env.get('EXA_API_KEY')
    if exa_key:
        result['services']['exa'] = check_exa(exa_key)
    else:
        result['services']['exa'] = {'status': 'unconfigured'}

    _write_cache(result)
    return result


if __name__ == '__main__':
    import sys
    force = '--force' in sys.argv
    print(json.dumps(run(force=force), indent=2))
