import { describe, expect, it } from "vitest";
import { buildShareLinks, formatViews } from "./share-links";

describe("buildShareLinks", () => {
  const url = "https://www.hoophub.pt/liga-inatel/noticias/jogo-a-b?x=1&y=2";
  const title = "Póvoa vence & convence — jornada 3";
  const links = buildShareLinks(url, title);
  const by = (id: string) => links.find((l) => l.id === id)!.href;

  it("inclui as redes mais usadas", () => {
    expect(links.map((l) => l.id)).toEqual(["whatsapp", "facebook", "x", "linkedin", "telegram", "email"]);
  });

  it("codifica o URL e o título em cada rede", () => {
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(title);
    expect(by("facebook")).toBe(`https://www.facebook.com/sharer/sharer.php?u=${u}`);
    expect(by("x")).toBe(`https://twitter.com/intent/tweet?url=${u}&text=${t}`);
    expect(by("linkedin")).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${u}`);
    expect(by("telegram")).toBe(`https://t.me/share/url?url=${u}&text=${t}`);
    expect(by("whatsapp")).toBe(`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`);
    expect(by("email")).toContain(`subject=${t}`);
  });

  it("não deixa o & do título partir os parâmetros", () => {
    for (const l of links) expect(l.href).not.toContain("vence & convence");
  });
});

describe("formatViews", () => {
  it("singular e plural", () => {
    expect(formatViews(0)).toBe("0 visualizações");
    expect(formatViews(1)).toBe("1 visualização");
    expect(formatViews(2)).toBe("2 visualizações");
  });
  it("ignora negativos", () => {
    expect(formatViews(-5)).toBe("0 visualizações");
  });
});
