-- =========================================================
-- MIGRAÇÃO 006: Treinos, Presenças, Notas e Eventos Clube
-- Aplicar em: Supabase Dashboard → SQL Editor → New Query
-- =========================================================

-- ── 1. Regras de recorrência ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_recurrence_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID        NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  recurrence_type TEXT        NOT NULL CHECK (recurrence_type IN ('weekly','monthly','unique')),
  day_of_week     INT         CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Dom … 6=Sáb
  day_of_month    INT         CHECK (day_of_month BETWEEN 1 AND 31),
  start_date      DATE        NOT NULL,
  end_date        DATE,
  start_time      TIME        NOT NULL,
  end_time        TIME,
  location        TEXT,
  type            TEXT        NOT NULL DEFAULT 'geral',
  notes           TEXT,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Treinos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trainings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     UUID        NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  recurrence_id UUID        REFERENCES public.training_recurrence_rules(id) ON DELETE SET NULL,
  date          DATE        NOT NULL,
  start_time    TIME        NOT NULL,
  end_time      TIME,
  location      TEXT        NOT NULL DEFAULT '',
  type          TEXT        NOT NULL DEFAULT 'geral'
                            CHECK (type IN ('tecnico','fisico','tatico','recuperacao','coletivo','individual','geral')),
  notes         TEXT,
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_training_slot UNIQUE (season_id, date, start_time, location)
);

-- ── 3. Presenças ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_attendance (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID        NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  player_id   UUID        NOT NULL REFERENCES public.players(id)   ON DELETE CASCADE,
  status      TEXT        NOT NULL CHECK (status IN ('present','absent','justified','late')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID        REFERENCES auth.users(id),

  CONSTRAINT uq_attendance UNIQUE (training_id, player_id)
);

-- ── 4. Notas de treino ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID        NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  author_id   UUID        REFERENCES auth.users(id),
  note_text   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Eventos do clube ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.club_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID        NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  date        DATE        NOT NULL,
  start_time  TIME,
  location    TEXT,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. Índices ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trainings_season      ON public.trainings          (season_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_training   ON public.training_attendance (training_id);
CREATE INDEX IF NOT EXISTS idx_attendance_player     ON public.training_attendance (player_id);
CREATE INDEX IF NOT EXISTS idx_notes_training        ON public.training_notes      (training_id);
CREATE INDEX IF NOT EXISTS idx_club_events_season    ON public.club_events         (season_id, date);

-- ── 7. RLS ────────────────────────────────────────────────
ALTER TABLE public.training_recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_events               ENABLE ROW LEVEL SECURITY;

-- Limpar políticas anteriores (idempotente)
DO $$ BEGIN
  DROP POLICY IF EXISTS "trr_select"  ON public.training_recurrence_rules;
  DROP POLICY IF EXISTS "trr_all"     ON public.training_recurrence_rules;
  DROP POLICY IF EXISTS "tr_select"   ON public.trainings;
  DROP POLICY IF EXISTS "tr_all"      ON public.trainings;
  DROP POLICY IF EXISTS "ta_select"   ON public.training_attendance;
  DROP POLICY IF EXISTS "ta_all"      ON public.training_attendance;
  DROP POLICY IF EXISTS "tn_select"   ON public.training_notes;
  DROP POLICY IF EXISTS "tn_all"      ON public.training_notes;
  DROP POLICY IF EXISTS "ce_select"   ON public.club_events;
  DROP POLICY IF EXISTS "ce_all"      ON public.club_events;
END $$;

CREATE POLICY "trr_select" ON public.training_recurrence_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "trr_all"    ON public.training_recurrence_rules FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tr_select"  ON public.trainings                 FOR SELECT TO authenticated USING (true);
CREATE POLICY "tr_all"     ON public.trainings                 FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "ta_select"  ON public.training_attendance       FOR SELECT TO authenticated USING (true);
CREATE POLICY "ta_all"     ON public.training_attendance       FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tn_select"  ON public.training_notes            FOR SELECT TO authenticated USING (true);
CREATE POLICY "tn_all"     ON public.training_notes            FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "ce_select"  ON public.club_events               FOR SELECT TO authenticated USING (true);
CREATE POLICY "ce_all"     ON public.club_events               FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ── 8. View de assiduidade por jogador ───────────────────
CREATE OR REPLACE VIEW public.player_attendance_stats AS
SELECT
  ta.player_id,
  t.season_id,
  COUNT(*)                                          AS total_trainings,
  COUNT(*) FILTER (WHERE ta.status = 'present')    AS present,
  COUNT(*) FILTER (WHERE ta.status = 'absent')     AS absent,
  COUNT(*) FILTER (WHERE ta.status = 'justified')  AS justified,
  COUNT(*) FILTER (WHERE ta.status = 'late')       AS late,
  ROUND(
    COUNT(*) FILTER (WHERE ta.status IN ('present','late'))::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                 AS attendance_pct
FROM public.training_attendance ta
JOIN public.trainings t ON t.id = ta.training_id
GROUP BY ta.player_id, t.season_id;

-- =========================================================
-- Verificação após aplicar:
-- SELECT COUNT(*) FROM public.trainings;
-- SELECT COUNT(*) FROM public.training_attendance;
-- =========================================================
