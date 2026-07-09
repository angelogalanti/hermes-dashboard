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

# Avvia Flask in background e salva il PID reale
# (non usiamo exec perche' systemd deve poter leggere il PID vero)
python3 app.py "$@" &
FLAKS_PID=$!
echo "$FLAKS_PID" > .dashboard.pid

# Forward dei segnali systemd (SIGTERM/SIGINT) a Flask
cleanup() {
    echo "[run] Ricevuto segnale, termino Flask (PID $FLAKS_PID)..."
    kill "$FLAKS_PID" 2>/dev/null || true
    wait "$FLAKS_PID" 2>/dev/null || true
    rm -f .dashboard.pid
    echo "[run] Flask terminato."
}
trap cleanup SIGTERM SIGINT

# Resta in attesa — se Flask muore, lo script esce con il suo codice
wait "$FLAKS_PID"
FLAKS_EXIT=$?

# Se Flask esce da solo (non per nostro segnale), pulisci PID file
rm -f .dashboard.pid
exit "$FLAKS_EXIT"
