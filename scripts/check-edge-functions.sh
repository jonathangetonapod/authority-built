#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

deno_bin="${DENO_BIN:-deno}"
if ! command -v "$deno_bin" >/dev/null 2>&1; then
  echo "Deno is required. Install Deno 2.5.2 or set DENO_BIN to that executable." >&2
  exit 1
fi

deno_version="$($deno_bin --version | sed -n '1s/^deno \([^ ]*\).*/\1/p')"
if [[ "$deno_version" != '2.5.2' ]]; then
  echo "Deno 2.5.2 is required; found ${deno_version:-unknown}." >&2
  exit 1
fi

if [[ ! -f deno.lock ]]; then
  echo "deno.lock is required for deterministic Edge Function validation." >&2
  exit 1
fi

mapfile -d '' edge_files < <(
  find supabase/functions -mindepth 2 -maxdepth 2 -type f -name index.ts -print0 |
    sort -z
)

expected_count=114
if [[ "${#edge_files[@]}" -ne "$expected_count" ]]; then
  echo "Expected $expected_count Edge Function entrypoints; found ${#edge_files[@]}." >&2
  exit 1
fi

export DENO_DIR="${DENO_DIR:-${TMPDIR:-/tmp}/getonapod-deno-cache}"
"$deno_bin" cache \
  --quiet \
  --frozen \
  --lock=deno.lock \
  --node-modules-dir=none \
  "${edge_files[@]}"
"$deno_bin" check \
  --frozen \
  --lock=deno.lock \
  --node-modules-dir=none \
  "${edge_files[@]}"

"$deno_bin" test \
  --frozen \
  --lock=deno.lock \
  --node-modules-dir=none \
  --allow-env=ALLOWED_ORIGIN,ALLOWED_ORIGINS,APP_URL,ENVIRONMENT,WEB_URL \
  supabase/functions/_shared/accountContextDto.test.ts \
  supabase/functions/_shared/auditEntity.test.ts \
  supabase/functions/_shared/cors.test.ts \
  supabase/functions/_shared/guestResourceContent.test.ts \
  supabase/functions/_shared/inboxSdr.test.ts \
  supabase/functions/_shared/instantly.test.ts \
  supabase/functions/_shared/podcastEpisodes.test.ts \
  supabase/functions/_shared/podcastExportDedupe.test.ts \
  supabase/functions/_shared/pitchAngles.test.ts \
  supabase/functions/_shared/promptModels.test.ts \
  supabase/functions/_shared/promptRequirements.test.ts \
  supabase/functions/_shared/promptVariables.test.ts \
  supabase/functions/_shared/stripeSignature.test.ts \
  supabase/functions/_shared/workspaceCredentials.test.ts
