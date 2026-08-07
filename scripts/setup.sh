#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TECTON_PYTHON_BIN="${TECTON_PYTHON_BIN:-python3}"

cd "$PROJECT_ROOT"

echo "Installing frontend workspace dependencies..."
npm install --cache .npm-cache

if [[ ! -x "$PROJECT_ROOT/.venv/bin/python" ]]; then
  echo "Creating Python virtual environment..."
  "$TECTON_PYTHON_BIN" -m venv "$PROJECT_ROOT/.venv"
fi

echo "Installing backend dependencies..."
"$PROJECT_ROOT/.venv/bin/python" -m pip install --upgrade pip
"$PROJECT_ROOT/.venv/bin/python" -m pip install -r "$PROJECT_ROOT/backend/requirements-dev.txt"

echo "Setup complete. Run: npm run dev"
