#!/usr/bin/env bash
# Put the real-Bob presentation copy back to its starting state, so a rehearsal can be repeated.
# Usage: plugin/scripts/demo-reset.sh [test_C1_r1|test_C2_r1]   (default test_C1_r1)
# It never touches target/tinydb (the examined checkout) or demo-tinydb (the fake Bob fixture).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEMO="$ROOT/presentation-tinydb"
RUN="${1:-test_C1_r1}"
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3

if [ ! -d "$DEMO/.git" ]; then
  echo "No presentation copy at $DEMO. Create it as described in docs/DEMO_RUNBOOK.md." >&2
  exit 1
fi

cd "$DEMO"
git checkout -q -- . 2>/dev/null || true
git checkout -q main
git clean -fdq                      # Bob's leftovers only; .bob/ and AGENTS.md are excluded and survive
for b in $(git branch --list 'bob/readiness-*' --format='%(refname:short)'); do git branch -D -q "$b"; done
cd "$ROOT"
"$PY" cli.py publish --run "$RUN" --dest "$DEMO" | head -1
echo "presentation-tinydb: on $(git -C "$DEMO" branch --show-current), $(git -C "$DEMO" status --porcelain | wc -l | tr -d ' ') uncommitted changes, context from $RUN"
