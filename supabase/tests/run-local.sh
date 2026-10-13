#!/usr/bin/env bash
# Testes RLS/migração num Postgres EFÉMERO (nunca toca em produção).
# Uso: bash supabase/tests/run-local.sh            → baseline de produção + migração 056 (tem de passar tudo)
#      bash supabase/tests/run-local.sh --baseline → só baseline (mostra o que a 056 corrige: deve falhar)
set -euo pipefail
export LC_ALL=C LANG=C
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGTMP="$(mktemp -d "${TMPDIR:-/tmp}/rls-test.XXXXXX")"
PORT="${RLS_PG_PORT:-54331}"
trap 'pg_ctl -D "$PGTMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGTMP"' EXIT
initdb -D "$PGTMP/data" -U postgres -A trust >/dev/null
pg_ctl -D "$PGTMP/data" -o "-p $PORT -k $PGTMP -c listen_addresses=''" -l "$PGTMP/log" start >/dev/null
PSQL=(psql -h "$PGTMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt)
"${PSQL[@]}" -f "$HERE/local/00_prod_baseline.sql" >/dev/null
if [[ "${1:-}" != "--baseline" ]]; then
  "${PSQL[@]}" -f "$ROOT/supabase/migrations/056_fase_a_security.sql" >/dev/null
fi
"${PSQL[@]}" -f "$HERE/local/10_fase_a_expectations.sql" >/dev/null
fail=0
while IFS='|' read -r t ok d; do
  if [[ "$ok" == "t" ]]; then echo "PASS  $t — $d"; else echo "FAIL  $t — $d"; fail=$((fail+1)); fi
done < <("${PSQL[@]}" -c "SELECT test, ok, detail FROM public._results ORDER BY id")
echo "--- falhas: $fail"
[[ "$fail" -eq 0 ]]
