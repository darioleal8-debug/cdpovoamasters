import { timingSafeEqual } from "crypto";

/** Autentica chamadas às rotas /api/cron/*. Sem CRON_SECRET configurado, recusa sempre (fail-closed). */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
