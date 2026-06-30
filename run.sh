#!/bin/bash
# run.sh — avvia il server trading dashboard (Next.js)
# Uso:   ./run.sh

set -euo pipefail

cd "$(dirname "$0")"

# ── Installazione dipendenze se mancanti ──
if [ ! -d node_modules ]; then
    echo "[run] node_modules non trovato. Eseguo npm ci..."
    npm ci
fi

# ── Build se mancante ──
if [ ! -d .next ]; then
    echo "[run] Build Next.js non trovata. Eseguo next build..."
    npx next build
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Trading Dashboard                          ║"
echo "║   http://localhost:5152                      ║"
echo "║                                              ║"
echo "║   systemctl --user stop dashboard-trading    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Salva il PID per stop.sh
echo $$ > .dashboard.pid

exec npx next start -p 5152
