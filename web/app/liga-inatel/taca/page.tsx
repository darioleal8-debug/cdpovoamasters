import type { Metadata } from "next";
import Link from "next/link";
import { getCupBracket, CUP_NAME } from "@/lib/cup";
import { CourtBg } from "@/components/competitions/court-bg";
import { CupBracket, CupGameList } from "@/components/competitions/cup-bracket";

export const metadata: Metadata = {
  title: CUP_NAME,
  description: "Quadro, calendário e resultados da Taça da Liga INATEL de basquetebol.",
};

export const revalidate = 60;

const mono = "var(--font-ibm-mono, monospace)";
const heavy = "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))";

export default async function TacaPage() {
  const { competition, rounds, champion } = await getCupBracket();

  if (!competition || rounds.length === 0) {
    return (
      <p style={{ textAlign: "center", padding: "60px 20px", color: "#6F675F" }}>
        Competição não disponível.
      </p>
    );
  }

  const games = rounds.flatMap((r) => r.games);
  const played = games.filter((g) => g.status === "finished").length;
  const maxW = { maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" } as const;

  return (
    <div>
      <CourtBg>
        <div style={{ ...maxW, padding: "40px 20px 36px" }}>
          <p style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "#F97316", marginBottom: 8 }}>
            LIGA INATEL · COMPETIÇÃO
          </p>
          <h1 style={{ fontFamily: heavy, fontWeight: 800, fontSize: "clamp(38px, 8vw, 72px)", letterSpacing: "0.04em", textTransform: "uppercase", color: "#F6F2EC", lineHeight: 0.9, margin: "0 0 14px" }}>
            Taça da Liga <span style={{ color: "#F97316" }}>INATEL</span>
          </h1>
          <p style={{ fontSize: 14, color: "#B9AFA4", margin: 0 }}>
            {games.length} jogos · {rounds.length} eliminatórias · {played} realizado{played !== 1 ? "s" : ""}
            <span
              style={{
                marginLeft: 12, padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(249,115,22,.5)",
                fontFamily: mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "#F97316",
              }}
            >
              Calendário provisório
            </span>
          </p>
        </div>
      </CourtBg>

      <div style={{ ...maxW, padding: "32px 20px 8px" }}>
        <h2 style={{ fontFamily: heavy, fontWeight: 800, fontSize: 26, letterSpacing: ".06em", textTransform: "uppercase", margin: "0 0 6px" }}>
          Quadro
        </h2>
        <p style={{ fontSize: 13, color: "#6F675F", margin: "0 0 20px", lineHeight: 1.5 }}>
          Eliminatórias a eliminar: o vencedor avança sozinho para o jogo seguinte. A Taça é independente da{" "}
          <Link href="/liga-inatel/classificacao" style={{ color: "#C2570C" }}>Liga INATEL</Link>
          {" "}— os resultados da Taça não contam para a classificação da Liga.
        </p>
        <CupBracket rounds={rounds} champion={champion} theme="light" />
        <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "#8C837A", margin: "6px 0 0" }}>
          Deslize para ver todas as eliminatórias
        </p>
      </div>

      <div style={{ ...maxW, padding: "32px 20px 56px" }}>
        <h2 style={{ fontFamily: heavy, fontWeight: 800, fontSize: 26, letterSpacing: ".06em", textTransform: "uppercase", margin: "0 0 16px" }}>
          Calendário e resultados da Taça
        </h2>
        <CupGameList rounds={rounds} theme="light" />
      </div>
    </div>
  );
}
