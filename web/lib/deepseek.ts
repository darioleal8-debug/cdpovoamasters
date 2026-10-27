const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";

export type MessagePart = { type: string; [key: string]: unknown };

export interface DeepSeekJSONOptions {
  /** System message (deve incluir a palavra "json" e o esquema esperado) */
  system?: string;
  /** Mensagem do utilizador — string ou array multimodal (imagem + texto) */
  user: string | MessagePart[];
  /** Máximo de tokens de resposta (default 4096) */
  maxTokens?: number;
  temperature?: number;
  /** Sobrepõe DEEPSEEK_MODEL env; default "deepseek-v4-flash" */
  model?: string;
}

export type DeepSeekJSONResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type AttemptResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; shouldRetry?: boolean };

/**
 * Wrapper partilhado para chamadas à API DeepSeek que devolvem JSON.
 * - Modelo: DEEPSEEK_MODEL env (default "deepseek-v4-flash")
 * - Thinking desligado explicitamente (evita consumo de tokens de raciocínio)
 * - response_format json_object
 * - Retry automático com 2× max_tokens se finish_reason=length
 * - Remove ```json fences antes do JSON.parse
 * - Timeout de 45 s via AbortController
 * - Em caso de falha: console.error com finish_reason, usage e preview
 */
export async function deepseekJSON<T = Record<string, unknown>>(
  opts: DeepSeekJSONOptions
): Promise<DeepSeekJSONResult<T>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, error: "DEEPSEEK_API_KEY não configurada" };

  const model = opts.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const maxTokens = opts.maxTokens ?? 4096;

  const messages: object[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  async function attempt(maxTok: number): Promise<AttemptResult<T>> {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch(DEEPSEEK_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature: opts.temperature ?? 0.4,
          max_tokens: maxTok,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `DeepSeek HTTP ${res.status}: ${txt.slice(0, 200)}` };
      }

      const json = (await res.json()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const choice = json.choices?.[0];
      const finishReason = choice?.finish_reason ?? "unknown";
      const content = choice?.message?.content ?? "";

      if (finishReason === "length" || !content.trim()) {
        console.error(
          `[deepseekJSON] truncated | model=${model} | finish=${finishReason} | ` +
          `tokens=${json.usage?.prompt_tokens ?? "?"}p/${json.usage?.completion_tokens ?? "?"}c | ` +
          `content_len=${content.length} | preview=${content.slice(0, 500)}`
        );
        return {
          ok: false,
          error: `Resposta do DeepSeek incompleta (finish_reason=${finishReason})`,
          shouldRetry: true,
        };
      }

      const cleaned = content
        .replace(/^```(?:json)?\s*/im, "")
        .replace(/\s*```\s*$/m, "")
        .trim();

      try {
        const data = JSON.parse(cleaned) as T;
        return { ok: true, data };
      } catch {
        console.error(
          `[deepseekJSON] JSON parse failed | model=${model} | finish=${finishReason} | ` +
          `tokens=${json.usage?.prompt_tokens ?? "?"}p/${json.usage?.completion_tokens ?? "?"}c | ` +
          `content_len=${content.length} | preview=${content.slice(0, 500)}`
        );
        return { ok: false, error: `DeepSeek devolveu JSON inválido (finish_reason=${finishReason})` };
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        return { ok: false, error: "DeepSeek timeout (45s)" };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `DeepSeek erro de rede: ${msg.slice(0, 200)}` };
    } finally {
      clearTimeout(timerId);
    }
  }

  const first = await attempt(maxTokens);
  if (first.ok) return first;

  if (first.shouldRetry) {
    const retryTok = Math.min(maxTokens * 2, 32768);
    console.warn(`[deepseekJSON] retry with maxTokens=${retryTok} (reason: ${first.error})`);
    const retry = await attempt(retryTok);
    if (retry.ok) return retry;
    return { ok: false, error: retry.error };
  }

  return { ok: false, error: first.error };
}
