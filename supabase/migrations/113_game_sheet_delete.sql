-- 113_game_sheet_delete.sql
-- Apagar folhas de jogo (importações e fotos de submissões) pelo admin da liga.
--
--  1. Política DELETE em game_sheet_imports para is_liga_admin()
--  2. Política DELETE em storage.objects para is_liga_admin() ou is_admin()
--  3. liga_delete_game_sheet(p_kind, p_id, p_reason) — validação + FK nulling + auditoria
--     O DELETE da linha e a remoção do objeto Storage são feitos pelo servidor Node
--     via service role (createServiceClient).
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
-- Devolve { storage_path, other_refs } para o servidor Node decidir se remove o objeto.
-- SECURITY DEFINER: necessário para UPDATE em result_submissions (campo photo_url).
CREATE OR REPLACE FUNCTION public.liga_delete_game_sheet(
  p_kind   text,
  p_id     uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_event_id  uuid;
  v_path      text;
  v_other_refs int;
  v_status    text;
  v_photo_url text;
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
    SELECT event_id, image_path, status
      INTO v_event_id, v_path, v_status
      FROM public.game_sheet_imports
     WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Importação não encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF v_status = 'processing' THEN
      RAISE EXCEPTION 'Importação em processamento — aguarde e tente de novo' USING ERRCODE = '55000';
    END IF;
    -- Anular FK antes de o servidor apagar a linha
    UPDATE public.result_submissions SET import_id = NULL WHERE import_id = p_id;
    -- Contar outras importações que usam o mesmo path (para o servidor decidir se remove)
    SELECT count(*)::int INTO v_other_refs
      FROM public.game_sheet_imports
     WHERE image_path = v_path AND id <> p_id;

  ELSE
    SELECT event_id, photo_url
      INTO v_event_id, v_photo_url
      FROM public.result_submissions
     WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Submissão não encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF v_photo_url IS NULL THEN
      RAISE EXCEPTION 'Esta submissão não tem folha de jogo' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.result_submissions
       SET photo_url = NULL, updated_at = now()
     WHERE id = p_id;
    v_path       := NULL;
    v_other_refs := 0;
  END IF;

  INSERT INTO public.liga_resultado_audit (jogo_id, alterado_por, valor_antigo, valor_novo, motivo)
  VALUES (
    v_event_id, auth.uid(),
    jsonb_build_object('kind', p_kind, 'id', p_id),
    jsonb_build_object('action', 'delete_game_sheet', 'kind', p_kind, 'storage_path', v_path),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'storage_path', v_path,
    'other_refs',   v_other_refs
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.liga_delete_game_sheet(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_delete_game_sheet(text, uuid, text) TO authenticated;
