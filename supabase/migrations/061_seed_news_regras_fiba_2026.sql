-- Notícias: Novas Regras FIBA 2026 (em vigor desde 1 de outubro de 2026)
-- 6 artigos sobre as alterações ao regulamento técnico de basquetebol

INSERT INTO public.news (slug, title, excerpt, body, category, published_at, is_published, is_featured) VALUES

(
  'novas-regras-basquetebol-2026',
  'Novas regras de basquetebol em vigor desde 1 de outubro de 2026',
  'A FIBA publicou um novo regulamento técnico com quatro objetivos principais: jogo mais fluido, maior segurança dos atletas, melhor consistência da arbitragem e combate ao anti-jogo.',
  $BODY1$
A Federação Internacional de Basquetebol (FIBA) publicou um novo regulamento técnico que entrou em vigor a 1 de outubro de 2026. As alterações abrangem a estrutura das faltas, a proteção dos atletas e os critérios de arbitragem, com o objetivo de tornar o jogo mais justo, fluido e seguro.

## Objetivos das novas regras

A FIBA identificou quatro grandes metas para esta revisão:

- **Jogo mais fluido** — eliminar paragens desnecessárias que interrompem o ritmo da partida.
- **Maior segurança dos atletas** — punir de forma mais severa os contactos excessivos, perigosos e que não constituem ações legítimas de basquetebol.
- **Melhor consistência da arbitragem** — critérios mais claros e universais reduzem a margem de interpretação subjetiva.
- **Combate ao anti-jogo** — medidas diretas contra flops e faltas táticas.

## O que muda na prática

Na prática, os jogadores e os treinadores vão notar menos interrupções táticas, maior proteção para os atletas, critérios mais objetivos para a classificação de faltas e penalizações mais consistentes de jogo para jogo.

## Leia mais

- [O fim da falta antidesportiva: nascem a Falta Disruptiva e a Falta Flagrante](/noticias/falta-disruptiva-falta-flagrante)
- [Faltas técnicas passam a ter duas categorias — e o flop é punido](/noticias/faltas-tecnicas-duas-categorias-flop)
- [Quando é que um jogador é desqualificado? A matriz de penalizações](/noticias/desqualificacao-matriz-penalizacoes)
- [Novo conceito de ato de lançamento](/noticias/novo-conceito-ato-de-lancamento)
- [IRS, boletim de jogo e novos sinais de arbitragem](/noticias/irs-boletim-jogo-sinais-arbitragem)

*Fonte: CAD/ABP — Novas Regras para o Basquetebol*
$BODY1$,
  'Regras', '2026-10-01 00:00:00+00', true, true
),

(
  'falta-disruptiva-falta-flagrante',
  'O fim da falta antidesportiva: nascem a Falta Disruptiva e a Falta Flagrante',
  'O conceito de falta antidesportiva desaparece e divide-se em duas categorias — Disruptiva (DI) e Flagrante (FL). A intenção da falta determina a classificação e a penalização.',
  $BODY2$
Uma das mudanças mais significativas do novo regulamento é o desaparecimento da categoria «falta antidesportiva». No lugar de uma única classificação, surgem agora dois tipos distintos: a **Falta Disruptiva (DI)** e a **Falta Flagrante (FL)**. O critério de separação é a intenção da falta.

## Falta Disruptiva (DI)

A Falta Disruptiva é uma falta tática cujo único propósito é interromper o jogo. Exemplos típicos incluem parar um contra-ataque de forma propositada ou fazer falta deliberadamente nos segundos finais de um quarto.

**Penalização:** 2 lances livres e posse de bola para a equipa adversária.

**Importante:** a Falta Disruptiva **não conta** para a desqualificação por acumulação.

## Falta Flagrante (FL)

A Falta Flagrante engloba situações mais graves:

- Ação que não é legítima de basquetebol, com ou sem bola.
- Contacto imprudente, violento ou perigoso.
- Contacto excessivo num esforço de jogar a bola ou o oponente.

**Penalização:** 2 lances livres e posse de bola para a equipa adversária.

**Importante:** a Falta Flagrante **conta** para a desqualificação por acumulação.

*Fonte: CAD/ABP — Novas Regras para o Basquetebol*
$BODY2$,
  'Regras', '2026-10-02 09:00:00+00', true, false
),

(
  'faltas-tecnicas-duas-categorias-flop',
  'Faltas técnicas passam a ter duas categorias — e o flop é punido',
  'As Faltas Técnicas dividem-se agora em Categoria 1 (comportamento) e Categoria 2 (administrativo), com impactos diferentes na desqualificação. A simulação de falta é expressamente punida.',
  $BODY3$
As Faltas Técnicas (FT) passam a estar divididas em duas categorias — uma focada no comportamento e outra em aspetos administrativos —, com consequências diferentes em termos de desqualificação. O flop, a simulação de falta, é agora explicitamente punido.

## Falta Técnica de Categoria 1 — Comportamento

Esta categoria abrange ações como provocações, desrespeito aos árbitros e gestos ofensivos. A penalização é de **1 lance livre** e a falta **conta** para a desqualificação por acumulação.

## Falta Técnica de Categoria 2 — Administrativo

A segunda categoria engloba infrações de ordem administrativa: pendurar-se no aro sem necessidade, atrasar reposições de bola ou demorar a reiniciar o jogo após uma interrupção. A penalização é também de **1 lance livre**, mas a falta **não conta** para a desqualificação.

## Flop punido como Falta Técnica de Categoria 1

A simulação de falta — o «flop» — passa a ser classificada estritamente como Falta Técnica de Categoria 1. Esta decisão reflete a intenção da FIBA de combater diretamente o anti-jogo e de tornar a arbitragem mais objetiva.

*Fonte: CAD/ABP — Novas Regras para o Basquetebol*
$BODY3$,
  'Regras', '2026-10-03 09:00:00+00', true, false
),

(
  'desqualificacao-matriz-penalizacoes',
  'Quando é que um jogador é desqualificado? A matriz de penalizações',
  'Com as novas categorias de faltas, a desqualificação por acumulação segue uma matriz precisa. Conheça as combinações que levam à expulsão imediata.',
  $BODY4$
Com a introdução das Faltas Disruptiva (DI) e Flagrante (FL) e a divisão das Faltas Técnicas em duas categorias, a desqualificação por acumulação passa a seguir uma matriz clara. Saber que combinações levam à expulsão imediata é fundamental para jogadores, treinadores e árbitros.

## Tabela de penalizações

| Tipo de falta | Penalização | Conta para desqualificação? |
|---|---|---|
| Disruptiva (DI) | 2 LL + Posse | Não |
| Flagrante (FL) | 2 LL + Posse | Sim |
| Técnica Cat. 1 | 1 LL | Sim |
| Técnica Cat. 2 | 1 LL | Não |

## Combinações que levam à desqualificação imediata

A desqualificação por acumulação acontece de imediato com qualquer uma destas combinações:

- **Técnica Cat. 1 + Técnica Cat. 1** — duas Faltas Técnicas de Categoria 1
- **Flagrante + Flagrante** — duas Faltas Flagrantes
- **Técnica Cat. 1 + Flagrante** — uma Falta Técnica de Categoria 1 e uma Falta Flagrante

A Falta Disruptiva (DI) e a Falta Técnica de Categoria 2 não contribuem para nenhuma destas combinações.

*Fonte: CAD/ABP — Novas Regras para o Basquetebol*
$BODY4$,
  'Regras', '2026-10-04 09:00:00+00', true, false
),

(
  'novo-conceito-ato-de-lancamento',
  'Novo conceito de ato de lançamento',
  'O regulamento de 2026 clarifica quando um contacto ocorre durante um ato de lançamento, através de um fluxograma de decisão com três passos.',
  $BODY5$
O novo regulamento clarifica quando um contacto sobre um jogador ocorre durante um «ato de lançamento». A definição tem implicações diretas nas decisões de arbitragem, nomeadamente na concessão de lances livres.

## Fluxograma de decisão

Partindo do princípio de que o jogador sofreu contacto, a análise segue esta sequência:

**Passo 1.** Após o contacto, o jogador passou a bola ou desviou o movimento em direção ao cesto?

- **Sim** — Não é ato de lançamento. A falta é classificada de outra forma.
- **Não** — Avança para o passo 2.

**Passo 2.** O lançamento foi efetuado atrás da linha de meio-campo?

- **Sim** — Avança para o passo 3.
- **Não** — Não é ato de lançamento.

**Passo 3.** Era o final do tempo do quarto ou o final dos 14 ou 24 segundos de ataque?

- **Sim** — **É ato de lançamento** (exceção de final de tempo). São concedidos lances livres.
- **Não** — Não é ato de lançamento.

Esta sequência de análise procura reduzir a subjetividade nas situações de final de tempo, garantindo critérios uniformes para todos os árbitros.

*Fonte: CAD/ABP — Novas Regras para o Basquetebol*
$BODY5$,
  'Regras', '2026-10-05 09:00:00+00', true, false
),

(
  'irs-boletim-jogo-sinais-arbitragem',
  'IRS, boletim de jogo e novos sinais de arbitragem',
  'O Sistema de Repetição Imediata ganha novas funções, os códigos do boletim de jogo são atualizados e entram em vigor sinais de arbitragem específicos para as novas categorias de faltas.',
  $BODY6$
O pacote de alterações de 2026 também introduz clarificações sobre o uso do Sistema de Repetição Imediata (IRS), as anotações no boletim de jogo e os sinais de arbitragem.

## IRS — Sistema de Repetição Imediata

Onde estiver disponível, o IRS pode ser utilizado em três situações:

- **Classificação de faltas** — em qualquer situação, para classificar corretamente uma falta como pessoal, disruptiva, flagrante ou desqualificante.
- **Correção de tempo** — para corrigir erros no cronómetro de jogo e no cronómetro de posse de bola.
- **Interferência** — para analisar interferência no cesto após uma falta já assinalada sobre um jogador em ato de lançamento.

## Registo no boletim de jogo

| Código | Significado |
|---|---|
| FL | Falta Flagrante — Jogador |
| T | Falta Técnica Cat. 1 — Jogador |
| C/B | Falta Técnica Cat. 1 — Treinador/Banco |
| BD | Falta Técnica Cat. 1 Desqualificante — Enquadramento Humano |
| DI | Falta Disruptiva — Jogador |

## Novos sinais de arbitragem

Foram introduzidos sinais específicos para as novas categorias de faltas: Atraso de Jogo, Falta Disruptiva e Falta Flagrante. A descrição dos gestos físicos é matéria de formação de árbitros.

*Fonte: CAD/ABP — Novas Regras para o Basquetebol*
$BODY6$,
  'Regras', '2026-10-06 09:00:00+00', true, false
);
