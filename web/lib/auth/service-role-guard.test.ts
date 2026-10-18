import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Revisão final (Crítico 1): qualquer handler de uma rota que use service role tem de passar por
// authorize() (sessão + conta ativa [+ papel]) ou isAuthorizedCron(). Exceções explícitas abaixo.
const API = path.join(__dirname, "..", "..", "app", "api");
const SERVICE_ROLE = /SERVICE_ROLE|createAdminClient|adminClient\(|makeAdminClient|requireFinanceAccess/;
const PUBLIC_BY_DESIGN = new Set([
  "activate/route.ts",               // ativação por token (sem sessão)
  "public/request-access/route.ts",  // formulário público com rate-limit
  "public/equipa/[slug]/route.ts",   // página pública da equipa (só com club_settings.is_public)
  "public/news/route.ts",            // notícias publicadas
  "public/news/[slug]/route.ts",     // notícia publicada
  "public/result-submissions/route.ts", // submissão pública de resultados (rate-limit por IP, aprovação do admin)
]);

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? routes(p) : f === "route.ts" ? [p] : [];
  });
}

describe("handlers com service role exigem authorize()/cron", () => {
  for (const file of routes(API)) {
    const rel = path.relative(API, file);
    const src = readFileSync(file, "utf8");
    if (!SERVICE_ROLE.test(src) || PUBLIC_BY_DESIGN.has(rel)) continue;
    const handlers = src.split(/export async function (?=GET|POST|PUT|PATCH|DELETE)/).slice(1);
    for (const h of handlers) {
      const name = h.slice(0, h.indexOf("("));
      it(`${rel} ${name}`, () => {
        const body = h.split(/\nexport /)[0];
        expect(/authorize\(|requireFinanceAccess\(\)|isAuthorizedCron\(/.test(body)).toBe(true);
      });
    }
  }
});
