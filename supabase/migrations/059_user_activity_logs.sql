-- =============================================================
-- 059_user_activity_logs.sql
-- Registo de actividade dos utilizadores para o painel de uso.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text        NOT NULL CHECK (event_type IN ('page_view', 'action')),
  page        text,
  action      text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- Índices para queries de agregação
CREATE INDEX IF NOT EXISTS ual_user_created
  ON public.user_activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ual_created
  ON public.user_activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS ual_page_created
  ON public.user_activity_logs(page, created_at DESC);

-- RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Utilizadores autenticados inserem a sua própria actividade
CREATE POLICY "ual_insert_own"
  ON public.user_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Treinadores e acima podem ler toda a actividade
CREATE POLICY "ual_select_staff"
  ON public.user_activity_logs FOR SELECT
  TO authenticated
  USING (public.is_trainer_or_above());

-- Verificação
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name   = 'user_activity_logs') THEN
    RAISE NOTICE 'OK: tabela user_activity_logs criada com RLS.';
  ELSE
    RAISE WARNING 'AVISO: tabela user_activity_logs não encontrada.';
  END IF;
END $$;
