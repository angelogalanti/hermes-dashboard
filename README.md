# Hermes Dashboard

Dashboard web per monitorare la propria istanza Hermes: profili, gateway, modelli e task kanban.

## Obiettivo

Vedere in un'unica interfaccia:
- Elenco profili creati
- Per ogni profilo: stato gateway, modello e provider di default
- Task del kanban board
- Quote AI 5h/weekly di Claude Code, Codex, OpenCode Go e AGY (Gemini)

## Stack

- Backend: Flask (Python 3) su `0.0.0.0:5151`
- Frontend: HTML + JS vanilla, tema scuro GitHub-style
- Database: SQLite (`~/.hermes/kanban.db`)

## Avvio

```bash
cd ~/repos/hermes-dashboard
./run.sh
```

Il server parte su **http://0.0.0.0:5151** (locale + rete locale).

Opzioni:
- `./run.sh --no-reload` — disabilita l'auto-reload del debugger Flask

## Fermata

```bash
cd ~/repos/hermes-dashboard
./stop.sh
```

Oppure `Ctrl+C` se il server è in primo piano.

## Avvio automatico (systemd user)

Il file `.service` è già installato in `~/.config/systemd/user/hermes-dashboard.service`.

```bash
# Abilita all'avvio del login
systemctl --user enable hermes-dashboard

# Avvia subito
systemctl --user start hermes-dashboard

# Stato
systemctl --user status hermes-dashboard

# Log
journalctl --user -u hermes-dashboard -f
```

Per disabilitare:

```bash
systemctl --user stop hermes-dashboard
systemctl --user disable hermes-dashboard
```

## Endpoint API

| Percorso       | Descrizione                              |
|----------------|------------------------------------------|
| `GET /`        | Pagina dashboard HTML                    |
| `GET /api/status` | JSON: profili + task kanban          |
| `GET /api/ai-quota` | JSON: quote 5h/weekly per provider (`?force=1` ignora la cache) |

## Quote AI

Il pannello "AI quote" legge i token che le CLI salvano in locale e interroga
gli endpoint (non documentati) delle quote, con cache di 5 minuti per provider.
Se un provider fallisce mostra l'ultimo dato buono (`~/.hermes/dashboard-data/ai-quota.json`).

| Provider | Credenziali usate |
|----------|-------------------|
| Claude Code | `~/.claude/.credentials.json` (riusa la cache di ccstatusline se recente) |
| Codex | `~/.codex/auth.json` |
| OpenCode Go | `OPENCODE_GO_API_KEY` in `~/.hermes/.env` |
| AGY | `~/.gemini/antigravity-cli/antigravity-oauth-token` + `AGY_OAUTH_CLIENT_ID` / `AGY_OAUTH_CLIENT_SECRET` in `~/.hermes/.env` (client OAuth dell'app Antigravity, serve per il refresh del token) |

Test: `venv/bin/python test_ai_quota.py` e `node test_quota_pace.mjs`.

## Verifica

```bash
curl http://localhost:5151/api/status
```

Risposta attesa: JSON con array `profiles` e `kanban`.
