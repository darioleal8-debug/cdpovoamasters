-- 095_delegate_kit_colors.sql
-- RPC SECURITY DEFINER: permite ao delegado actualizar APENAS as duas colunas de cor
-- RLS por coluna não é suportado nativamente em PostgreSQL, por isso esta função
-- serve como boundary de segurança ao nível da base de dados.

CREATE OR REPLACE FUNCTION public.delegate_update_team_colors(
  p_primary_color   VARCHAR(20),
  p_secondary_color VARCHAR(20)
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team_id uuid;
BEGIN
  -- team_id derivado do utilizador autenticado — nunca do cliente
  v_team_id := public.get_my_league_team_id();
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Sem acesso de equipa' USING ERRCODE = 'P0001';
  END IF;

  -- Actualiza APENAS primary_color e secondary_color (+ updated_at)
  UPDATE public.league_teams
  SET primary_color   = p_primary_color,
      secondary_color = p_secondary_color,
      updated_at      = NOW()
  WHERE id = v_team_id
    AND is_placeholder = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipa não encontrada ou placeholder' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Permite que utilizadores autenticados chamem esta função
GRANT EXECUTE ON FUNCTION public.delegate_update_team_colors(VARCHAR, VARCHAR) TO authenticated;
