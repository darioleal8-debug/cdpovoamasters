-- 028: Adicionar campo method a training_attendance + tabela training_photos

-- Adicionar coluna method (manual | photo | gps)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'training_attendance' AND column_name = 'method'
  ) THEN
    ALTER TABLE training_attendance
      ADD COLUMN method text NOT NULL DEFAULT 'manual'
        CHECK (method IN ('manual', 'photo', 'gps'));
  END IF;
END $$;

-- Tabela de fotos de presença
CREATE TABLE IF NOT EXISTS training_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid        NOT NULL REFERENCES trainings(id)  ON DELETE CASCADE,
  player_id   uuid        NOT NULL REFERENCES players(id)    ON DELETE CASCADE,
  photo_url   text        NOT NULL,
  timestamp   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS training_photos_training_player_uidx
  ON training_photos (training_id, player_id);

ALTER TABLE training_photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'training_photos' AND policyname = 'Players see own photos'
  ) THEN
    CREATE POLICY "Players see own photos" ON training_photos
      FOR SELECT USING (
        player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'training_photos' AND policyname = 'Admins treinadores see all photos'
  ) THEN
    CREATE POLICY "Admins treinadores see all photos" ON training_photos
      FOR SELECT USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'treinador')
      );
  END IF;
END $$;
