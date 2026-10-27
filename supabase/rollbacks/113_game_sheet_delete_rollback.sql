-- 113_game_sheet_delete_rollback.sql
-- Desfaz 113_game_sheet_delete.sql

DROP FUNCTION IF EXISTS public.liga_delete_game_sheet(text, uuid, text);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'folhas_jogo_admin_delete'
  ) THEN
    DROP POLICY folhas_jogo_admin_delete ON storage.objects;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'game_sheet_imports' AND policyname = 'gsi_admin_delete'
  ) THEN
    DROP POLICY gsi_admin_delete ON public.game_sheet_imports;
  END IF;
END $$;
