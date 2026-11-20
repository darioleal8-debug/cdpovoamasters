-- Rollback of 136_live_audit_fixes.sql
DROP TRIGGER IF EXISTS play_by_play_validate_shot_spot ON public.play_by_play;
DROP FUNCTION IF EXISTS public.validate_shot_spot();
DROP FUNCTION IF EXISTS public.substitute_player(uuid, uuid, uuid, smallint, integer, varchar, text);
DROP FUNCTION IF EXISTS public.live_start_clock(uuid);
DROP FUNCTION IF EXISTS public.live_stop_clock(uuid);
