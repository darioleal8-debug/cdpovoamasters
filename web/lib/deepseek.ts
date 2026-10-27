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
  /** Timeout por tentativa em ms (default 45 000) */
  timeoutMs?: number;
  /** Repetições extra (com backoff) para 429 / 5xx / erro de rede. Default 0. */
  transientRetries?: number;
  /** Limite de tokens no retry por finish_reason=length (default 32 768) */
  maxRetryTokens?: number;
}

export type DeepSeekJSONResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Tipo de erro — permite à UI dar mensagens claras e decidir se vale a pena repetir. */
export type DeepSeekErrorKind =
  | "config"
  | "vision_unsupported"
  | "rate_limit"
  | "timeout"
  | "http"
  | "network"
  | "truncated"
  | "invalid_json";

export interface DeepSeekCallMeta {
  model: string;
  durationMs: number;
  attempts: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cacheHitTokens: number | null;
}

export type DeepSeekDetailedResult<T> =
  | { ok: true; data: T; meta: DeepSeekCallMeta }
  | { ok: false; error: string; kind: DeepSeekErrorKind; meta: DeepSeekCallMeta };

type AttemptResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: DeepSeekErrorKind; shouldRetry?: boolean; transient?: boolean };

/** Erro HTTP 400/422 a indicar que o modelo não aceita imagens. */
export function isVisionUnsupportedError(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /image|vision|multimodal|image_url|unknown variant|content type/i.test(body);
}

function hasImagePart(user: string | MessagePart[]): boolean {
  return Array.isArray(user) && user.some((p) => p.type === "image_url" || p.type === "image");
}

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
  const r = await deepseekJSONDetailed<T>(opts);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

/** Como deepseekJSON, mas devolve também metadados (duração, tokens) e o tipo de erro. */
export async function deepseekJSONDetailed<T = Record<string, unknown>>(
  opts: DeepSeekJSONOptions
): Promise<DeepSeekDetailedResult<T>> {
  const started = Date.now();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = opts.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const meta: DeepSeekCallMeta = {
    model, durationMs: 0, attempts: 0, promptTokens: null, completionTokens: null, cacheHitTokens: null,
  };
  if (!apiKey) return { ok: false, error: "DEEPSEEK_API_KEY não configurada", kind: "config", meta };

  const maxTokens = opts.maxTokens ?? 4096;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const withImage = hasImagePart(opts.user);

  const messages: object[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  async function attempt(maxTok: number): Promise<AttemptResult<T>> {
    meta.attempts++;
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

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
        if (withImage && isVisionUnsupportedError(res.status, txt)) {
          return {
            ok: false, kind: "vision_unsupported",
            error: `O modelo "${model}" não aceita imagens (HTTP ${res.status}). Configure DEEPSEEK_VISION_MODEL com um modelo DeepSeek com visão.`,
          };
        }
        if (res.status === 429) {
          return { ok: false, kind: "rate_limit", transient: true, error: "DeepSeek: limite de pedidos atingido (HTTP 429)" };
        }
        return {
          ok: false, kind: "http", transient: res.status >= 500,
          error: `DeepSeek HTTP ${res.status}: ${txt.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
      };
      meta.promptTokens = (meta.promptTokens ?? 0) + (json.usage?.prompt_tokens ?? 0);
      meta.completionTokens = (meta.completionTokens ?? 0) + (json.usage?.completion_tokens ?? 0);
      if (json.usage?.prompt_cache_hit_tokens != null) {
        meta.cacheHitTokens = (meta.cacheHitTokens ?? 0) + json.usage.prompt_cache_hit_tokens;
      }

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
          kind: "truncated",
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
        return { ok: false, kind: "invalid_json", error: `DeepSeek devolveu JSON inválido (finish_reason=${finishReason})` };
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        return { ok: false, kind: "timeout", error: `DeepSeek timeout (${Math.round(timeoutMs / 1000)}s)` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, kind: "network", transient: true, error: `DeepSeek erro de rede: ${msg.slice(0, 200)}` };
    } finally {
      clearTimeout(timerId);
    }
  }

  const done = (r: AttemptResult<T>): DeepSeekDetailedResult<T> => {
    meta.durationMs = Date.now() - started;
    return r.ok ? { ok: true, data: r.data, meta } : { ok: false, error: r.error, kind: r.kind, meta };
  };

  let first = await attempt(maxTokens);
  // Erros transitórios (429 / 5xx / rede): repetição limitada com backoff exponencial
  for (let i = 0; !first.ok && first.transient && i < (opts.transientRetries ?? 0); i++) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    first = await attempt(maxTokens);
  }
  if (first.ok) return done(first);

  if (first.shouldRetry) {
    const retryTok = Math.min(maxTokens * 2, opts.maxRetryTokens ?? 32768);
    if (retryTok <= maxTokens) return done(first);
    console.warn(`[deepseekJSON] retry with maxTokens=${retryTok} (reason: ${first.error})`);
    return done(await attempt(retryTok));
  }

  return done(first);
}
