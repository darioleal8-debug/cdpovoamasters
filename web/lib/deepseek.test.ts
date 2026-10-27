import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { deepseekJSON } from "./deepseek";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeResponse(
  content: string,
  finishReason = "stop",
  status = 200,
  promptTokens = 100,
  completionTokens = 50,
): Response {
  const body = JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL;
  vi.unstubAllGlobals();
});

// ── testes básicos ────────────────────────────────────────────────────────────

describe("deepseekJSON — respostas válidas", () => {
  test("devolve data em JSON limpo", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('{"titulo":"Olá","corpo":"Texto"}'));
    const r = await deepseekJSON({ user: "prompt" });
    expect(r).toEqual({ ok: true, data: { titulo: "Olá", corpo: "Texto" } });
  });

  test("remove fences ```json antes do parse", async () => {
    const raw = '```json\n{"titulo":"Com fence","corpo":"Ok"}\n```';
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(raw));
    const r = await deepseekJSON({ user: "prompt" });
    expect(r).toEqual({ ok: true, data: { titulo: "Com fence", corpo: "Ok" } });
  });

  test("remove fences ``` sem language tag", async () => {
    const raw = '```\n{"a":1}\n```';
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(raw));
    const r = await deepseekJSON({ user: "prompt" });
    expect(r).toEqual({ ok: true, data: { a: 1 } });
  });

  test("envia system message quando fornecida", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('{"ok":true}'));
    await deepseekJSON({ system: "Sê conciso.", user: "prompt" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "Sê conciso." });
    expect(body.messages[1]).toEqual({ role: "user", content: "prompt" });
  });

  test("usa DEEPSEEK_MODEL env se configurado", async () => {
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('{"x":1}'));
    await deepseekJSON({ user: "p" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("deepseek-chat");
  });

  test("usa model override passado directamente", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('{"x":1}'));
    await deepseekJSON({ user: "p", model: "deepseek-vision" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("deepseek-vision");
  });

  test("envia thinking:disabled e response_format:json_object", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('{"x":1}'));
    await deepseekJSON({ user: "p" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});

// ── retry em finish_reason=length ─────────────────────────────────────────────

describe("deepseekJSON — retry em finish_reason=length", () => {
  test("retenta com 2× max_tokens e devolve ok na segunda tentativa", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse('{"incompleto":', "length"))
      .mockResolvedValueOnce(makeResponse('{"titulo":"Ok","corpo":"Completo"}', "stop"));
    const r = await deepseekJSON({ user: "prompt", maxTokens: 512 });
    expect(r).toEqual({ ok: true, data: { titulo: "Ok", corpo: "Completo" } });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const body2 = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string);
    expect(body2.max_tokens).toBe(1024); // 512 × 2
  });

  test("retenta quando content é vazio (thinking consome todos os tokens)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse("", "stop"))
      .mockResolvedValueOnce(makeResponse('{"a":1}', "stop"));
    const r = await deepseekJSON({ user: "prompt" });
    expect(r).toEqual({ ok: true, data: { a: 1 } });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  test("capping a 32768 tokens no retry", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse("", "stop"))
      .mockResolvedValueOnce(makeResponse('{"a":1}', "stop"));
    await deepseekJSON({ user: "prompt", maxTokens: 20000 });
    const body2 = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string);
    expect(body2.max_tokens).toBe(32768);
  });

  test("devolve erro se retry também falhar por length", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse("", "stop"))
      .mockResolvedValueOnce(makeResponse('{"inc":', "length"));
    const r = await deepseekJSON({ user: "prompt" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/incompleta/i);
  });

  test("não retenta em erro de parse JSON (sem shouldRetry)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse("isto não é json", "stop"));
    const r = await deepseekJSON({ user: "prompt" });
    expect(r.ok).toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

// ── erros de rede e HTTP ──────────────────────────────────────────────────────

describe("deepseekJSON — erros de rede e HTTP", () => {
  test("devolve erro em HTTP 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    const r = await deepseekJSON({ user: "p" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/401/);
  });

  test("devolve erro em HTTP 500", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Server Error", { status: 500 }),
    );
    const r = await deepseekJSON({ user: "p" });
    expect(r.ok).toBe(false);
  });

  test("devolve erro de rede (fetch rejeita)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await deepseekJSON({ user: "p" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rede/i);
  });

  test("devolve erro de timeout (AbortError)", async () => {
    const abortErr = Object.assign(new Error("Aborted"), { name: "AbortError" });
    vi.mocked(fetch).mockRejectedValueOnce(abortErr);
    const r = await deepseekJSON({ user: "p" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/timeout/i);
  });

  test("devolve erro quando DEEPSEEK_API_KEY não está configurada", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const r = await deepseekJSON({ user: "p" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/DEEPSEEK_API_KEY/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ── conteúdo user multimodal (array) ─────────────────────────────────────────

describe("deepseekJSON — user content multimodal", () => {
  test("aceita array de MessagePart como user content", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('{"resultado":1}'));
    const parts = [
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      { type: "text", text: "Descreve a imagem." },
    ];
    const r = await deepseekJSON({ user: parts });
    expect(r).toEqual({ ok: true, data: { resultado: 1 } });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toEqual(parts);
  });
});
