-- 067_training_attendance_player_insert.sql
-- Permite que um jogador autenticado insira a sua própria presença (check-in GPS).
-- A validação da janela horária e da identidade é feita na API; o RLS garante
-- apenas que o player_id pertence ao utilizador autenticado.

CREATE POLICY "p1_training_attendance_own_insert" ON public.training_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT id FROM public.players WHERE user_id = auth.uid()
    )
  );
