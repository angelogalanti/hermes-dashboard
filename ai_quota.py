"""AI quote — 5h/weekly di Claude Code, Codex, OpenCode Go e AGY (Gemini).

Legge i token locali delle CLI e interroga gli endpoint (non documentati) delle quote.
Cache 5 min per provider; su errore resta l'ultimo dato buono (marcato `stale`),
persistito su disco così sopravvive ai riavvii della dashboard.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

HOME = Path.home()
CACHE_FILE = HOME / '.hermes' / 'dashboard-data' / 'ai-quota.json'
CACHE_TTL = 300  # 5 min: le finestre 5h non cambiano utilmente al minuto; Claude risponde 429 se più fitto
TIMEOUT = 10


def _get(url, headers, body=None):  # body → POST form/JSON già codificato
    req = urllib.request.Request(url, data=body, headers={'Accept': 'application/json', **headers})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def _iso_to_epoch(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() if s else None


def _win(name, pct, resets_at):
    return {'name': name, 'pct': round(float(pct), 1), 'resets_at': resets_at}


# ── Parser (puri, testati in test_aisub.py) ─────────────────────────

CLAUDE_LABELS = {'five_hour': '5h', 'seven_day': 'weekly',
                 'seven_day_opus': 'weekly opus', 'seven_day_sonnet': 'weekly sonnet'}


def parse_claude(body):
    return [_win(CLAUDE_LABELS.get(k, k), v['utilization'], _iso_to_epoch(v.get('resets_at')))
            for k, v in body.items()
            if isinstance(v, dict) and v.get('utilization') is not None and k != 'extra_usage']


def parse_codex(body):
    out = []
    for key in ('primary_window', 'secondary_window'):
        w = (body.get('rate_limit') or {}).get(key)
        if not w or w.get('used_percent') is None:
            continue
        secs = w.get('limit_window_seconds') or 0
        name = '5h' if secs <= 6 * 3600 else 'weekly' if secs <= 7 * 86400 else f'{secs // 86400}d'
        out.append(_win(name, w['used_percent'], w.get('reset_at')))
    return out


def parse_opencode(body):
    usage = body.get('usage') or {}
    return [_win(label, usage[k]['percent'], _iso_to_epoch(usage[k].get('resetsAt')))
            for k, label in (('rolling', '5h'), ('weekly', 'weekly'), ('monthly', 'monthly'))
            if isinstance(usage.get(k), dict) and usage[k].get('percent') is not None]


# ── Fetcher ─────────────────────────────────────────────────────────

CCSTATUS_FIELDS = (('session', '5h'), ('weekly', 'weekly'),
                   ('weeklyOpus', 'weekly opus'), ('weeklySonnet', 'weekly sonnet'))


def parse_ccstatusline(d):
    return [_win(label, d[f + 'Usage'], _iso_to_epoch(d.get(f + 'ResetAt')))
            for f, label in CCSTATUS_FIELDS if d.get(f + 'Usage') is not None]


def fetch_claude():
    # ccstatusline (statusline) interroga lo stesso endpoint: ne riusiamo cache e backoff
    # per non sommare chiamate sullo stesso token. Freschezza = mtime di usage.json.
    cc = HOME / '.cache/ccstatusline'
    try:
        age = time.time() - (cc / 'usage.json').stat().st_mtime
        d = json.loads((cc / 'usage.json').read_text())
        if age < CACHE_TTL and not d.get('error'):
            return {'windows': parse_ccstatusline(d), 'at': (cc / 'usage.json').stat().st_mtime}
    except (OSError, ValueError):
        pass
    try:
        blocked = json.loads((cc / 'usage.lock').read_text()).get('blockedUntil', 0)
    except (OSError, ValueError):
        blocked = 0
    if blocked > time.time():
        raise RuntimeError(f'rate limit, ccstatusline in backoff fino alle {time.strftime("%H:%M", time.localtime(blocked))}')
    oauth = json.loads((HOME / '.claude/.credentials.json').read_text())['claudeAiOauth']
    if oauth.get('expiresAt', 0) / 1000 < time.time():
        raise RuntimeError('token scaduto: apri Claude Code per rinnovarlo')
    return parse_claude(_get('https://api.anthropic.com/api/oauth/usage', {
        'Authorization': f"Bearer {oauth['accessToken']}", 'anthropic-beta': 'oauth-2025-04-20'}))


def fetch_codex():
    tok = json.loads((HOME / '.codex/auth.json').read_text())['tokens']
    headers = {'Authorization': f"Bearer {tok['access_token']}", 'User-Agent': 'codex-cli'}
    if tok.get('account_id'):
        headers['ChatGPT-Account-Id'] = tok['account_id']
    return parse_codex(_get('https://chatgpt.com/backend-api/wham/usage', headers))


def _env(key):
    """Variabile da os.environ, altrimenti da ~/.hermes/.env (fuori dal repo: niente segreti nel codice)."""
    if os.environ.get(key):
        return os.environ[key]
    env = HOME / '.hermes/.env'
    for line in env.read_text().splitlines() if env.is_file() else []:
        k, _, v = line.partition('=')
        if k.strip() == key:
            return v.strip().strip('"\'')
    raise RuntimeError(f'{key} mancante (env o ~/.hermes/.env)')


def fetch_opencode():
    return parse_opencode(_get('https://opencode.ai/zen/go/v1/usage', {
        'Authorization': f"Bearer {_env('OPENCODE_GO_API_KEY')}", 'User-Agent': 'aisub'}))


# Antigravity (agy): stesso flusso di Antigravity-Manager (src-tauri/src/modules/quota.rs).
# Refresh token: serve il client OAuth dell'app Antigravity (lo stesso che ha emesso il token di agy),
# letto da AGY_OAUTH_CLIENT_ID / AGY_OAUTH_CLIENT_SECRET in ~/.hermes/.env.
AGY_UA = 'antigravity/hub/2.17.0 (aidev_client; os_type=linux; arch=amd64; cl=986210228)'
AGY_HOSTS = ('daily-cloudcode-pa.googleapis.com', 'cloudcode-pa.googleapis.com')
_agy_token = {'access': None, 'exp': 0}


def parse_agy(body):
    # solo il gruppo Gemini: il gruppo '3p' (Claude/GPT dentro AGY) non interessa
    b = {x.get('window'): x for g in body.get('groups') or [] for x in g.get('buckets') or []
         if x.get('bucketId', '').startswith('gemini-') and x.get('remainingFraction') is not None}
    return [_win(w, (1 - b[w]['remainingFraction']) * 100, _iso_to_epoch(b[w].get('resetTime')))
            for w in ('5h', 'weekly') if w in b]


def _agy_access_token():
    tok = json.loads((HOME / '.gemini/antigravity-cli/antigravity-oauth-token').read_text())['token']
    exp = datetime.fromisoformat(tok['expiry']).timestamp()
    if exp - 60 > time.time():
        return tok['access_token']
    if _agy_token['exp'] - 60 > time.time():
        return _agy_token['access']
    # refresh solo in memoria: il file di agy resta suo, Google non invalida il refresh_token
    r = _get('https://oauth2.googleapis.com/token', {'Content-Type': 'application/x-www-form-urlencoded'},
             urllib.parse.urlencode({'client_id': _env('AGY_OAUTH_CLIENT_ID'),
                                     'client_secret': _env('AGY_OAUTH_CLIENT_SECRET'),
                                     'refresh_token': tok['refresh_token'],
                                     'grant_type': 'refresh_token'}).encode())
    _agy_token.update(access=r['access_token'], exp=time.time() + r.get('expires_in', 3600))
    return r['access_token']


def fetch_agy():
    headers = {'Authorization': f'Bearer {_agy_access_token()}', 'Content-Type': 'application/json',
               'User-Agent': AGY_UA}
    err = None
    for host in AGY_HOSTS:  # daily prima, prod come fallback (come Antigravity-Manager)
        try:
            lca = _get(f'https://{host}/v1internal:loadCodeAssist', headers,
                       json.dumps({'metadata': {'ideType': 'ANTIGRAVITY'}}).encode())
            pid = lca.get('cloudaicompanionProject')
            q = _get(f'https://{host}/v1internal:retrieveUserQuotaSummary', headers,
                     json.dumps({'project': pid} if pid else {}).encode())
            plan = (lca.get('paidTier') or lca.get('currentTier') or {}).get('name')
            return {'windows': parse_agy(q), 'plan': plan}
        except urllib.error.HTTPError as e:
            err = e
    raise err


PROVIDERS = {'Claude Code': fetch_claude, 'Codex': fetch_codex, 'OpenCode Go': fetch_opencode, 'AGY': fetch_agy}
_cache = {}  # nome → {'ts', 'result', 'last_ok'}


def _load_last_ok():
    try:
        return json.loads(CACHE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def _save_last_ok():
    try:
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps({n: c['last_ok'] for n, c in _cache.items() if c['last_ok']}))
    except OSError:
        pass


_disk = _load_last_ok()


def _fetch(name, fn):
    try:
        r = fn()  # lista di finestre, oppure {'windows', 'at'?, 'plan'?}
        return {'provider': name, 'ok': True, 'at': time.time(), **(r if isinstance(r, dict) else {'windows': r})}
    except urllib.error.HTTPError as e:
        hint = ' (rifai login nella CLI)' if e.code in (401, 403) else ' (rate limit)' if e.code == 429 else ''
        return {'provider': name, 'ok': False, 'error': f'HTTP {e.code}{hint}'}
    except Exception as e:
        return {'provider': name, 'ok': False, 'error': f'{type(e).__name__}: {e}'}


def _run(name, force):
    fn = PROVIDERS[name]
    c = _cache.setdefault(name, {'ts': 0, 'result': None, 'last_ok': _disk.get(name)})
    if time.time() - c['ts'] > (60 if force else CACHE_TTL):  # "Aggiorna" non scende sotto 60s
        r = _fetch(name, fn)
        c['ts'] = time.time()
        if r['ok']:
            c['last_ok'] = r
        elif c['last_ok']:  # errore: mostra l'ultimo dato buono, marcato come stale
            r = {**c['last_ok'], 'stale': r['error']}
        c['result'] = r
    return c['result']


def status(force=False):
    with ThreadPoolExecutor() as ex:
        results = list(ex.map(lambda n: _run(n, force), PROVIDERS))
    _save_last_ok()
    return {'providers': results}  # niente timestamp globale: l'ETag cambia solo se cambiano i dati
