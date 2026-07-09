#!/bin/bash
# stop.sh — ferma il server dashboard Hermes
# Uso:   ./stop.sh

set -euo pipefail

cd "$(dirname "$0")"

PORT=5151

# Metodo 1: kill per socket (sempre preciso)
echo "[stop] Termino processo sulla porta $PORT (fuser)..."
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1

# Se ancora vivo, forza kill
fuser -k -KILL "${PORT}/tcp" 2>/dev/null || true

# Metodo 2: kill per nome processo (fallback)
REMAINING=$(pgrep -f 'python.*app\.py' 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
    echo "[stop] Ancora in esecuzione: $REMAINING — kill forzato..."
    # shellcheck disable=SC2086
    kill -9 $REMAINING 2>/dev/null || true
fi

# Pulisce PID file se ancora presente
rm -f .dashboard.pid
echo "[stop] Fatto."
