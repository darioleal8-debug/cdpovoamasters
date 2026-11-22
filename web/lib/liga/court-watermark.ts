import sharp from "sharp";

/**
 * Marca de água do campo de basquetebol (marcações FIBA, 28 × 15 m) para o fundo das capas de
 * notícias geradas sem fotografia. É só geometria SVG (sem texto nem imagens externas), por isso
 * renderiza igual no librsvg do Vercel.
 */

const COURT_L = 28; // comprimento (m)
const COURT_W = 15; // largura (m)
const BASKET_X = 1.575; // centro do cesto, medido a partir da linha de fundo
const KEY_W = 4.9; // largura da zona restritiva
const FT_DIST = 5.8; // linha de lance livre, a partir da linha de fundo
const CIRCLE_R = 1.8; // círculo central e de lance livre
const RESTRICTED_R = 1.25; // semicírculo debaixo do cesto
const THREE_R = 6.75; // raio da linha de 3 pontos
const THREE_SIDE = 0.9; // distância das retas de 3 pontos às linhas laterais

/** Marcações de uma metade do campo, com o cesto à esquerda (x em metros). */
function halfCourtPaths(): string {
  const mid = COURT_W / 2;
  const keyTop = mid - KEY_W / 2;
  const keyBottom = mid + KEY_W / 2;

  // Onde o arco de 3 pontos encontra as retas laterais
  const dy = mid - THREE_SIDE;
  const arcX = BASKET_X + Math.sqrt(THREE_R ** 2 - dy ** 2);
  const yTop = THREE_SIDE;
  const yBottom = COURT_W - THREE_SIDE;

  const f = (n: number) => n.toFixed(3);
  return [
    // zona restritiva (garrafão)
    `M0 ${f(keyTop)} H${FT_DIST} V${f(keyBottom)} H0`,
    // lance livre: meio círculo exterior contínuo
    `M${FT_DIST} ${f(mid - CIRCLE_R)} A${CIRCLE_R} ${CIRCLE_R} 0 0 1 ${FT_DIST} ${f(mid + CIRCLE_R)}`,
    // linha de 3 pontos
    `M0 ${f(yTop)} H${f(arcX)} A${THREE_R} ${THREE_R} 0 0 1 ${f(arcX)} ${f(yBottom)} H0`,
    // semicírculo da zona sem carga
    `M${BASKET_X} ${f(mid - RESTRICTED_R)} A${RESTRICTED_R} ${RESTRICTED_R} 0 0 1 ${BASKET_X} ${f(mid + RESTRICTED_R)} H1.2 V${f(mid - RESTRICTED_R)} Z`,
    // tabela
    `M1.2 ${f(mid - 0.9)} V${f(mid + 0.9)}`,
    // aro
    `M${f(BASKET_X + 0.225)} ${f(mid)} A0.225 0.225 0 1 1 ${f(BASKET_X - 0.225)} ${f(mid)} A0.225 0.225 0 1 1 ${f(BASKET_X + 0.225)} ${f(mid)}`,
  ].join(" ");
}

/** Meio círculo interior do lance livre (tracejado). */
function halfCourtDashed(): string {
  const mid = COURT_W / 2;
  return `M${FT_DIST} ${(mid - CIRCLE_R).toFixed(3)} A${CIRCLE_R} ${CIRCLE_R} 0 0 0 ${FT_DIST} ${(mid + CIRCLE_R).toFixed(3)}`;
}

/**
 * SVG do campo inteiro, centrado e a ocupar a largura útil de `w × h`, em linhas brancas
 * com a opacidade pedida.
 */
export function courtWatermarkSvg(w: number, h: number, opacity = 0.26): Buffer {
  const margin = 60;
  const scale = Math.min((w - 2 * margin) / COURT_L, (h - 2 * margin) / COURT_W);
  const x0 = (w - COURT_L * scale) / 2;
  const y0 = (h - COURT_W * scale) / 2;
  const sw = 0.1; // espessura das linhas (m)
  const half = halfCourtPaths();
  const dashed = halfCourtDashed();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <g transform="translate(${x0.toFixed(2)} ${y0.toFixed(2)}) scale(${scale.toFixed(4)})"
     fill="none" stroke="#FFFFFF" stroke-width="${sw}" stroke-linejoin="round" opacity="${opacity}">
    <rect x="0" y="0" width="${COURT_L}" height="${COURT_W}"/>
    <path d="M${COURT_L / 2} 0 V${COURT_W}"/>
    <circle cx="${COURT_L / 2}" cy="${COURT_W / 2}" r="${CIRCLE_R}"/>
    <path d="${half}"/>
    <path d="${dashed}" stroke-dasharray="0.25 0.2"/>
    <path d="${half}" transform="translate(${COURT_L} 0) scale(-1 1)"/>
    <path d="${dashed}" stroke-dasharray="0.25 0.2" transform="translate(${COURT_L} 0) scale(-1 1)"/>
  </g>
</svg>`;
  return Buffer.from(svg);
}

/** Fundo das capas sem fotografia: azul-escuro liso com o campo em marca de água. */
export async function coverBackground(w = 1600, h = 900, color = "#0B1626"): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .composite([{ input: courtWatermarkSvg(w, h), blend: "over" }])
    .png()
    .toBuffer();
}
