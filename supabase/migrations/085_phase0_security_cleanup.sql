-- 085_phase0_security_cleanup.sql
-- Phase 0: Limpeza de segurança
--
-- 1. Remove bucket game-sheets (substituído por folhas-jogo na migração 083)
-- 2. Restringe INSERT em result_submissions a delegados autenticados (era anon+authenticated)
-- 3. Adiciona submitted_by_user_id para rastreio do utilizador que submeteu
-- 4. Adiciona política de leitura para delegado ver as suas próprias submissões

-- ─── 1. Bucket game-sheets → remover políticas e eliminar se vazio ───────────

DROP POLICY IF EXISTS "team_member_upload_game_sheet"    ON storage.objects;
DROP POLICY IF EXISTS "liga_admin_read_game_sheets"      ON storage.objects;
DROP POLICY IF EXISTS "team_member_read_own_game_sheets" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'game-sheets' LIMIT 1
  ) THEN
    DELETE FROM storage.buckets WHERE id = 'game-sheets';
    RAISE NOTICE 'Bucket game-sheets eliminado com sucesso.';
  ELSE
    RAISE NOTICE 'ATENÇÃO: bucket game-sheets não está vazio — não foi eliminado. '
      'Esvazia-o manualmente no dashboard e depois executa: '
      'DELETE FROM storage.buckets WHERE id = ''game-sheets'';';
  END IF;
END $$;

-- ─── 2. Corrigir RLS de result_submissions ───────────────────────────────────

-- Remover política demasiado permissiva (anon + authenticated genérico)
DROP POLICY IF EXISTS "p1_rs_insert_public" ON public.result_submissions;

-- Nova política: só membros de equipa da liga (delegados) podem submeter
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'result_submissions' AND policyname = 'rs_insert_delegate_only'
  ) THEN
    CREATE POLICY "rs_insert_delegate_only" ON public.result_submissions
      FOR INSERT TO authenticated
      WITH CHECK (
        status = 'pending'
        AND EXISTS (
          SELECT 1 FROM public.league_team_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── 3. Coluna submitted_by_user_id ─────────────────────────────────────────

ALTER TABLE public.result_submissions
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rs_submitted_by_user_idx
  ON public.result_submissions(submitted_by_user_id);

-- ─── 4. Política de leitura para delegado ver as suas próprias submissões ────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'result_submissions' AND policyname = 'rs_select_own_delegate'
  ) THEN
    CREATE POLICY "rs_select_own_delegate" ON public.result_submissions
      FOR SELECT TO authenticated
      USING (submitted_by_user_id = auth.uid());
  END IF;
END $$;

-- ─── 5. Normalizar photo_url: game-sheets/ → folhas-jogo/ ───────────────────
-- (Migração preventiva — na prática não deverão existir paths com game-sheets/)

UPDATE public.result_submissions
SET photo_url = replace(photo_url, 'game-sheets/', 'folhas-jogo/')
WHERE photo_url LIKE 'game-sheets/%';
