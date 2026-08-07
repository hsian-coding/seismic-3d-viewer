#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TECTON_PYCACHE_DIR="${TMPDIR:-/tmp}/tecton-python-cache"

cd "$PROJECT_ROOT"

npm run build

if [[ -d node_modules/@react-three/fiber && -d node_modules/apache-arrow ]]; then
  npm run check:integrations
else
  echo "Skipping optional integration typecheck until npm install completes."
fi

if [[ -x "$PROJECT_ROOT/.venv/bin/python" ]]; then
  "$PROJECT_ROOT/.venv/bin/python" -m unittest discover backend/tests
else
  PYTHONPYCACHEPREFIX="$TECTON_PYCACHE_DIR" python3 -m compileall -q backend
  echo "Backend dependencies are not installed; Python syntax check completed instead."
fi

bash -n scripts/setup.sh scripts/dev.sh scripts/check.sh scripts/scaffold_project.sh
echo "All available checks passed."
