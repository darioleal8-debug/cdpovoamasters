import { describe, test, expect } from "vitest";
import {
  isAwaitingResult,
  pendingResultMessage,
  submitResultLink,
  whatsappShareUrl,
  type ShareableGame,
} from "@/lib/liga/share-pending-game";

const game: ShareableGame = {
  id: "abc-123",
  event_date: "2026-11-14",
  home_team: "CD Póvoa",
  away_team: "CBF Felgueiras BAD",
  jornada: 5,
  serie: "A",
  result_status: "no_result",
};

describe("isAwaitingResult", () => {
  test("jogo passado sem resultado → sim", () => {
    expect(isAwaitingResult(game, "2026-11-16")).toBe(true);
  });
  test("jogo de hoje sem resultado → sim", () => {
    expect(isAwaitingResult(game, "2026-11-14")).toBe(true);
  });
  test("jogo futuro → não", () => {
    expect(isAwaitingResult(game, "2026-11-13")).toBe(false);
  });
  test("resultado já submetido (pending) ou aprovado → não", () => {
    expect(isAwaitingResult({ ...game, result_status: "pending" }, "2026-11-16")).toBe(false);
    expect(isAwaitingResult({ ...game, result_status: "approved" }, "2026-11-16")).toBe(false);
  });
});

describe("mensagem de WhatsApp", () => {
  test("ligação aponta para a submissão com o jogo", () => {
    expect(submitResultLink("https://hoophub.pt", "abc-123")).toBe(
      "https://hoophub.pt/liga-inatel/resultados/submeter?jogo=abc-123",
    );
  });
  test("inclui equipas, jornada, série e ligação", () => {
    const msg = pendingResultMessage(game, "https://hoophub.pt");
    expect(msg).toContain("Jornada 5 · Série A");
    expect(msg).toContain("CD Póvoa vs CBF Felgueiras BAD");
    expect(msg).toContain("https://hoophub.pt/liga-inatel/resultados/submeter?jogo=abc-123");
  });
  test("URL wa.me codifica a mensagem", () => {
    const url = whatsappShareUrl("olá & adeus\nlinha 2");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).toContain("%26");
    expect(url).toContain("%0A");
  });
});
