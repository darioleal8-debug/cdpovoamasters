#!/usr/bin/env bash
# Testa a migração 111 (importação do boletim) num Postgres EFÉMERO (nunca toca em produção).
# Uso: bash supabase/tests/run-game-sheet.sh
set -euo pipefail
export LC_ALL=C LANG=C
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGTMP="$(mktemp -d "${TMPDIR:-/tmp}/gs-test.XXXXXX")"
PORT="${GS_PG_PORT:-54332}"
trap 'pg_ctl -D "$PGTMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$PGTMP"' EXIT
initdb -D "$PGTMP/data" -U postgres -A trust >/dev/null
pg_ctl -D "$PGTMP/data" -o "-p $PORT -k $PGTMP -c listen_addresses=''" -l "$PGTMP/log" start >/dev/null
PSQL=(psql -h "$PGTMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt)
"${PSQL[@]}" -f "$HERE/local/20_game_sheet_stub.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/111_game_sheet_imports.sql" >/dev/null 2>&1
# idempotência: aplicar duas vezes não pode falhar
"${PSQL[@]}" -f "$ROOT/supabase/migrations/111_game_sheet_imports.sql" >/dev/null 2>&1
"${PSQL[@]}" -f "$HERE/local/21_game_sheet_expectations.sql" >/dev/null
fail=0
while IFS='|' read -r t ok d; do
  if [[ "$ok" == "t" ]]; then echo "PASS  $t — $d"; else echo "FAIL  $t — $d"; fail=$((fail+1)); fi
done < <("${PSQL[@]}" -c "SELECT test, ok, detail FROM public._results ORDER BY id")
# rollback manual tem de aplicar sem erros
"${PSQL[@]}" -f "$ROOT/supabase/rollbacks/111_game_sheet_imports.sql" >/dev/null && echo "PASS  rollback_aplica" || { echo "FAIL  rollback_aplica"; fail=$((fail+1)); }
echo "--- falhas: $fail"
[[ "$fail" -eq 0 ]]
