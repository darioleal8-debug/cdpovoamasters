-- 071_birthday_messages.sql
-- Mural de mensagens de aniversário para jogadores.
--
-- IMPORTANTE: Mostrar ao utilizador para revisão antes de aplicar.
-- Aplicar no Supabase SQL Editor (ou via supabase db push).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Helper: birthday_window_open(player_id, year)
--    Devolve true se hoje (em Europe/Lisbon) estiver no intervalo
--    [data de anos do jogador nesse ano, data de anos + 7 dias].
--    Trata o 29/fev em anos não bissextos (celebra no 28/fev).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.birthday_window_open(
  p_player_id uuid,
  p_year      int
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_birth_date date;
  v_today      date;
  v_bday       date;
BEGIN
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon')::date;

  -- Só o ano corrente de Lisboa é válido para escrita
  IF p_year != EXTRACT(YEAR FROM v_today)::int THEN
    RETURN false;
  END IF;

  SELECT birth_date INTO v_birth_date
  FROM public.players
  WHERE id = p_player_id;

  IF v_birth_date IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_bday := make_date(
      p_year,
      EXTRACT(MONTH FROM v_birth_date)::int,
      EXTRACT(DAY   FROM v_birth_date)::int
    );
  EXCEPTION WHEN OTHERS THEN
    -- 29/fev em ano não bissexto → celebra no 28/fev
    v_bday := make_date(p_year, 2, 28);
  END;

  RETURN v_today BETWEEN v_bday AND (v_bday + 7);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Helper: user_is_club_member(user_id)
--    Devolve true se o utilizador for um membro ativo do clube.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_is_club_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND active = true
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Tabela birthday_messages
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.birthday_messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  celebrant_player_id UUID        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  celebration_year    INT         NOT NULL,
  author_user_id      UUID        NOT NULL REFERENCES auth.users(id),
  message             TEXT        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 280),
  is_thank_you        BOOLEAN     NOT NULL DEFAULT false,
  is_hidden           BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um autor só pode ter uma entrada por aniversariante/ano
  UNIQUE (celebrant_player_id, celebration_year, author_user_id)
);

CREATE INDEX IF NOT EXISTS idx_birthday_messages_celebrant_year_created
  ON public.birthday_messages (celebrant_player_id, celebration_year, created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. updated_at automático
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER birthday_messages_updated_at
  BEFORE UPDATE ON public.birthday_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.birthday_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: membros ativos veem mensagens não ocultadas; admin vê todas
CREATE POLICY birthday_messages_select
  ON public.birthday_messages FOR SELECT
  TO authenticated
  USING (
    public.user_is_club_member(auth.uid())
    AND (
      is_hidden = false
      OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    )
  );

-- INSERT:
--   • author_user_id deve ser o utilizador autenticado
--   • deve ser membro ativo
--   • deve estar dentro da janela de escrita
--   • is_thank_you = true só se o autor for o próprio aniversariante
--   • is_thank_you = false se o autor NÃO for o aniversariante (colega)
CREATE POLICY birthday_messages_insert
  ON public.birthday_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND public.user_is_club_member(auth.uid())
    AND public.birthday_window_open(celebrant_player_id, celebration_year)
    AND (
      -- Se is_thank_you = true → autor tem de ser o aniversariante
      -- Se is_thank_you = false → autor NÃO pode ser o aniversariante
      is_thank_you = (
        (SELECT user_id FROM public.players WHERE id = celebrant_player_id) = auth.uid()
      )
    )
  );

-- UPDATE:
--   • O próprio autor pode editar dentro da janela
--   • O admin pode alterar is_hidden em qualquer altura
CREATE POLICY birthday_messages_update
  ON public.birthday_messages FOR UPDATE
  TO authenticated
  USING (
    (author_user_id = auth.uid()
      AND public.birthday_window_open(celebrant_player_id, celebration_year))
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (author_user_id = auth.uid()
      AND public.birthday_window_open(celebrant_player_id, celebration_year))
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

-- DELETE: só o próprio autor, dentro da janela
CREATE POLICY birthday_messages_delete
  ON public.birthday_messages FOR DELETE
  TO authenticated
  USING (
    author_user_id = auth.uid()
    AND public.birthday_window_open(celebrant_player_id, celebration_year)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Ativar Supabase Realtime
-- ────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.birthday_messages;
