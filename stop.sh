#!/bin/bash
# stop.sh — ferma il server trading dashboard (Next.js)
# Uso:   ./stop.sh

set -euo pipefail

cd "$(dirname "$0")"
PID_FILE=".dashboard.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "[stop] Fermo processo PID $PID ..."
        kill "$PID"
        # Attende fino a 5 secondi che termini
        for _ in $(seq 1 5); do
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
            sleep 1
        done
        # Se ancora vivo, forza kill
        if kill -0 "$PID" 2>/dev/null; then
            echo "[stop] Processo non risponde, kill -9 ..."
            kill -9 "$PID" 2>/dev/null || true
        fi
    else
        echo "[stop] Nessun processo con PID $PID in esecuzione."
    fi
    rm -f "$PID_FILE"
else
    echo "[stop] Nessun PID file trovato. Cerco processo 'next start' in esecuzione..."
    PIDS=$(pgrep -f "next.*start" || true)
    if [ -n "$PIDS" ]; then
        echo "[stop] Trovati PID: $PIDS — li termino tutti."
        # shellcheck disable=SC2086
        kill $PIDS 2>/dev/null || true
        sleep 1
        # shellcheck disable=SC2086
        kill -9 $PIDS 2>/dev/null || true
        echo "[stop] Fatto."
    else
        echo "[stop] Nessun processo trading dashboard trovato."
    fi
fi
