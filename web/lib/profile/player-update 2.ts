export interface PlayerProfileUpdate {
  position?: string;
  height?: number;
  weight?: number;
  age?: number;
}

const toPositive = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Campos desportivos a atualizar a partir do formulário "O meu perfil".
 * Só inclui o que veio preenchido e válido — nunca grava null por omissão (DAT-02).
 */
export function buildPlayerProfileUpdate(body: Record<string, unknown>): PlayerProfileUpdate {
  const out: PlayerProfileUpdate = {};
  if (typeof body.position === "string" && body.position.trim()) out.position = body.position.trim();
  const height = toPositive(body.height);
  if (height !== undefined) out.height = height;
  const weight = toPositive(body.weight);
  if (weight !== undefined) out.weight = weight;
  const age = toPositive(body.age);
  if (age !== undefined) out.age = age;
  return out;
}
