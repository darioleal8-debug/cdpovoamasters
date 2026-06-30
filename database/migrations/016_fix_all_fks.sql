-- =========================================================
-- MIGRAÇÃO 016: Corrigir todas as Foreign Keys
--
-- PROBLEMA:
--  • Migrations 014/015 tentaram fazer DROP CONSTRAINT users_pkey,
--    mas users_pkey tem 6 FKs dependentes (criadas em 002/003).
--  • users_id_fkey foi adicionada incorretamente em 014.
--
-- SOLUÇÃO (em 5 passos):
--  1. Remover APENAS users_id_fkey (não tocar em users_pkey)
--  2. Limpar dados órfãos antes de recriar FKs
--  3. Migrar FKs de stats: public.users(id) → auth.users(id)
--  4. Fixar players.user_id → auth.users(id) ON DELETE CASCADE
--  5. Recarregar schema
--
-- ⚠️  NÃO EXISTE DROP CONSTRAINT users_pkey nesta migração.
-- =========================================================

-- ═══════════════════════════════════════════════════════════
-- PASSO 1: Remover FK incorreta (adicionada em migration 014)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- ═══════════════════════════════════════════════════════════
-- PASSO 2: Limpar dados órfãos
-- (player_id que não existe em auth.users causaria falha ao
--  recriar as FKs. Limpar primeiro garante sucesso.)
-- ═══════════════════════════════════════════════════════════

-- play_by_play: SET NULL em player_id inválido
UPDATE public.play_by_play
   SET player_id = NULL
 WHERE player_id IS NOT NULL
   AND player_id NOT IN (SELECT id FROM auth.users);

UPDATE public.play_by_play
   SET secondary_player_id = NULL
 WHERE secondary_player_id IS NOT NULL
   AND secondary_player_id NOT IN (SELECT id FROM auth.users);

-- player_game_stats: eliminar linhas com player_id inválido
DELETE FROM public.player_game_stats
 WHERE player_id NOT IN (SELECT id FROM auth.users);

-- game_substitutions: SET NULL em player inválido
UPDATE public.game_substitutions
   SET player_out_id = NULL
 WHERE player_out_id IS NOT NULL
   AND player_out_id NOT IN (SELECT id FROM auth.users);

UPDATE public.game_substitutions
   SET player_in_id = NULL
 WHERE player_in_id IS NOT NULL
   AND player_in_id NOT IN (SELECT id FROM auth.users);

-- player_court_stints: eliminar stints com player inválido
-- (player_id é NOT NULL nesta tabela — não pode ser SET NULL)
DELETE FROM public.player_court_stints
 WHERE player_id NOT IN (SELECT id FROM auth.users);

-- players: SET NULL em user_id inválido
UPDATE public.players
   SET user_id = NULL
 WHERE user_id IS NOT NULL
   AND user_id NOT IN (SELECT id FROM auth.users);

-- ═══════════════════════════════════════════════════════════
-- PASSO 3: Migrar FKs de stats: public.users → auth.users
-- As colunas player_id nestas tabelas guardam auth.users.id
-- (que coincide com public.users.id para registos válidos,
--  mas o FK deve apontar para auth.users por consistência.)
-- ═══════════════════════════════════════════════════════════

-- ── play_by_play ──────────────────────────────────────────
ALTER TABLE public.play_by_play
  DROP CONSTRAINT IF EXISTS play_by_play_player_id_fkey;
ALTER TABLE public.play_by_play
  DROP CONSTRAINT IF EXISTS play_by_play_secondary_player_id_fkey;

ALTER TABLE public.play_by_play
  ADD CONSTRAINT play_by_play_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.play_by_play
  ADD CONSTRAINT play_by_play_secondary_player_id_fkey
  FOREIGN KEY (secondary_player_id)
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── player_game_stats ─────────────────────────────────────
ALTER TABLE public.player_game_stats
  DROP CONSTRAINT IF EXISTS player_game_stats_player_id_fkey;

ALTER TABLE public.player_game_stats
  ADD CONSTRAINT player_game_stats_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── game_substitutions ────────────────────────────────────
ALTER TABLE public.game_substitutions
  DROP CONSTRAINT IF EXISTS game_substitutions_player_out_id_fkey;
ALTER TABLE public.game_substitutions
  DROP CONSTRAINT IF EXISTS game_substitutions_player_in_id_fkey;

ALTER TABLE public.game_substitutions
  ADD CONSTRAINT game_substitutions_player_out_id_fkey
  FOREIGN KEY (player_out_id)
  REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.game_substitutions
  ADD CONSTRAINT game_substitutions_player_in_id_fkey
  FOREIGN KEY (player_in_id)
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── player_court_stints ───────────────────────────────────
ALTER TABLE public.player_court_stints
  DROP CONSTRAINT IF EXISTS player_court_stints_player_id_fkey;

ALTER TABLE public.player_court_stints
  ADD CONSTRAINT player_court_stints_player_id_fkey
  FOREIGN KEY (player_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- PASSO 4: Corrigir players.user_id → auth.users ON DELETE CASCADE
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_user_id_fkey;

ALTER TABLE public.players
  ADD CONSTRAINT players_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- PASSO 5: Recarregar schema cache
-- ═══════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- =========================================================
-- ESTADO FINAL APÓS MIGRAÇÃO 016:
--
-- public.users
--   • PK: users_pkey (id UUID) — INTACTA
--   • Sem FK para auth.users (eliminação gerida pelo backend)
--
-- public.players
--   • FK players_user_id_fkey → auth.users(id) CASCADE DELETE
--     (eliminar conta → elimina jogador automaticamente)
--
-- play_by_play / game_substitutions
--   • player_id → auth.users(id) ON DELETE SET NULL
--     (eliminar conta → player_id fica NULL, registo mantém-se)
--
-- player_game_stats / player_court_stints
--   • player_id → auth.users(id) ON DELETE CASCADE
--     (eliminar conta → stats eliminadas)
--
-- training_attendance (migration 006) — já estava correto:
--   • player_id → public.players(id) ON DELETE CASCADE
--
-- training_notes / trainings / club_events (migration 006):
--   • created_by / author_id → auth.users(id) — já correto
--
-- Fluxo de eliminação de conta no backend:
--   1. DELETE players WHERE user_id = X
--      (stats de attendance em cascade via players.id)
--   2. DELETE public.users WHERE id = X
--   3. auth.admin.deleteUser(X)
--      → cascade: player_game_stats, player_court_stints,
--        play_by_play.player_id SET NULL
-- =========================================================
