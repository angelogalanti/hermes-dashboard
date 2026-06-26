#!/bin/bash
# run.sh — avvia il server dashboard Hermes
# Uso:   ./run.sh
#        ./run.sh --no-reload   (disabilita auto-reload su modifiche)

set -euo pipefail

cd "$(dirname "$0")"

# ── Attiva virtualenv se esiste, altrimenti installa dipendenze ──
if [ -d venv ]; then
    echo "[run] Attivazione virtualenv..."
    # shellcheck disable=SC1091
    source venv/bin/activate
else
    echo "[run] Nessun virtualenv trovato. Installazione dipendenze..."
    python3 -m venv venv
    # shellcheck disable=SC1091
    source venv/bin/activate
fi

echo "[run] Installazione/aggiornamento dipendenze..."
pip install -r requirements.txt -q

# ── Avvio server ──
HOST="0.0.0.0"
PORT=5151

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Hermes Dashboard                          ║"
echo "║   http://localhost:${PORT}                      ║"
echo "║   http://${HOST}:${PORT}  (rete locale)        ║"
echo "║                                              ║"
echo "║   Premi Ctrl+C per fermare                   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Salva il PID per stop.sh
echo $$ > .dashboard.pid

# Se --no-reload, rimuovi debug=True
if [ "${1:-}" = "--no-reload" ]; then
    exec python3 app.py --no-reload
else
    exec python3 app.py
fi
