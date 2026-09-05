"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

let _count       = 0;
let _ready       = false;           // true após o primeiro subscribe()
const _listeners = new Set<Listener>();

function _dispatch(count: number) {
  _count = count;
  _listeners.forEach((fn) => fn(count));
}

async function _load() {
  try {
    const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
    if (res.ok) {
      const { unread_count } = await res.json();
      _dispatch(unread_count ?? 0);
    }
  } catch { /* silencioso — badge fica no valor anterior */ }
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

  return count;
}
