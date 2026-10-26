#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${QLOO_ENV_FILE:-}" ]]; then
  set -a; . "$QLOO_ENV_FILE"; set +a
fi
export QLOO_MODE=live LLM_PROVIDER=mock
exec npx vitest run --config scripts/vitest.live.config.ts
