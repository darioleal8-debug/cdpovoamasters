-- Adicionar email directo ao perfil de jogador
-- Permite enviar recibos de pagamento mesmo a jogadores sem conta de utilizador
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_players_email ON public.players (email)
  WHERE email IS NOT NULL;
