import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Inserts com service role ignoram RLS: têm de definir club_id (ver docs/multi-clube.md).
// A allowlist contém os ficheiros existentes ainda por migrar — só deve diminuir.
const TABLES = "seasons|players|trainings|training_attendance|training_rsvps|training_notes|training_recurrence_rules|events|game_callups|game_availability|game_sessions|financial_entries|financial_expenses|financial_cash_movements|player_payments|player_payments_history|payment_receipts|documents|chats|birthday_messages|plays|team_kits|club_events|access_requests|palmares|hist_seasons|hist_games|hist_players|hist_player_stats";
const ADMIN = /SERVICE_ROLE|createAdminClient|adminClient\(|makeAdminClient|requireFinanceAccess/;
const INSERT = new RegExp(`\\.from\\("(${TABLES})"\\)[\\s\\S]{0,160}?\\.(insert|upsert)\\(`);

const PENDING = new Set<string>([]);

const root = path.resolve(__dirname, "../..");
function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe("club_id em inserts com service role", () => {
  const offenders: string[] = [];
  for (const dir of ["app/api", "lib"]) {
    for (const f of walk(path.join(root, dir))) {
      const s = readFileSync(f, "utf8");
      if (ADMIN.test(s) && INSERT.test(s) && !/club_id/.test(s)) offenders.push(path.relative(root, f).replace(/\\/g, "/"));
    }
  }
  it("ficheiros novos definem club_id", () => {
    expect(offenders.filter((f) => !PENDING.has(f))).toEqual([]);
  });
  it("allowlist sem entradas obsoletas", () => {
    expect([...PENDING].filter((f) => !offenders.includes(f))).toEqual([]);
  });
});
