#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-all}"
BACKEND_PORT="${TECTON_BACKEND_PORT:-8000}"
FRONTEND_PORT="${TECTON_FRONTEND_PORT:-4173}"

if [[ -x "$PROJECT_ROOT/.venv/bin/python" ]]; then
  BACKEND_PYTHON="$PROJECT_ROOT/.venv/bin/python"
else
  BACKEND_PYTHON="${TECTON_PYTHON_BIN:-python3}"
fi

run_backend() {
  cd "$PROJECT_ROOT"
  if ! "$BACKEND_PYTHON" -c "import uvicorn" >/dev/null 2>&1; then
    echo "Backend dependencies are missing. Run: npm run setup" >&2
    exit 1
  fi
  exec "$BACKEND_PYTHON" -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT"
}

run_frontend() {
  cd "$PROJECT_ROOT"
  if [[ ! -x "$PROJECT_ROOT/node_modules/.bin/vite" ]]; then
    echo "Frontend dependencies are missing. Run: npm run setup" >&2
    exit 1
  fi
  exec npm --workspace frontend run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
}

case "$MODE" in
  backend)
    run_backend
    ;;
  frontend)
    run_frontend
    ;;
  all)
    "$0" backend &
    BACKEND_PID=$!
    "$0" frontend &
    FRONTEND_PID=$!

    cleanup() {
      kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
      wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    }
    trap cleanup EXIT INT TERM
    while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
      sleep 1
    done
    exit 1
    ;;
  *)
    echo "Usage: $0 [all|backend|frontend]" >&2
    exit 2
    ;;
esac
