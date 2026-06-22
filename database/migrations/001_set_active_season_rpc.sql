-- =========================================================
-- MIGRAÇÃO 001: RPC para definir temporada ativa
-- Aplicar em: Supabase Dashboard > SQL Editor > New Query
-- =========================================================

-- Função atómica que arquiva todas as temporadas ativas
-- e ativa a temporada indicada num único bloco transacional.
-- Necessário porque o índice único idx_one_active_season
-- impede ter duas temporadas com status = 'ativa' em simultâneo.
CREATE OR REPLACE FUNCTION public.set_active_season(p_season_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.seasons
    SET status = 'arquivada', updated_at = now()
  WHERE status = 'ativa';

  UPDATE public.seasons
    SET status = 'ativa', updated_at = now()
  WHERE id = p_season_id;
END;
$$;

-- Permissão: apenas utilizadores autenticados podem chamar esta função
GRANT EXECUTE ON FUNCTION public.set_active_season(UUID) TO authenticated;
