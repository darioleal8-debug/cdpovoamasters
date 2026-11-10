/**
 * Teste REAL da extração de estatísticas profissionais contra a API DeepSeek.
 * Uso:  DEEPSEEK_API_KEY=... npx tsx scripts/test-pro-stats-real.ts <ficheiro> "<casa>" "<fora>" [equipa que submete] [esperado.json]
 * Compara o resultado com um ficheiro de valores esperados (formato da resposta do modelo, opcional).
 */
import { readFileSync } from "node:fs";
import { extractProStats, proStatsStatus } from "@/lib/match-docs/pro-stats-extract";
import { AiProStatsSchema, aiToProStats, STAT_KEYS, type ProStatsData } from "@/lib/match-docs/pro-stats-schema";
import { sniffImageMime } from "@/lib/game-sheet/image";

async function main() {
  const [file, home, away, team, expectedFile] = process.argv.slice(2);
  if (!file || !home || !away) throw new Error("uso: <ficheiro> <casa> <fora> [equipa] [esperado.json]");
  const buffer = readFileSync(file);
  const mime = sniffImageMime(buffer) ?? "image/jpeg";
  const r = await extractProStats({ buffer, mime, game: { home, away }, submittingTeam: team ?? null });
  if (!r.ok) { console.log(JSON.stringify({ ok: false, kind: r.kind, error: r.error, usage: r.usage }, null, 1)); process.exit(1); }
  const u = r.usage;
  console.log(`modelo=${u.model} chamadas=${u.calls.length} imagens=${u.images} texto_pdf=${u.usedTextLayer} 2ª=${u.secondPass} ${u.totalDurationMs}ms tokens=${u.promptTokens}p/${u.completionTokens}c`);
  console.log(`app=${r.data.app} final=${JSON.stringify(r.data.final)} confiança=${r.data.aiConfidence} estado=${proStatsStatus(r.data, r.issues)}`);
  console.log(`parciais=${r.data.periods.map((p) => `${p.home}-${p.away}`).join(" ")}`);
  for (const side of ["home", "away"] as const) {
    const t = r.data.teams[side];
    console.log(`${side}: ${t ? `${t.sheetName ?? "(sem nome)"} jogadores=${t.players.length} soTotais=${t.teamOnly} pts=${t.totals.pts}` : "—"}`);
  }
  console.log(`erros matemáticos: ${r.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" | ") || "nenhum"}`);
  if (r.data.warnings.length) console.log(`avisos: ${r.data.warnings.join(" | ")}`);

  if (expectedFile) {
    const exp: ProStatsData = aiToProStats(AiProStatsSchema.parse(JSON.parse(readFileSync(expectedFile, "utf8"))), { home, away });
    let cells = 0; const diffs: string[] = [];
    for (const side of ["home", "away"] as const) {
      const a = r.data.teams[side]; const e = exp.teams[side];
      if (!e) continue;
      if (!a) { diffs.push(`${side}: equipa em falta`); continue; }
      if (a.players.length !== e.players.length) diffs.push(`${side}: ${a.players.length} jogadores (esperado ${e.players.length})`);
      e.players.forEach((pe, i) => {
        const pa = a.players.find((x) => (pe.number !== null && x.number === pe.number) || x.name.toLowerCase() === pe.name.toLowerCase()) ?? a.players[i];
        if (!pa) { diffs.push(`${side}: falta ${pe.name}`); return; }
        for (const k of STAT_KEYS) {
          if (pe.stats[k] === null) continue;
          cells++;
          if (pa.stats[k] !== pe.stats[k]) diffs.push(`${pe.name}.${k}: lido ${pa.stats[k]} / certo ${pe.stats[k]}`);
        }
      });
      for (const k of STAT_KEYS) {
        if (e.totals[k] === null) continue;
        cells++;
        if (a.totals[k] !== e.totals[k]) diffs.push(`Totais ${side}.${k}: lido ${a.totals[k]} / certo ${e.totals[k]}`);
      }
    }
    exp.periods.forEach((p) => { cells += 2; const q = r.data.periods.find((x) => x.period === p.period); if (!q || q.home !== p.home || q.away !== p.away) diffs.push(`P${p.period}: lido ${q?.home}-${q?.away} / certo ${p.home}-${p.away}`); });
    console.log(`\nPRECISÃO: ${cells - diffs.length}/${cells} valores corretos (${((1 - diffs.length / Math.max(1, cells)) * 100).toFixed(1)}%)`);
    if (diffs.length) console.log(diffs.slice(0, 40).join("\n"));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
