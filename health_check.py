#!/usr/bin/env python3
"""Health-check per provider dei profili Hermes. Integrato nella dashboard.

Legge i profili da ~/.hermes/profiles/, raggruppa per (provider, base_url),
testa ogni endpoint unico con timeout 10s, cache risultati 5 minuti.

Output: dict con provider raggruppati e health per profilo.
"""

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml

PROFILES_DIR = Path.home() / '.hermes' / 'profiles'
CACHE_FILE = Path.home() / '.hermes' / 'dashboard-health.json'
CACHE_TTL = 300  # secondi (5 minuti)
TIMEOUT = 10     # secondi per curl


# ── Helpers ───────────────────────────────────────────────────

def _read_cache() -> dict | None:
    """Legge cache se valida (< CACHE_TTL)."""
    if not CACHE_FILE.is_file():
        return None
    try:
        with open(CACHE_FILE) as f:
            data: dict = json.load(f)
        age = time.time() - data.get('_ts', 0)
        if age < CACHE_TTL:
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


def _get_auth_token(profile_name: str, provider_name: str) -> str | None:
    """Cerca API key in auth.json del profilo."""
    auth_path = PROFILES_DIR / profile_name / 'auth.json'
    if not auth_path.is_file():
        return None
    try:
        with open(auth_path) as f:
            data: dict = json.load(f)
        pool = data.get('credential_pool', {})
        for cred in pool.get(provider_name, []):
            token = cred.get('access_token')
            if token:
                return token
    except (OSError, json.JSONDecodeError):
        pass
    return None


# ── Test endpoint ─────────────────────────────────────────────

def _test_endpoint(
    provider: str, base_url: str, model: str, api_key: str | None,
) -> tuple[bool, float, str | None]:
    """Testa un endpoint HTTP. Ritorna (ok, latency_sec, error_msg)."""
    start = time.time()

    try:
        if provider == 'gemini':
            # Google Gemini usa key nel query param
            url = f"{base_url.rstrip('/')}/models/{model}:generateContent"
            if api_key:
                url += f"?key={api_key}"
            body = json.dumps({
                "contents": [{"parts": [{"text": "OK"}]}],
            }).encode()
            req = urllib.request.Request(url, data=body, method='POST')
            req.add_header('Content-Type', 'application/json')
        else:
            # OpenAI-compatible (opencode-go, nvidia, openrouter, ollama…)
            url = f"{base_url.rstrip('/')}/chat/completions"
            body = json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": "Say OK."}],
                "max_tokens": 10,
            }).encode()
            req = urllib.request.Request(url, data=body, method='POST')
            req.add_header('Content-Type', 'application/json')
            if api_key:
                req.add_header('Authorization', f'Bearer {api_key}')

        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            latency = time.time() - start
            ok = 200 <= resp.status < 500  # qualunque risposta = endpoint vivo
            error = None if ok else f"HTTP {resp.status}"
            return (ok, round(latency, 2), error)

    except urllib.error.HTTPError as e:
        latency = time.time() - start
        # 401/403 = endpoint vivo, auth fallita → OK per noi (endpoint c'è)
        if e.code in (401, 403):
            return (True, round(latency, 2), f"HTTP {e.code}")
        detail = ""
        try:
            detail = e.read().decode(errors='replace')[:120]
        except Exception:
            pass
        msg = f"HTTP {e.code}" + (f" {detail}" if detail else "")
        return (False, round(latency, 2), msg)

    except urllib.error.URLError as e:
        latency = time.time() - start
        return (False, round(latency, 2), f"Connection: {e.reason}")

    except TimeoutError:
        latency = time.time() - start
        return (False, round(latency, 2), "Timeout")

    except Exception as e:
        latency = time.time() - start
        return (False, round(latency, 2), str(e))


# ── Raccolta profili ──────────────────────────────────────────

def _collect_profiles() -> dict[str, dict]:
    """Legge config.yaml di ogni profilo, torna {name: model_block}.
    Include anche il profilo virtuale 'default' da ~/.hermes/config.yaml.
    """
    profiles: dict[str, dict] = {}

    # Profilo virtuale default (da root config)
    root_cfg = Path.home() / '.hermes' / 'config.yaml'
    if root_cfg.is_file():
        with open(root_cfg) as f:
            cfg: dict = yaml.safe_load(f) or {}
        mc = cfg.get('model')
        if isinstance(mc, dict) and mc.get('default'):
            profiles['default'] = mc

    # Profili reali da ~/.hermes/profiles/
    if PROFILES_DIR.is_dir():
        for entry in sorted(PROFILES_DIR.iterdir()):
            config_path = entry / 'config.yaml'
            if not entry.is_dir() or not config_path.is_file():
                continue
            with open(config_path) as f:
                cfg: dict = yaml.safe_load(f) or {}
            mc = cfg.get('model')
            if isinstance(mc, dict) and mc.get('default'):
                profiles[entry.name] = mc

    return profiles


def _group_by_provider(
    profiles: dict[str, dict],
) -> dict[tuple, dict]:
    """Raggruppa profili per (provider, base_url)."""
    groups: dict[tuple, dict] = {}
    for pname, mc in profiles.items():
        provider = mc.get('provider', '')
        base_url = mc.get('base_url', '').rstrip('/')
        model = mc.get('default', '')
        key = (provider, base_url)

        if key not in groups:
            groups[key] = {
                'model': model,
                'profiles': [],
                'api_key': None,
            }
        groups[key]['profiles'].append(pname)

        # Prende la prima API key trovata
        if not groups[key]['api_key']:
            groups[key]['api_key'] = _get_auth_token(pname, provider)

    return groups


# ── Main ──────────────────────────────────────────────────────

def run(force: bool = False) -> dict:
    """Esegue health-check o torna cache.

    Args:
        force: True → ignora cache e rifà i test.

    Returns:
        dict con chiavi:
            providers: {key: {ok, latency, error, model, profiles}}
            profiles:  {profile_name: "ok"|"error"|"unknown"}
    """
    if not force:
        cached = _read_cache()
        if cached:
            return cached

    profiles = _collect_profiles()
    groups = _group_by_provider(profiles)

    out_providers: dict = {}
    out_profiles: dict = {}

    for (provider, base_url), info in groups.items():
        key = f"{provider}:{base_url}"
        ok, latency, error = _test_endpoint(
            provider, base_url, info['model'], info['api_key'],
        )
        out_providers[key] = {
            'ok': ok,
            'latency': latency,
            'error': error,
            'model': info['model'],
            'profiles': info['profiles'],
        }
        for pname in info['profiles']:
            out_profiles[pname] = 'ok' if ok else 'error'

    # Profili non coperti (es. nessun provider testato)
    for pname in profiles:
        if pname not in out_profiles:
            out_profiles[pname] = 'unknown'

    result = {
        'providers': out_providers,
        'profiles': out_profiles,
    }
    _write_cache(result)
    return result
