-- 113_game_sheet_delete.sql
-- Apagar folhas de jogo (importações e fotos de submissões) pelo admin da liga.
--
--  1. Política DELETE em game_sheet_imports para is_liga_admin()
--  2. Política DELETE em storage.objects para is_liga_admin() ou is_admin()
--  3. liga_delete_game_sheet(p_kind, p_id, p_reason) — transação atómica
--
-- Idempotente. Rollback em 113_game_sheet_delete_rollback.sql.

-- ─── 1. DELETE em game_sheet_imports ─────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'game_sheet_imports' AND policyname = 'gsi_admin_delete'
  ) THEN
    CREATE POLICY gsi_admin_delete ON public.game_sheet_imports
      FOR DELETE TO authenticated
      USING (public.is_liga_admin());
  END IF;
END $$;

-- ─── 2. DELETE em storage.objects (bucket folhas-jogo) ───────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'folhas_jogo_admin_delete'
  ) THEN
    CREATE POLICY folhas_jogo_admin_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'folhas-jogo'
        AND (public.is_liga_admin() OR public.is_admin())
      );
  END IF;
END $$;

-- ─── 3. Função liga_delete_game_sheet ────────────────────────────────────────
-- p_kind   : 'import' | 'submission'
-- p_id     : uuid do game_sheet_imports (import) ou result_submissions (submission)
-- p_reason : motivo obrigatório para a auditoria
--
-- Devolve o image_path a remover do Storage (ou NULL se não há objeto a remover).
-- A remoção do objeto Storage é feita pelo servidor Node para aproveitar o service role.
--
-- Segurança: SECURITY DEFINER para poder fazer UPDATE em result_submissions (o admin
-- não tem política UPDATE nessa tabela para o campo photo_url); verifica is_liga_admin()
-- antes de qualquer operação.
CREATE OR REPLACE FUNCTION public.liga_delete_game_sheet(
  p_kind   text,
  p_id     uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id   uuid;
  v_path       text;
  v_can_remove boolean := false;
BEGIN
  IF NOT (public.is_liga_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Sem permissão de admin da liga' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'motivo obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('import', 'submission') THEN
    RAISE EXCEPTION 'kind inválido: %', p_kind USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'import' THEN
    -- Não apagar se estiver em processamento (pode estar a ser analisado)
    DECLARE
      v_row public.game_sheet_imports%ROWTYPE;
    BEGIN
      SELECT * INTO v_row FROM public.game_sheet_imports WHERE id = p_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Importação não encontrada' USING ERRCODE = 'P0002';
      END IF;
      IF v_row.status = 'processing' THEN
        RAISE EXCEPTION 'Importação em processamento — aguarde e tente de novo' USING ERRCODE = '55000';
      END IF;

      v_event_id := v_row.event_id;
      v_path     := v_row.image_path;

      -- Anular FK de result_submissions antes de apagar a linha
      UPDATE public.result_submissions SET import_id = NULL WHERE import_id = p_id;

      DELETE FROM public.game_sheet_imports WHERE id = p_id;

      -- Só remover o objeto se nenhuma outra importação ainda o referenciar
      IF v_path IS NOT NULL THEN
        SELECT NOT EXISTS (
          SELECT 1 FROM public.game_sheet_imports WHERE image_path = v_path
        ) INTO v_can_remove;
      END IF;
    END;

  ELSE -- submission
    DECLARE
      v_sub public.result_submissions%ROWTYPE;
    BEGIN
      SELECT * INTO v_sub FROM public.result_submissions WHERE id = p_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Submissão não encontrada' USING ERRCODE = 'P0002';
      END IF;
      IF v_sub.photo_url IS NULL THEN
        RAISE EXCEPTION 'Esta submissão não tem folha de jogo' USING ERRCODE = 'P0002';
      END IF;

      v_event_id := v_sub.event_id;

      -- Extrair o caminho Storage da foto (formato: storage://<bucket>/<path>)
      -- O campo photo_url pode ser uma URL assinada ou o path direto; o path começa em
      -- 'folhas-delegado/' ou 'folhas-jogo/'; extraímos a parte após o bucket.
      -- A lógica complexa fica no servidor Node; aqui apenas anulamos o campo.
      v_path := NULL; -- servidor Node determina o path real via resolveSheetLocation

      UPDATE public.result_submissions
         SET photo_url = NULL, updated_at = now()
       WHERE id = p_id;

      v_can_remove := false; -- servidor Node decide se remove o objeto
    END;
  END IF;

  INSERT INTO public.liga_resultado_audit (jogo_id, alterado_por, valor_antigo, valor_novo, motivo)
  VALUES (
    v_event_id,
    auth.uid(),
    jsonb_build_object('kind', p_kind, 'id', p_id),
    jsonb_build_object('action', 'delete_game_sheet', 'kind', p_kind,
                       'storage_path', v_path, 'removed_from_storage', v_can_remove),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'storage_path', v_path,
    'can_remove',   v_can_remove
  );
END;
$$;

REVOKE ALL ON FUNCTION public.liga_delete_game_sheet(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_delete_game_sheet(text, uuid, text) TO authenticated;
