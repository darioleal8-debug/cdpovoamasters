# Importação inteligente do boletim de jogo (IA)

O delegado de uma equipa da Liga INATEL fotografa a folha oficial (modelo FIBA). O HoopHub lê-a
com o DeepSeek, reconstrói a marcha do resultado, atribui pontos e calcula estatísticas, valida
tudo matematicamente e mostra uma página de revisão. Nada é publicado sem confirmação humana.

## Arquitetura (três componentes separados)

| Componente | Onde | Responsabilidade |
|---|---|---|
| Visão e interpretação | `web/lib/game-sheet/vision.ts`, `prompt.ts`, `image.ts` | Pré-processa a imagem (EXIF, contraste, nitidez), envia-a ao DeepSeek, valida a resposta contra o esquema e faz no máximo uma 2.ª leitura das regiões duvidosas |
| Motor estatístico | `web/lib/game-sheet/engine.ts`, `schema.ts` | Código determinístico: o valor de cada lançamento é a diferença entre acumulados; atribuição só com evidência compatível; validações; estatísticas individuais e coletivas |
| Publicação | rotas `app/api/liga/equipa/game-sheet/imports/*`, página `/liga-inatel/boletim/[id]`, aprovação `app/api/liga/admin/submissions/[id]` + função `liga_apply_game_sheet` | Revisão e correção, confirmação pelo delegado, aprovação atómica pelo admin da liga, notícia |

A resposta do modelo é sempre dado não fiável. Totais por jogador calculados pelo modelo nunca
são usados: o servidor recalcula tudo a partir dos eventos ao guardar, confirmar e aprovar.

## Fluxo

1. **Delegado** → `/liga-inatel/equipa` → «Importar boletim de jogo com IA» → escolhe o jogo → fotografia.
2. `POST /api/liga/equipa/game-sheet/imports` verifica a sessão, se o jogo é da equipa, o tipo real
   do ficheiro (magic bytes) e o tamanho (≤ 15 MB). Guarda a imagem no bucket privado `folhas-jogo`
   e corre a análise. Estado: `needs_review` / `ready_to_confirm` / `failed`.
3. **Revisão** (`/liga-inatel/boletim/[id]`): imagem e dados lado a lado (separadores no telemóvel),
   marcha do resultado editável, jogadores, parciais, validação em linguagem simples e histórico de
   correções. Cada alteração recalcula de imediato; o servidor recalcula ao guardar.
4. **Confirmar** → cria/atualiza a submissão pendente (`result_submissions`, com `import_id`). Estado `confirmed`.
   - Erros (ex.: parciais ≠ final, final em falta, marcha acima do final) **bloqueiam**.
   - Avisos (ex.: leitura duvidosa, jogador fora do plantel) exigem reconhecimento explícito; esses pontos ficam «por atribuir».
5. **Admin da liga** aprova em `/liga-inatel/admin` (link «Ver boletim importado»). A função
   `liga_apply_game_sheet` grava numa só transação: resultado, parciais, estatísticas por jogador,
   marcha, pontos por atribuir, estado `published` e auditoria. Depois gera a notícia (fluxo existente).

Jogos de teste: o resultado é gravado sem `competition_id` e não entra na classificação, e não é gerada notícia.

Reimportar a mesma imagem devolve o rascunho existente (idempotência por SHA-256). Reaprovar substitui
os dados do jogo, sem duplicar, e fica auditado com o valor antigo. Para alterar um resultado já
publicado, importa-se novamente o boletim; a nova submissão substitui a anterior quando é aprovada.

## Notícia

`lib/liga/generate-news.ts` recebe **factos verificados** (`lib/game-sheet/news-facts.ts`): resultado,
evolução por período, maior parcial, reviravolta (só se os parciais a demonstrarem), marcadores
confirmados e pontos por atribuir. Se o texto citar pontuações que não constam dos factos, é gerado
de novo uma vez; se voltar a falhar, a notícia não é gravada e o admin pode regenerá-la.
A publicação mantém o comportamento existente: a notícia é publicada quando o admin aprova o resultado.

## Base de dados — migração `supabase/migrations/111_game_sheet_imports.sql`

- `game_sheet_imports` (novo): estado, imagem (caminho privado + SHA-256), `sheet_data`, `validation`,
  `extraction_raw` (já validado), `ai_usage` (duração, tokens, chamadas), `corrections`, `analysis_count`,
  `confirmed_by/at`. RLS: só a equipa dona e os admins da liga; o delegado não pode marcar `published`.
  Índices únicos: uma análise `processing` por jogo; mesma imagem/jogo.
- `result_submissions.import_id` e a política `rs_update_own_pending_delegate` (o delegado atualiza a sua submissão pendente).
- `league_game_player_stats`: `dois_pontos`, `pontos_periodo`, `player_id`, `source`.
- `league_game_results`: `home/away_unattributed_points`, `stats_completeness`.
- `league_game_scoring_events` (novo, leitura pública): a marcha validada.
- `liga_apply_game_sheet(submission, motivo, payload)`: SECURITY DEFINER; verifica `is_liga_admin()`.

Testes da migração num Postgres efémero: `bash supabase/tests/run-game-sheet.sh` (também corre no CI).
Rollback manual: `supabase/rollbacks/111_game_sheet_imports.sql`.

## Deployment

1. **Aplicar a migração 111 antes do deploy do código.** A aprovação de resultados passa a usar `liga_apply_game_sheet`; sem a migração, aprovar falha.
2. Variáveis na Vercel (ver `web/.env.example`):
   - `DEEPSEEK_API_KEY` (obrigatória).
   - `DEEPSEEK_VISION_MODEL`: modelo **com visão**. Por omissão `deepseek-flash`, o mesmo que o scan antigo já usava. Se o modelo não aceitar imagens, a importação devolve um erro claro; nunca troca de modelo em silêncio.
   - Opcionais: `GAME_SHEET_SECOND_PASS`, `GAME_SHEET_MAX_ANALYSES`, `GAME_SHEET_MAX_IMPORTS_PER_HOUR`, `GAME_SHEET_MAX_OUTPUT_TOKENS`, `GAME_SHEET_TIME_BUDGET_MS`.
3. Verificar o modelo no ambiente real:
   `cd web && DEEPSEEK_API_KEY=… DEEPSEEK_VISION_MODEL=… node scripts/check-deepseek-vision.mjs folha.jpg`

## Teste no ambiente real (caso de referência)

Jogo do campeonato distrital: PowerTogether 53–55 Matosinhos Basket.

1. Com uma conta de delegado, importar a fotografia da folha desse jogo.
2. Confirmar os parciais 21–15, 11–11, 15–12, 6–17 e o final 53–55 («Soma» = «Final», sem erros).
3. Rever a marcha: corrigir números/tipos duvidosos e confirmar (✓). Os pontos por atribuir devem descer.
4. Confirmar e, como admin da liga, aprovar. A página pública do jogo mostra os parciais e os marcadores
   confirmados. A notícia refere a recuperação do Matosinhos no 4.º período (17–6), porque os parciais a demonstram.

## Limitações conhecidas

- Não há correção de perspetiva nem deteção automática de inclinação: só a orientação EXIF é corrigida.
  O modelo de visão lê a fotografia tal como está e a interface dá dicas de enquadramento.
- As regiões da imagem (destaque ao clicar numa marcação) são aproximações devolvidas pelo modelo.
- A folha FIBA não regista a ordem dos cestos entre equipas dentro de um período: não se calculam
  trocas de liderança nem corridas dentro de um período.
- Tentativas falhadas, ressaltos, assistências, minutos, etc. não constam do boletim e não são calculados.
- A associação a jogadores HoopHub (`player_id`) só é feita para o clube dono da plataforma
  (`league_teams.is_our_team`), e só quando o número e o nome coincidem de forma inequívoca.
- PDFs continuam a usar o fluxo antigo (`/game-sheet/scan`); a importação inteligente aceita JPEG, PNG e WebP.
  HEIC é convertido no browser.
- A análise é síncrona (≤ 60 s, `maxDuration`). Folhas muito densas podem exigir mais tokens: ver `GAME_SHEET_MAX_OUTPUT_TOKENS`.
