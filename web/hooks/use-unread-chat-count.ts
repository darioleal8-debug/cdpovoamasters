"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import { getActiveChatId } from "@/lib/chat/active-chat";

// ── Singleton de subscrição Realtime ─────────────────────────────────────────
//
// PROBLEMA ANTERIOR: o hook era instanciado 3× (Sidebar, TabRail, BottomNav).
// createBrowserClient() devolve sempre o mesmo cliente Supabase (singleton).
// Portanto .channel("chat-unread-count") nas 3 instâncias devolvia o MESMO
// objecto de canal. A 2.ª e 3.ª chamada tentavam registar .on() num canal
// já subscrito → supabase-js lança:
//   "cannot add `postgres_changes` callbacks after `subscribe()`"
//
// SOLUÇÃO: uma única subscrição ao nível do módulo; os componentes registam-se
// como listeners no Set e recebem actualizações via _dispatch().
// _setup() é idempotente (guarda por _ready).

type Listener = (count: number) => void;
type UnreadChat = { chat_id: string; name: string; unread: number };

let _count       = 0;
let _ready       = false;           // true após o primeiro subscribe()
let _primed      = false;           // true após a 1.ª carga (evita avisar por mensagens antigas)
let _prevByChat  = new Map<string, number>();
const _listeners = new Set<Listener>();

function _dispatch(count: number) {
  _count = count;
  _listeners.forEach((fn) => fn(count));
}

// Notificação: aparece um aviso quando chegam mensagens novas a uma conversa
// que não está aberta. O badge e o contador no título do separador mantêm-se
// enquanto houver mensagens por ler.
function _notify(chats: UnreadChat[]) {
  const active = getActiveChatId();
  for (const c of chats) {
    const before = _prevByChat.get(c.chat_id) ?? 0;
    if (c.unread > before && c.chat_id !== active) {
      const novas = c.unread - before;
      toast({
        title: `Nova mensagem · ${c.name}`,
        description: c.unread === 1
          ? "Tens 1 mensagem por ler."
          : `Tens ${c.unread} mensagens por ler${novas > 0 && before > 0 ? ` (${novas} nova${novas > 1 ? "s" : ""})` : ""}.`,
      });
    }
  }
  _prevByChat = new Map(chats.map((c) => [c.chat_id, c.unread]));
}

async function _load() {
  try {
    const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
    if (res.ok) {
      const { unread_count, chats } = await res.json() as { unread_count?: number; chats?: UnreadChat[] };
      const list = chats ?? [];
      if (_primed) {
        _notify(list);
      } else {
        _prevByChat = new Map(list.map((c) => [c.chat_id, c.unread]));
        // Ao abrir a app com mensagens por ler: um único aviso-resumo
        const total = unread_count ?? 0;
        if (total > 0 && !list.some((c) => c.chat_id === getActiveChatId())) {
          toast({
            title: "Mensagens por ler",
            description: total === 1
              ? "Tens 1 mensagem por ler no chat."
              : `Tens ${total} mensagens por ler no chat.`,
          });
        }
      }
      _primed = true;
      _dispatch(unread_count ?? 0);
    }
  } catch { /* silencioso — badge fica no valor anterior */ }
}

// "(3) Título" no separador do browser enquanto houver mensagens por ler
function _setTitleCount(count: number) {
  if (typeof document === "undefined") return;
  const base = document.title.replace(/^\(\d+\)\s/, "");
  document.title = count > 0 ? `(${count}) ${base}` : base;
}

function _setup() {
  if (_ready) return;   // idempotente — apenas cria o canal uma vez
  _ready = true;

  // Todos os .on() ANTES de .subscribe() — obrigatório no supabase-js
  createClient()
    .channel("chat-unread-count")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" },    _load)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_participants" }, _load)
    .subscribe();

  _load(); // carga inicial
}

// ── Hook público ──────────────────────────────────────────────────────────────

export function useUnreadChatCount(): number {
  // useState com lazy initializer lê _count no momento do render (0 no SSR,
  // valor actual no cliente se o módulo já foi inicializado por outro componente).
  const [count, setCount] = useState(() => _count);

  useEffect(() => {
    _listeners.add(setCount);   // regista este componente como listener
    _setup();                    // cria canal + fetch inicial (no-op se já feito)
    setCount(_count);            // sincroniza caso _count mudou antes do mount
    return () => { _listeners.delete(setCount); }; // limpa ao desmontar
  }, []); // sem dependências — o singleton garante consistência entre instâncias

  useEffect(() => { _setTitleCount(count); }, [count]);

  return count;
}
