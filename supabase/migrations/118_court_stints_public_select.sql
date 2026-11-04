-- Tempo jogado visível na página pública do live (/live/[id]) e para os
-- jogadores: leitura aberta dos stints em campo (dados de jogo, sem dados
-- pessoais), tal como game_sessions / player_game_stats / play_by_play (051).
-- Escrita continua restrita a is_trainer_or_above() (p1_player_court_stints).
GRANT SELECT ON public.player_court_stints TO anon;
DROP POLICY IF EXISTS "p1_player_court_stints_select" ON public.player_court_stints;
CREATE POLICY "p1_player_court_stints_select" ON public.player_court_stints
  FOR SELECT USING (true);
