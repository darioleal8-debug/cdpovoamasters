-- Migration: 055_training_rsvp
-- Confirmação de presença (RSVP) em treinos — tabela, políticas RLS e vista de sumário.
-- Idempotente: usa IF NOT EXISTS, OR REPLACE, DROP POLICY IF EXISTS.

-- ─── 1. Novas colunas em trainings ───────────────────────────────────────────

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS rsvp_deadline_hours INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS min_players INT NOT NULL DEFAULT 8;

-- ─── 2. Tabela training_rsvps ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_rsvps (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id   UUID        NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES public.players(id)   ON DELETE CASCADE,
  status        TEXT        NOT NULL CHECK (status IN ('going', 'not_going')),
  reason_code   TEXT        CHECK (reason_code IN ('lesao', 'trabalho', 'viagem', 'outro')),
  reason_text   TEXT        CHECK (char_length(reason_text) <= 140),
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID        REFERENCES public.users(id),
  UNIQUE (training_id, player_id)
);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.training_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p1_rsvps_select" ON public.training_rsvps;
DROP POLICY IF EXISTS "p1_rsvps_insert" ON public.training_rsvps;
DROP POLICY IF EXISTS "p1_rsvps_update" ON public.training_rsvps;
DROP POLICY IF EXISTS "p1_rsvps_delete" ON public.training_rsvps;

-- SELECT: própria linha (jogador) ou todas (treinador+)
CREATE POLICY "p1_rsvps_select" ON public.training_rsvps
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- INSERT: própria linha (jogador) ou qualquer linha (treinador+)
CREATE POLICY "p1_rsvps_insert" ON public.training_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- UPDATE: própria linha (jogador) ou qualquer linha (treinador+)
CREATE POLICY "p1_rsvps_update" ON public.training_rsvps
  FOR UPDATE TO authenticated
  USING (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  )
  WITH CHECK (
    player_id IN (SELECT id FROM public.players WHERE user_id = (SELECT auth.uid()))
    OR (SELECT public.is_trainer_or_above())
  );

-- DELETE: só treinador+
CREATE POLICY "p1_rsvps_delete" ON public.training_rsvps
  FOR DELETE TO authenticated
  USING ((SELECT public.is_trainer_or_above()));

-- ─── 4. Vista de sumário ──────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_training_rsvp_summary
WITH (security_invoker = true)
AS
SELECT
  t.id              AS training_id,
  t.season_id,
  t.date,
  t.start_time,
  t.rsvp_deadline_hours,
  t.min_players,
  COUNT(CASE WHEN r.status = 'going'     THEN 1 END)::INT AS going_count,
  COUNT(CASE WHEN r.status = 'not_going' THEN 1 END)::INT AS not_going_count,
  (
    SELECT COUNT(*)::INT
    FROM   public.players p2
    JOIN   public.users   u2 ON u2.id = p2.user_id
    WHERE  p2.season_id = t.season_id
    AND    u2.active = true
  ) AS total_players,
  GREATEST(
    0,
    (
      SELECT COUNT(*)::INT
      FROM   public.players p2
      JOIN   public.users   u2 ON u2.id = p2.user_id
      WHERE  p2.season_id = t.season_id
      AND    u2.active = true
    ) - COUNT(r.id)::INT
  ) AS no_response_count
FROM public.trainings t
LEFT JOIN public.training_rsvps r ON r.training_id = t.id
GROUP BY t.id, t.season_id, t.date, t.start_time, t.rsvp_deadline_hours, t.min_players;

GRANT SELECT ON public.v_training_rsvp_summary TO authenticated;
