import { describe, it, expect } from "vitest";
import { markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("não entra em ciclo infinito com linhas de hashtags", () => {
    const md = "Parágrafo inicial.\n\nParciais: 11-9 | 8-2\n\n#LigaINATEL #MatosinhosBasket #HoopHub";
    const html = markdownToHtml(md);
    expect(html).toContain("#LigaINATEL #MatosinhosBasket #HoopHub");
    expect(html).toContain("Parciais: 11-9 | 8-2");
  });

  it("hashtags a seguir a uma linha de texto ficam no mesmo parágrafo", () => {
    const html = markdownToHtml("Fim do texto.\n#LigaINATEL");
    expect(html).toContain("Fim do texto.<br />#LigaINATEL");
  });

  it("continua a reconhecer títulos ## e ###", () => {
    const html = markdownToHtml("Texto\n## Título\n### Sub");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
  });

  it("um único # isolado não bloqueia", () => {
    expect(markdownToHtml("#")).toContain("<p");
  });
});
