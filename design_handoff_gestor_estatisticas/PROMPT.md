# Prompt para colar no Claude Code (VS Code)

> Copia tudo a partir da linha abaixo. Coloca `Gestor Estatisticas Ao Vivo.dc.html` e `README.md` (desta pasta) na raiz do repositório ou numa pasta `design/`, para o Claude os poder ler.

---

Vou redesenhar o ecrã de registo de estatísticas ao vivo de um jogo (`/jogos/:id/live`) desta aplicação.

**Contexto:** o ficheiro `design/Gestor Estatisticas Ao Vivo.dc.html` é um **protótipo de referência em HTML** (não é código para copiar). O `design/README.md` tem a especificação completa: modelo de dados, regras de negócio, tokens de cor, tipografia e medidas. Em `design/screenshots/` estão as capturas — `1c-folha-de-jogo-claro.png` é a referência visual principal. Lê tudo antes de escrever código.

**Tarefa:** reimplementar o ecrã live no stack já existente deste projeto (mesmos componentes, router, estado, estilos e convenções que o resto da app — não introduzas bibliotecas novas sem me perguntar). O protótipo tem três variantes lado a lado; implementa a variante **1c "Folha de jogo"** (uma linha por jogador, um toque = um registo). As 1a e 1b ficam documentadas como alternativas — ignora-as por agora.

**Antes de começar:**
1. Explora o código atual do ecrã live e diz-me que ficheiros vais alterar e quais vais criar, com um plano curto.
2. Confirma como as estatísticas são hoje persistidas (tabela/endpoint/store) — a mudança central é passar a guardar **eventos** em vez de contadores.
3. Só depois implementa, em passos pequenos, e corre o lint/tipos do projeto.

**A alteração estrutural mais importante:** o estado do jogo passa a ser uma **lista de eventos append-only**; todos os totais (pontos, ressaltos, assistências, faltas de jogador, faltas de equipa do período, marcador) são **derivados** dessa lista. Isto é o que permite apagar qualquer registo errado, não só o último, e recalcular tudo. Não guardes totais duplicados como fonte de verdade.

**Requisitos funcionais (todos obrigatórios):**
- Registo por jogador: +1 / +2 / +3 convertidos; falhados separados por 1P, 2P e 3P; ressalto ofensivo e defensivo; assistência; roubo de bola; perda de bola; bloco.
- Faltas com **tipo**, para as duas equipas: defensiva, ofensiva, técnica, antidesportiva.
- Faltas de equipa por período: contam defensiva, ofensiva e antidesportiva; a **técnica conta ao jogador mas não às faltas de equipa do período**.
- Equipa adversária: pontos +1/+2/+3, ressalto ofensivo/defensivo e as quatro faltas, sem registo individual por jogador.
- Substituições em dois toques, com limite rígido de 5 em campo; cada troca gera dois eventos ("entrou em campo" / "saiu para o banco").
- Linha temporal "Registado agora" sempre visível com os últimos registos, cada um com botão **×** que apaga esse evento e recalcula tudo.
- Cronómetro por período (10:00), iniciar/parar, avançar período (reinicia relógio e faltas de equipa do período).
- Tema claro e escuro com alternância; o claro é o predefinido (uso ao sol).
- Alvos de toque com **mínimo 44px** de altura — o ecrã é usado num tablet no banco.

Quando terminares, resume o que mudou e como testar um jogo de exemplo.

---
