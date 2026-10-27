-- 112_game_sheet_admin_imports.sql
-- O admin da liga pode carregar folhas de jogo melhoradas (jogos terminados) e analisar
-- todas as folhas de um jogo. Essas importações não pertencem a nenhuma equipa (team_id NULL)
-- e só o admin as vê (a política de leitura das equipas exige team_id da equipa).
-- Idempotente.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sheet_imports' AND policyname = 'gsi_admin_insert') THEN
    CREATE POLICY gsi_admin_insert ON public.game_sheet_imports FOR INSERT TO authenticated
      WITH CHECK (public.is_liga_admin() AND created_by = auth.uid() AND team_id IS NULL
                  AND status IN ('processing','needs_review','ready_to_confirm','failed'));
  END IF;
END $$;

-- Importação criada a partir da folha de uma submissão existente (evita analisar duas vezes a mesma imagem)
ALTER TABLE public.game_sheet_imports
  ADD COLUMN IF NOT EXISTS source_submission_id uuid REFERENCES public.result_submissions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS gsi_source_submission_idx ON public.game_sheet_imports(source_submission_id);
