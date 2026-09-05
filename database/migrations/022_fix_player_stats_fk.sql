-- =========================================================
-- MIGRAÇÃO 022: Corrigir FK em tabelas de estatísticas
-- player_id deixa de referenciar public.users e passa a
-- referenciar public.players, permitindo jogadores sem conta.
-- =========================================================
-- Aplicar em: Supabase Dashboard > SQL Editor > New Query
-- =========================================================

-- ─── 1. Remover FK antigas (→ public.users) ───────────────
ALTER TABLE public.player_game_stats
  DROP CONSTRAINT IF EXISTS player_game_stats_player_id_fkey;

ALTER TABLE public.player_court_stints
  DROP CONSTRAINT IF EXISTS player_court_stints_player_id_fkey;

ALTER TABLE public.play_by_play
  DROP CONSTRAINT IF EXISTS play_by_play_player_id_fkey;

ALTER TABLE public.play_by_play
  DROP CONSTRAINT IF EXISTS play_by_play_secondary_player_id_fkey;

-- ─── 2. Adicionar FK novas (→ public.players) ─────────────
-- NOT VALID: não valida linhas existentes (podem ter user_id antigos)
-- Novas inserções serão validadas normalmente.

ALTER TABLE public.player_game_stats
  ADD CONSTRAINT player_game_stats_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.player_court_stints
  ADD CONSTRAINT player_court_stints_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.play_by_play
  ADD CONSTRAINT play_by_play_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.play_by_play
  ADD CONSTRAINT play_by_play_secondary_player_id_fkey
  FOREIGN KEY (secondary_player_id) REFERENCES public.players(id) ON DELETE SET NULL
  NOT VALID;
