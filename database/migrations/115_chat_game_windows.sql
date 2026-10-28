-- =========================================================
-- MIGRAÇÃO 115: Conversa de grupo por jogo do CD Póvoa
--
--   • Abre 7 dias antes do jogo e fecha 2 dias depois (hora de Lisboa,
--     relativamente à hora de início do jogo).
--   • Participantes: todos os jogadores + staff (admin/treinador).
--   • Só jogos do clube (events.is_club_game), não apagados, não de teste.
--   • Fechada = só leitura (status 'archived'); as mensagens ficam guardadas.
--   • Contagem exata de mensagens por ler (RPC), usada pelo badge/notificação.
--
-- PRÉ-REQUISITOS: 018, 019, 033 e 037 aplicadas (colunas status/event_id em
-- chats; hidden_at/is_system em chat_messages; last_message_* em chats).
--
-- Ordem de aplicação: 033 → 037 → 115.
-- =========================================================

-- ── 0. Tipo 'staff' (usado por staff-sync.ts) ────────────────
DO $$
BEGIN
  ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_type_check;
  ALTER TABLE public.chats
    ADD CONSTRAINT chats_type_check
    CHECK (type IN ('direct','group','team','staff','announcement','event'));
END $$;

-- ── 1. Janela de abertura/fecho (calculada, nunca guardada) ──
-- Calcular a partir do evento significa que alterar a data de um jogo
-- (admin) desloca automaticamente a janela da conversa.

CREATE OR REPLACE FUNCTION public.game_chat_opens_at(p_date date, p_time time)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT ((p_date + COALESCE(p_time, TIME '00:00') - INTERVAL '7 days')::timestamp)
         AT TIME ZONE 'Europe/Lisbon'
$$;

CREATE OR REPLACE FUNCTION public.game_chat_closes_at(p_date date, p_time time)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT ((p_date + COALESCE(p_time, TIME '00:00') + INTERVAL '2 days')::timestamp)
         AT TIME ZONE 'Europe/Lisbon'
$$;

-- ── 2. Sincronização: criar, atualizar estado, adicionar jogadores ──
-- Idempotente. Devolve o nº de conversas criadas nesta execução.

CREATE OR REPLACE FUNCTION public.sync_game_chats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sync_game_chats'));

  -- 2.1 Estado das conversas de jogo existentes:
  --     scheduled (ainda não abriu) | active (aberta) | archived (fechada)
  WITH target AS (
    SELECT c.id AS chat_id,
           c.status AS old_status,
           CASE
             WHEN e.id IS NULL OR e.deleted_at IS NOT NULL
                  OR NOT e.is_club_game OR e.is_test                           THEN 'archived'
             WHEN now() <  public.game_chat_opens_at(e.event_date, e.event_time)  THEN 'scheduled'
             WHEN now() >= public.game_chat_closes_at(e.event_date, e.event_time) THEN 'archived'
             ELSE 'active'
           END AS new_status
    FROM public.chats c
    LEFT JOIN public.events e ON e.id = c.event_id
    WHERE c.event_id IS NOT NULL
  ), upd AS (
    UPDATE public.chats c
       SET status      = t.new_status,
           archived_at = CASE WHEN t.new_status = 'archived'
                              THEN COALESCE(c.archived_at, now()) ELSE NULL END
      FROM target t
     WHERE c.id = t.chat_id
       AND c.status IS DISTINCT FROM t.new_status
    RETURNING c.id, t.old_status, t.new_status
  )
  INSERT INTO public.chat_messages (chat_id, sender_id, content, is_system)
  SELECT id, NULL,
         'Conversa fechada: passaram 2 dias desde o jogo. As mensagens ficam disponíveis só para leitura.',
         true
    FROM upd
   WHERE new_status = 'archived' AND old_status = 'active';

  -- 2.2 Criar conversas dos jogos do clube que já estão dentro da janela
  WITH new_chats AS (
    INSERT INTO public.chats (type, name, event_id, season_id, status)
    SELECT 'event', e.title, e.id, e.season_id, 'active'
      FROM public.events e
     WHERE e.type = 'jogo'
       AND e.is_club_game
       AND NOT e.is_test
       AND e.deleted_at IS NULL
       AND now() >= public.game_chat_opens_at(e.event_date, e.event_time)
       AND now() <  public.game_chat_closes_at(e.event_date, e.event_time)
       AND NOT EXISTS (SELECT 1 FROM public.chats c WHERE c.event_id = e.id)
    ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
    RETURNING id, event_id
  ), sysmsg AS (
    INSERT INTO public.chat_messages (chat_id, sender_id, content, is_system)
    SELECT n.id, NULL,
           'Conversa do jogo aberta para toda a equipa. Fecha a ' ||
           to_char(public.game_chat_closes_at(e.event_date, e.event_time)
                     AT TIME ZONE 'Europe/Lisbon', 'DD/MM "às" HH24:MI') || '.',
           true
      FROM new_chats n
      JOIN public.events e ON e.id = n.event_id
    RETURNING 1
  )
  SELECT count(*) INTO v_created FROM new_chats;

  -- 2.3 Participantes: todos os jogadores e staff ativos (também os que
  --     entraram depois de a conversa ter sido criada)
  INSERT INTO public.chat_participants (chat_id, user_id, role_in_chat)
  SELECT c.id, u.id, 'member'
    FROM public.chats c
    JOIN public.users u
      ON u.active
     AND u.status::text NOT IN ('rejeitado', 'inativo')
     AND (u.role::text IN ('admin', 'treinador', 'jogador')
          OR u.roles_extra ?| ARRAY['admin', 'treinador', 'jogador'])
    JOIN auth.users a ON a.id = u.id
   WHERE c.event_id IS NOT NULL
     AND c.status = 'active'
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_created;
END;
$$;

-- ── 3. A conversa aceita mensagens agora? ────────────────────
-- Fonte única de verdade para o POST de mensagens e para o trigger.

CREATE OR REPLACE FUNCTION public.chat_is_writable(p_chat uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN c.event_id IS NULL THEN COALESCE(c.status, 'active') <> 'archived'
           ELSE (e.id IS NOT NULL
                 AND e.deleted_at IS NULL
                 AND e.is_club_game
                 AND now() >= public.game_chat_opens_at(e.event_date, e.event_time)
                 AND now() <  public.game_chat_closes_at(e.event_date, e.event_time))
         END
    FROM public.chats c
    LEFT JOIN public.events e ON e.id = c.event_id
   WHERE c.id = p_chat
$$;

-- Garantia ao nível da BD: ninguém escreve (nem por RLS) numa conversa de
-- jogo fechada ou que ainda não abriu. Mensagens de sistema passam.
CREATE OR REPLACE FUNCTION public.chat_block_closed_game_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_system IS TRUE OR NEW.chat_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chats c WHERE c.id = NEW.chat_id AND c.event_id IS NOT NULL)
     AND NOT public.chat_is_writable(NEW.chat_id) THEN
    RAISE EXCEPTION 'A conversa deste jogo está fechada' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_block_closed_game_chat ON public.chat_messages;
CREATE TRIGGER trg_chat_block_closed_game_chat
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_block_closed_game_chat();

-- ── 4. Mensagens por ler (exato, sem limite de 500 mensagens) ──
-- Conta mensagens de outros, não-sistema, não ocultas, posteriores à última
-- leitura (ou à entrada na conversa). Conversas fechadas não contam.

CREATE OR REPLACE FUNCTION public.chat_unread_counts(p_user uuid)
RETURNS TABLE (chat_id uuid, unread bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.chat_id, count(*)::bigint
    FROM public.chat_participants cp
    JOIN public.chats c ON c.id = cp.chat_id AND COALESCE(c.status, 'active') = 'active'
    JOIN public.chat_messages m ON m.chat_id = cp.chat_id
   WHERE cp.user_id = p_user
     AND m.created_at > COALESCE(cp.last_read_at, cp.joined_at)
     AND m.sender_id IS DISTINCT FROM p_user
     AND m.is_system IS NOT TRUE
     AND m.hidden_at IS NULL
   GROUP BY m.chat_id
$$;

-- ── 5. Permissões: só o service role (API) e o pg_cron ───────
REVOKE ALL ON FUNCTION public.sync_game_chats()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_is_writable(uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_unread_counts(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_block_closed_game_chat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_game_chats()        TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_is_writable(uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.chat_unread_counts(uuid) TO service_role;

-- ── 6. Agendamento a cada 15 minutos (pg_cron) ───────────────
-- Se o pg_cron não estiver disponível a migração continua: a API também
-- chama sync_game_chats() quando alguém abre o chat, e o envio de mensagens
-- valida a janela em tempo real.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-game-chats';
  PERFORM cron.schedule('sync-game-chats', '*/15 * * * *', 'SELECT public.sync_game_chats()');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron indisponível (%): sincronização só por pedidos da API', SQLERRM;
END $$;

-- Primeira execução (cria já as conversas dos jogos dentro da janela)
SELECT public.sync_game_chats();

NOTIFY pgrst, 'reload schema';
