# Prompt para colar no Claude Code (VS Code)

> Antes de correr: copia a pasta `design_handoff_gestor_estatisticas/` para dentro do repositório com o nome `design/`. Deve conter `Gestor Estatisticas Ao Vivo.dc.html`, `README.md` e `screenshots/`.

---

Vou redesenhar o ecrã de registo de estatísticas ao vivo de um jogo desta aplicação (rota tipo `/jogos/:id/live`).

**Contexto:** `design/Gestor Estatisticas Ao Vivo.dc.html` é um **protótipo de referência em HTML** — não é código para copiar. `design/README.md` tem a especificação completa: modelo de dados, regras de negócio, tokens de cor, tipografia e medidas. `design/screenshots/` tem as capturas dos três layouts em tema claro e escuro. Lê tudo antes de escrever código.

**Tarefa:** reimplementar o ecrã live no stack já existente deste projeto — mesmos componentes, router, gestão de estado e sistema de estilos que o resto da app. Não introduzas bibliotecas novas sem me perguntar.

**São três layouts alternáveis pelo utilizador durante o jogo**, via uma barra de preferências no topo:
1. **Jogador → ação** — layout **principal e predefinido**. Cards grandes dos 5 em campo; toca-se no jogador e depois na ação no painel à direita.
2. **Ação → jogador** — barra de ações fixa no topo; escolhe-se a ação e depois o jogador.
3. **Folha de jogo** — uma linha por jogador do plantel com botões inline; um toque = um registo.

A barra tem também alternância de **tema claro/escuro** (claro é o predefinido, para uso ao sol), um botão **ecrã cheio** e um botão **resumo estatístico**. Layout e tema são guardados por dispositivo (localStorage ou o mecanismo de preferências que a app já use) e restaurados no arranque. **Trocar de layout a meio do jogo não pode perder estado** — os três leem e escrevem no mesmo estado de jogo.

**Modo ecrã cheio:** esconde a sidebar de navegação e o cabeçalho da app, esconde a própria barra de preferências, reduz o padding do conteúdo e faz o painel de estatísticas ocupar 100% da largura (sem borda nem sombra). Usa a Fullscreen API (`requestFullscreen` / `exitFullscreen`) — **encadeia sempre `.catch()` nas duas chamadas**, porque devolvem Promises que rejeitam quando a política de permissões nega o fullscreen; o modo compacto deve funcionar mesmo nesse caso. Sincroniza o estado com o evento `fullscreenchange`. Sair com **Esc** ou com um botão "Sair do ecrã cheio" sempre visível, ao lado de um atalho para o resumo estatístico.

**Resumo estatístico:** botão acessível a qualquer momento (também em ecrã cheio) que abre um painel por cima do jogo, sem interromper o cronómetro nem perder estado; fecha com "Voltar ao jogo" ou **Esc**. Conteúdo: marcador e linha-resumo do adversário no topo; tabela com uma linha por jogador do plantel — pontos, 2P convertidos/tentados, 3P convertidos/tentados, lances livres convertidos/tentados, ressaltos ofensivos/defensivos, assistências, roubos, perdas, blocos, total de faltas e desdobramento por tipo (DEF·OF·TÉC·ANTI) — e uma linha final de **TOTAL EQUIPA**. Todos os valores derivados da lista de eventos (nada guardado em paralelo).

**Antes de começar:**
1. Explora o código atual do ecrã live e apresenta um plano curto: que ficheiros vais alterar, quais vais criar.
2. Confirma como as estatísticas são hoje persistidas (tabela / endpoint / store) — a mudança central é passar a guardar **eventos** em vez de contadores.
3. Só depois implementa, em passos pequenos, correndo o lint e a verificação de tipos do projeto. Se o esforço for grande, começa pelo layout 1 (Jogador → ação) plenamente funcional e só depois acrescenta os outros dois.

**A alteração estrutural mais importante:** o estado do jogo passa a ser uma **lista de eventos append-only**; todos os totais (pontos, ressaltos, assistências, faltas do jogador, faltas de equipa do período, marcador) são **derivados** dessa lista. É isto que permite apagar qualquer registo errado — não só o último — e recalcular tudo. Não guardes totais duplicados como fonte de verdade.

**Requisitos funcionais (todos obrigatórios, iguais nos três layouts):**
- Registo por jogador: +1 / +2 / +3 convertidos; falhados separados por 1P, 2P e 3P; ressalto ofensivo e defensivo; assistência; roubo de bola; perda de bola; bloco.
- Faltas com **tipo**, para as duas equipas: defensiva, ofensiva, técnica, antidesportiva.
- Faltas de equipa por período: contam defensiva, ofensiva e antidesportiva; a **técnica conta ao jogador mas não às faltas de equipa do período**.
- Equipa adversária: pontos +1/+2/+3, ressalto ofensivo/defensivo e as quatro faltas, sem registo individual por jogador.
- Substituições em dois toques, com limite rígido de 5 em campo; cada troca gera dois eventos ("entrou em campo" / "saiu para o banco").
- Linha temporal "Registado agora" sempre visível com os últimos registos, cada um com botão **×** que apaga esse evento e recalcula tudo.
- Cronómetro por período (10:00), iniciar/parar, avançar período (reinicia relógio e faltas de equipa do período).
- Alvos de toque com **mínimo 44px** de altura — o ecrã é usado num tablet no banco.
- Modo ecrã cheio e painel de resumo estatístico, conforme descrito acima, disponíveis nos três layouts.

Quando terminares, resume o que mudou e como testar um jogo de exemplo.

---
