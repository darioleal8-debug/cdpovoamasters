-- 030: Fotografias de treinos e jogos
-- IMPORTANTE: antes de aplicar esta migração, criar o bucket "event-photos" no
-- Supabase Dashboard → Storage → New bucket → nome: event-photos → Public: ON

-- Tabela principal
CREATE TABLE IF NOT EXISTS event_photos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT        NOT NULL CHECK (entity_type IN ('training', 'game')),
  entity_id     UUID        NOT NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_name TEXT,
  photo_url     TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS event_photos_entity_idx
  ON event_photos(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS event_photos_created_idx
  ON event_photos(entity_id, created_at DESC);

-- RLS
ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

-- Qualquer utilizador autenticado pode ver fotos
DROP POLICY IF EXISTS "event_photos_select" ON event_photos;
CREATE POLICY "event_photos_select" ON event_photos
  FOR SELECT TO authenticated USING (true);

-- Qualquer utilizador autenticado pode fazer upload
DROP POLICY IF EXISTS "event_photos_insert" ON event_photos;
CREATE POLICY "event_photos_insert" ON event_photos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Apenas o autor ou admin pode apagar
DROP POLICY IF EXISTS "event_photos_delete" ON event_photos;
CREATE POLICY "event_photos_delete" ON event_photos
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );
