import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Factos verificados na BD de produção em 2026-10-13 (audit/evidence/prod/*):
// não existem training_attendances, players.name, game_callups.status/event_id; player_stats está vazia
// e nada a escreve; a coluna de pontos é pts.
const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", f), "utf8");

const FILES = [
  "app/api/dashboard/route.ts",
  "app/api/chat/event-panel/route.ts",
  "lib/chat/event-thread-sync.ts",
  "app/api/player/stats/route.ts",
  "hooks/use-live-game.ts",
  "app/api/games/[id]/import-stats/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/admin/users/route.ts",
];

describe("referências a schema inexistente em produção", () => {
  for (const f of FILES) {
    it(`${f} não usa training_attendances / player_stats / select("points")`, () => {
      const src = read(f);
      expect(src).not.toContain('"training_attendances"');
      expect(src).not.toContain('from("player_stats")');
      expect(src).not.toMatch(/select\("points"\)/);
    });
    it(`${f} não lê players.name`, () => {
      const src = read(f);
      // qualquer select de "players" que inclua a coluna name
      expect(src).not.toMatch(/from\("players"\)[\s\S]{0,80}select\("[^"]*\bname\b/);
      expect(src).not.toMatch(/\.eq\("name",/);
    });
  }
  it("event-panel filtra convocatórias por game_id e não pede status", () => {
    const src = read("app/api/chat/event-panel/route.ts");
    expect(src).not.toMatch(/game_callups"\)[\s\S]{0,60}select\("status/);
    expect(src).not.toContain('.eq("event_id", eventId)');
  });
  it("dashboard usa roles_extra 'jogador' e não 'player'", () => {
    expect(read("app/api/dashboard/route.ts")).not.toContain('includes("player")');
  });
  it("comunicados do atleta vêm do chat 'announcement' e não de importante=true", () => {
    expect(read("app/api/player/comunicados/route.ts")).not.toContain('"importante"');
    expect(read("app/player/minha-area/page.tsx")).not.toContain('"importante"');
  });
});

describe("RSVP de treinos (minor da revisão + bug novo)", () => {
  it("lista de RSVP não pede players.jersey_number nem embute user_display_names a partir de players", () => {
    const src = read("app/api/trainings/[id]/rsvp/players/route.ts");
    expect(src).not.toMatch(/from\("players"\)[\s\S]{0,40}select\("[^"]*jersey_number/);
    expect(src).not.toMatch(/from\("players"\)[\s\S]{0,40}select\("[^"]*user_display_names\(/);
  });
  it("o RSVP próprio usa o perfil da época do treino, não o mais recente", () => {
    const src = read("app/api/trainings/[id]/rsvp/route.ts");
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function", src.indexOf("export async function GET") + 10));
    expect(get).toMatch(/\.eq\("season_id"/);
  });
  it("comunicados não usam maybeSingle() no canal announcement", () => {
    const src = read("app/api/player/comunicados/route.ts");
    expect(src).not.toMatch(/"announcement"\)\s*\.maybeSingle\(\)/);
  });
});
