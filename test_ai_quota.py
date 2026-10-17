from ai_quota import parse_claude, parse_codex, parse_opencode

assert parse_claude({
    'five_hour': {'utilization': 37.0, 'resets_at': '2026-10-01T15:00:00Z'},
    'seven_day': {'utilization': 12.5, 'resets_at': None},
    'seven_day_opus': None,
    'extra_usage': {'utilization': 1},
}) == [{'name': '5h', 'pct': 37.0, 'resets_at': 1790866800.0},
       {'name': 'weekly', 'pct': 12.5, 'resets_at': None}]

assert parse_codex({'rate_limit': {
    'primary_window': {'used_percent': 87, 'limit_window_seconds': 18000, 'reset_at': 1790881970},
    'secondary_window': {'used_percent': 42, 'limit_window_seconds': 604800, 'reset_at': 1791382748},
}}) == [{'name': '5h', 'pct': 87.0, 'resets_at': 1790881970},
        {'name': 'weekly', 'pct': 42.0, 'resets_at': 1791382748}]
assert parse_codex({}) == []

assert parse_opencode({'usage': {
    'rolling': {'percent': 5.25, 'resetsAt': '2026-10-01T15:00:00.000Z'},
    'monthly': {'percent': 60},
}}) == [{'name': '5h', 'pct': 5.2, 'resets_at': 1790866800.0},
        {'name': 'monthly', 'pct': 60.0, 'resets_at': None}]

from ai_quota import parse_ccstatusline
assert parse_ccstatusline({'sessionUsage': 0, 'weeklyUsage': 19, 'weeklyResetAt': '2026-10-01T15:00:00Z',
                           'weeklyOpusUsage': None, 'tokenHash': 'x'}) == [
    {'name': '5h', 'pct': 0.0, 'resets_at': None},
    {'name': 'weekly', 'pct': 19.0, 'resets_at': 1790866800.0}]

from ai_quota import parse_agy
assert parse_agy({'groups': [
    {'buckets': [{'bucketId': 'gemini-weekly', 'window': 'weekly', 'remainingFraction': 0.87},
                 {'bucketId': 'gemini-5h', 'window': '5h', 'resetTime': '2026-10-01T15:00:00Z', 'remainingFraction': 0.25}]},
    {'buckets': [{'bucketId': '3p-5h', 'window': '5h', 'remainingFraction': 1}]},
]}) == [{'name': '5h', 'pct': 75.0, 'resets_at': 1790866800.0},
        {'name': 'weekly', 'pct': 13.0, 'resets_at': None}]

# errore dopo un successo → ultimo dato buono marcato stale
import ai_quota as aisub
calls = iter([[{'name': '5h', 'pct': 1.0, 'resets_at': None}], RuntimeError('429')])
def fake():
    v = next(calls)
    if isinstance(v, Exception):
        raise v
    return v
aisub.PROVIDERS = {'X': fake}
aisub._save_last_ok = lambda: None  # niente scrittura su disco nel test
assert aisub.status()['providers'][0]['ok']
aisub._cache['X']['ts'] = 0
r = aisub.status()['providers'][0]
assert r['ok'] and r['windows'][0]['pct'] == 1.0 and 'RuntimeError' in r['stale']

# ── Test Refill Alert ──
mock_alerts = {}
aisub.load_alerts_state = lambda: mock_alerts
aisub.save_alerts_state = lambda s: mock_alerts.update(s)
sent_notifications = []
aisub.send_refill_notification = lambda p, pct, r: sent_notifications.append((p, pct, r))

# 1. Quota sotto soglia (84%) -> nessun alert armato
res_low = [{'provider': 'TestLow', 'ok': True, 'windows': [{'name': '5h', 'pct': 84.0, 'resets_at': 2000}]}]
alerts = aisub.check_and_arm_alerts(res_low)
assert 'TestLow' not in alerts or not alerts['TestLow'].get('armed')

# 2. Quota a soglia o sopra (95%) -> alert armato
res_high = [{'provider': 'TestHigh', 'ok': True, 'windows': [{'name': '5h', 'pct': 95.0, 'resets_at': 2000}]}]
alerts = aisub.check_and_arm_alerts(res_high)
assert alerts['TestHigh']['armed'] is True
assert alerts['TestHigh']['peak_pct'] == 95.0
assert alerts['TestHigh']['resets_at'] == 2000

# 3. Prima del reset time -> nessun alert inviato
real_time = aisub.time.time
mock_time = 1999
aisub.time.time = lambda: mock_time
aisub.process_refill_alerts()
assert len(sent_notifications) == 0
assert mock_alerts['TestHigh']['armed'] is True

# 4. Al reset time o dopo -> notifica inviata e alert disarmato
mock_time = 2001
aisub.process_refill_alerts()
assert len(sent_notifications) == 1
assert sent_notifications[0][0] == 'TestHigh'
assert sent_notifications[0][1] == 95.0
assert mock_alerts['TestHigh']['armed'] is False

# 5. Esecuzione successiva -> nessuna notifica duplicata
aisub.process_refill_alerts()
assert len(sent_notifications) == 1
aisub.time.time = real_time

print('ok')
