# Handoff: Gestor de estatísticas ao vivo (redesenho)

## Visão geral
Redesenho do ecrã de registo de estatísticas durante um jogo de basquetebol (rota tipo `/jogos/:id/live`). Objetivos: registar mais rápido num tablet no banco, ver período/faltas de relance, perceber o que já foi registado e **corrigir qualquer erro** — não só o último.

## Sobre os ficheiros deste pacote
`Gestor Estatisticas Ao Vivo.dc.html` é uma **referência de design em HTML** — um protótipo funcional que mostra aparência e comportamento pretendidos. **Não é código de produção para copiar.** A tarefa é recriar estes ecrãs no ambiente já existente do projeto (React/Vue/etc.), usando os componentes, padrões e sistema de estilos que a app já tem. Se não existir ainda ambiente, escolher o framework mais adequado e implementar lá.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, estados e copy são finais. Recriar com precisão, mas usando as primitivas do codebase.

## As três variantes do protótipo
O ficheiro mostra três fluxos lado a lado, todos ligados ao mesmo estado de jogo:

- **1a — Jogador → ação**: grelha de cards dos 5 em campo; toca-se no jogador (fica selecionado) e depois na ação, num painel à direita.
- **1b — Ação → jogador**: barra de ações fixa no topo; escolhe-se a ação (fica ativa) e depois o jogador, numa fila de 5 cards.
- **1c — Folha de jogo (recomendada, é esta a implementar)**: uma linha por jogador do plantel com botões inline; **um toque = um registo**, sem seleção prévia. Inclui um seletor de "tipo de falta" acima da tabela que define o tipo aplicado pelo botão FALTA de cada linha.

## Modelo de dados — o ponto central
O estado do jogo é uma **lista de eventos append-only**. Todos os totais são derivados. É isto que permite apagar qualquer evento e recalcular.

```ts
type EventKind =
  // equipa da casa, sempre com playerNum
  | "make1" | "make2" | "make3"            // convertidos (1/2/3 pontos)
  | "miss1" | "miss2" | "miss3"            // falhados (lance livre / 2P / 3P)
  | "rebOf" | "rebDef"                     // ressaltos
  | "ast" | "stl" | "tov" | "blk"          // assistência, roubo, perda de bola, bloco
  | "foulDef" | "foulOf" | "foulTec" | "foulAnti"
  | "in" | "out"                           // substituições
  // adversário, sempre sem playerNum
  | "away"                                 // pontos do adversário (pts: 1|2|3)
  | "advRebOf" | "advRebDef"
  | "advFoulDef" | "advFoulOf" | "advFoulTec" | "advFoulAnti";

type GameEvent = {
  id: number;          // incremental, estável; usado para apagar
  kind: EventKind;
  playerNum: string | null;
  pts: number;         // 0 exceto make1/2/3 e away
  period: number;      // período em que ocorreu
  clock: string;       // "07:42" no momento do registo
};

type GameState = {
  events: GameEvent[];      // mais recente primeiro
  period: number;           // 1..n
  seconds: number;          // restantes no período (começa em 600)
  running: boolean;
  court: string[];          // números dos 5 em campo
  foulTypeSel: "Def"|"Of"|"Tec"|"Anti";  // seletor da folha 1c
  pendingIn: string | null; // jogador do banco à espera de troca
  theme: "light" | "dark";
};
```

### Derivações (função pura sobre `events`)
Percorrer os eventos por ordem cronológica:
- `pontos do jogador` += `pts` de `make1|make2|make3`
- `marcador casa` = soma de `pts` de make*; `marcador adversário` = soma de `pts` de `away`
- `ressaltos do jogador` += 1 em `rebOf|rebDef`; `assistências` em `ast`; `roubos` em `stl`; `perdas` em `tov`; `blocos` em `blk`; `falhados` em `miss*`
- `faltas do jogador` += 1 em qualquer `foul*`
- `faltas de equipa (casa) do período atual` += 1 em `foulDef|foulOf|foulAnti` **com `period === período atual`** — **`foulTec` não conta**
- `ressaltos do adversário` += 1 em `advRebOf|advRebDef`
- `faltas de equipa (adversário) do período atual` += 1 em `advFoulDef|advFoulOf|advFoulAnti` do período atual — `advFoulTec` não conta; guardar também o total de faltas do adversário no jogo
- `marcador ao lado de cada evento da linha temporal` = marcador acumulado até esse evento (inclusive)

### Regras
- **Apagar**: `events.filter(e => e.id !== id)` e recalcular. Qualquer evento, em qualquer posição.
- **Substituição**: máximo 5 em campo, garantido pela lógica.
  - Campo com <5: toque num jogador do banco → entra (evento `in`).
  - Campo cheio: toque no banco → marca `pendingIn` (chip fica destacado, cards em campo ficam com contorno tracejado); toque seguinte num jogador em campo → gera `in` (do pendente) + `out` (do que sai) e limpa `pendingIn`.
  - Enquanto `pendingIn` está ativo, o toque num card em campo faz a troca em vez de selecionar/registar.
- **Período +**: `period++`, `seconds = 600`, `running = false`. As faltas de equipa do período reiniciam por serem derivadas do período atual.
- **Cronómetro**: decrementa 1s enquanto `running` e `seconds > 0`.

## Layout da variante 1c (a implementar)
Largura de referência 1180px (tablet landscape), `padding: 20px`, colunas empilhadas com `gap: 14px`. Tudo em flex/grid com `gap`.

1. **Barra de marcador** (`--panel`, borda `--line`, radius 16px, padding 12px 18px, flex, gap 18px):
   - marcador `"12 : 9"` em mono 48px/700
   - bloco de texto: "PÓVOA · PT" e "ADV. RES n · FALTAS n/5" (11px/800, `letter-spacing: .1em`, `--muted`)
   - divisor vertical 1px `--line`
   - período ("1º PERÍODO", 11px/800) + relógio mono 40px/700; botão **Iniciar/Parar** (46px alto, `--accent`, texto `--accentInk`) e **Período +** (46px, contorno `--line`)
   - à direita: "FALTAS DE EQUIPA n/5" + 5 pips 30×12px radius 6px (preenchidos `--accent`, ou `--danger` a partir de 4; vazios `--dim`)
2. **Barra do adversário** (mesmo painel, flex wrap, `align-items: flex-end`, gap 16px): título "ADVERSÁRIO · PT" (12px/800) + "n no jogo · sem registo individual"; grupo PONTOS (+1/+2/+3, 48×46px); grupo RESSALTOS (RES OF. / RES DEF., min-width 92px, 46px alto); grupo FALTAS DO ADVERSÁRIO (DEFENSIVA / OFENSIVA / TÉCNICA / ANTIDESP., min-width 104px, 46px, estilo danger); pips de faltas de equipa à direita.
3. **Seletor de tipo de falta**: rótulo "TIPO DE FALTA A REGISTAR NA FOLHA" + 4 botões (44px alto, padding 0 16px). Ativo: fundo `--danger`, texto `--bg`. Inativo: `--chip` + borda `--line`.
4. **Cabeçalho da tabela e linhas** — grid idêntico nos dois:
   `grid-template-columns: 196px repeat(3, 0.85fr) 1.5fr 0.95fr 0.95fr 0.95fr 70px; gap: 8px`
   Colunas: JOGADOR · 1 PONTO · 2 PONTOS · 3 PONTOS · FALHOU 1P/2P/3P · RESSALTO · ASSIST. · FALTA \<tipo\> · TOTAL.
   Cada linha (radius 14px, padding 8px): em campo → `--panel` + borda 1px `--line`; no banco → fundo transparente, borda tracejada `--line`, `opacity: .72`.
   - célula JOGADOR: número mono 22px/700 `--muted`, nome 15px/700, e um **chip clicável** "EM CAMPO ↓" / "BANCO ↑" (10px/800, radius 999px, padding 5px 10px) que faz a substituição
   - botões +1/+2/+3: 52px alto, radius 10px, 17px/800, fundo `--accentSoft`, borda `--accent`, texto `--accent`
   - coluna FALHOU: três botões ✕1 / ✕2 / ✕3 (flex:1, gap 4px, 52px alto, `--chip` + `--line`)
   - RESSALTO / ASSIST.: botão neutro 52px com contador embutido ("RES 3", "AST 1")
   - FALTA: botão 52px estilo danger com contador ("F 2")
   - TOTAL: pontos em mono 24px/700, alinhado à direita
5. **Linha temporal "REGISTADO AGORA · n registos"** (painel, radius 16px): últimos 4 eventos, cada um com hora mono 12px (min-width 70px), texto 14px/700 ("#11 Diogo Faria · Falta técnica"), marcador acumulado à direita e botão **×** 34×34px (radius 9px, `--dangerSoft` + borda `--danger`).

## Tokens
Aplicados como CSS custom properties no contentor do ecrã; trocar o conjunto muda o tema. Claro é o predefinido.

**Claro**
```
--bg: oklch(0.965 0.006 250);  --panel: oklch(1 0 0);        --line: oklch(0.88 0.008 250);
--text: oklch(0.24 0.02 250);  --muted: oklch(0.5 0.015 250); --chip: oklch(0.95 0.006 250);
--accent: oklch(0.5 0.14 150); --accentSoft: oklch(0.95 0.045 150); --accentInk: oklch(1 0 0);
--danger: oklch(0.53 0.19 25); --dangerSoft: oklch(0.955 0.04 25); --dim: oklch(0.86 0.008 250);
```
**Escuro**
```
--bg: oklch(0.17 0.012 250);   --panel: oklch(0.22 0.014 250); --line: oklch(0.33 0.014 250);
--text: oklch(0.97 0.005 250); --muted: oklch(0.73 0.01 250);  --chip: oklch(0.27 0.014 250);
--accent: oklch(0.8 0.17 150); --accentSoft: oklch(0.33 0.075 150); --accentInk: oklch(0.16 0.02 150);
--danger: oklch(0.72 0.16 25); --dangerSoft: oklch(0.32 0.08 25);  --dim: oklch(0.3 0.014 250);
```

**Tipografia**: `Archivo` (400/500/600/700/800) para interface; `IBM Plex Mono` (500/600/700) para números — marcador, relógio, dorsais, totais e horas. Rótulos de secção: 10–12px, `font-weight: 800`, `letter-spacing: .1–.12em`, maiúsculas, cor `--muted`.

**Medidas**: radius 10px (botões), 14px (linhas/cards), 16px (painéis), 999px (chips). Gaps 4/6/8/10/14/16px. Altura mínima de qualquer alvo tocável: **44px** (a maioria tem 46–52px).

## Copy (exata)
Rótulos: "EM CAMPO", "BANCO", "ADVERSÁRIO · PT", "TIPO DE FALTA A REGISTAR NA FOLHA", "REGISTADO AGORA · n registos", "FALTAS DE EQUIPA n/5", "Toca no × para apagar qualquer registo".
Ações: `+1 +2 +3`, `✕1 ✕2 ✕3`, `RES OF.`, `RES DEF.`, `ASSIST.`, `ROUBO`, `PERDA DE BOLA`, `BLOCO`, `F. DEF.`, `F. OF.`, `TÉCNICA`, `ANTIDESP.`.
Nomes na linha temporal: "Cesto de 2", "Cesto de 3", "Lance livre convertido", "Lance livre falhado", "Lançamento de 2 falhado", "Lançamento de 3 falhado", "Ressalto ofensivo", "Ressalto defensivo", "Assistência", "Roubo de bola", "Perda de bola", "Bloco", "Falta defensiva", "Falta ofensiva", "Falta técnica", "Falta antidesportiva", "Entrou em campo", "Saiu para o banco". Eventos do adversário aparecem como "Adversário · \<nome\>".

## Assets
Nenhum. Sem ícones externos: setas (↑ ↓), × e ✕ são texto.

## Ficheiros
- `Gestor Estatisticas Ao Vivo.dc.html` — protótipo com as três variantes, tema claro/escuro e lógica completa (derivação de eventos, substituições, apagar registos).
- `PROMPT.md` — prompt pronto a colar no Claude Code.
