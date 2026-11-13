import { deepseekJSONDetailed } from "@/lib/deepseek";
import { normalizePlayDraft, type PlayDraft } from "./normalize";

export const PLAY_SYSTEM_PROMPT = `És um treinador de basquetebol que desenha jogadas animadas. Responde SEMPRE com um único objeto json, sem texto fora do json, em português de Portugal.

CAMPO (meio-campo, unidades 0-500 em x, 0-470 em y):
- O cesto está em (250, 52). A linha de fundo é y=0; o meio-campo é y=470. x=0 é a linha lateral esquerda, x=500 a direita.
- Garrafão: x 170..330, y 0..190. Lance livre: (250,190). Linha de 3 pontos: raio ~225 centrado em (250,99); cantos em x=30 e x=470 (y<99).
- Posições típicas: base (250,380); ala esq (90,280); ala dir (410,280); canto esq (40,60); canto dir (460,60); poste alto (210,190); poste baixo (200,110).
- Jogadores 1 a 5 (1=base, 2=extremo, 3=ala, 4=ala-poste, 5=poste), todos os 5 em "init.pos" com chaves "1".."5".

ESQUEMA:
{
 "name": "Nome curto da jogada",
 "eyebrow": "Subtítulo curto (ex.: Ataque posicional · 5 abertos)",
 "category": "Ataque|Defesa|Reposição lateral|Reposição de fundo|Contra-ataque|Zona|Pressão",
 "note": "Nota do treinador (1-2 frases)",
 "init": { "pos": { "1":[x,y], "2":[x,y], "3":[x,y], "4":[x,y], "5":[x,y] }, "ball": 1 },
 "steps": {
   "s1": { "title": "Título do passo", "text": "Explicação para o jogador",
     "moves":  [ { "p": 1-5, "to": [x,y], "via": [x,y] (opcional, ponto de controlo da curva), "type": "cut|dribble|screen", "s": 0-1, "e": 0-1 } ],
     "passes": [ { "f": jogador que passa, "t": jogador que recebe, "s": 0-1, "e": 0-1, "ho": true (opcional, mão a mão) } ],
     "options": [ números dos jogadores que são opções de passe (opcional) ] }
 },
 "options": [ { "id": "main", "label": "Opção principal", "sub": "Descrição curta", "steps": ["s1","s2"] } ]
}

REGRAS:
- Cada passo dura 0 a 1 de tempo normalizado; "s" é o início e "e" o fim (s < e). Movimentos e passes do mesmo passo podem sobrepor-se; um passe só deve começar depois de quem passa ter a bola.
- Quem passa tem de ter a bola nesse momento (começa com init.ball e muda a cada passe).
- Usa "screen" para blocos (o bloqueador move-se para junto do defesa/colega), "cut" para cortes sem bola, "dribble" para condução de bola.
- 3 a 7 passos por opção. Se o treinador pedir variantes (ex.: "se o defesa passar por cima"), cria mais itens em "options" que reutilizam ou acrescentam passos. Coordenadas dentro do campo (0-500, 0-470).
- Se for pedida uma alteração a uma jogada existente, devolve a jogada COMPLETA já alterada.`;

export interface GenerateInput {
  prompt: string;
  /** Jogada atual (para pedidos de alteração) */
  current?: PlayDraft | null;
}

export type GenerateResult =
  | { ok: true; play: PlayDraft; warnings: string[] }
  | { ok: false; error: string; status: number };

export async function generatePlay({ prompt, current }: GenerateInput): Promise<GenerateResult> {
  const user = current
    ? `Jogada atual (json):\n${JSON.stringify(current)}\n\nAlteração pedida pelo treinador:\n${prompt}`
    : `Descrição da jogada pelo treinador:\n${prompt}`;

  const r = await deepseekJSONDetailed<unknown>({
    system: PLAY_SYSTEM_PROMPT,
    user,
    maxTokens: 6000,
    temperature: 0.4,
    timeoutMs: 90_000,
    transientRetries: 1,
  });
  if (!r.ok) {
    const status = r.kind === "config" ? 503 : r.kind === "rate_limit" ? 429 : 502;
    return { ok: false, error: r.kind === "config" ? "Serviço de IA não configurado." : `Falha da IA: ${r.error}`, status };
  }
  const n = normalizePlayDraft(r.data);
  if (!n.ok) return { ok: false, error: n.error, status: 422 };
  return { ok: true, play: n.play, warnings: n.warnings };
}
