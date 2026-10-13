import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Com o seletor de papel, o papel de quem faz o pedido vem sempre de authorize() (auth.profile),
// que aplica o papel ativo. Ler o papel diretamente da tabela users ou das funções SQL is_*()
// devolveria os papéis reais e ignoraria a escolha.
const ROOT = path.join(__dirname, "..", "..");
const ALLOWED = new Set([
  "app/api/auth/active-role/route.ts", // valida a escolha contra os papéis reais (de propósito)
  "app/api/auth/me/route.ts",          // lê o perfil completo e aplica o papel ativo a seguir
]);

const SELF_ROLE_READ =
  /\.from\("users"\)\s*\.select\("[^"]*\brole\b[^"]*"\)\s*\.eq\("id",\s*(authUser\.id|user\.id|authz\.user\.id|auth\.user\.id|user\.email!?|authUser\.email!?)\)/;
const ROLE_RPC = /\.rpc\("is_(admin|staff|manager|finance|trainer_or_above)"/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.ts$/.test(name) && !name.includes(" 2.") ? [full] : [];
  });
}

describe("rotas da API respeitam o papel ativo", () => {
  const files = walk(path.join(ROOT, "app", "api")).map((f) => path.relative(ROOT, f));
  const offenders = files.filter((f) => {
    if (ALLOWED.has(f)) return false;
    const src = readFileSync(path.join(ROOT, f), "utf8");
    return SELF_ROLE_READ.test(src) || ROLE_RPC.test(src);
  });

  it("nenhuma rota lê o papel do próprio utilizador fora de authorize()", () => {
    expect(offenders).toEqual([]);
  });
});
