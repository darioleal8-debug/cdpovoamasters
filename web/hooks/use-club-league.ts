"use client";

import { useEffect, useState } from "react";

export interface ClubLeague {
  name: string;
  href: string;
  external: boolean;
}

// Pedido único partilhado por menus e dashboard (Sidebar, TabRail, cartão, etc.)
let _promise: Promise<ClubLeague | null> | null = null;

function load(): Promise<ClubLeague | null> {
  if (!_promise) {
    _promise = fetch("/api/club-league")
      .then((r) => (r.ok ? r.json() : { league: null }))
      .then((j) => (j.league as ClubLeague | null) ?? null)
      .catch(() => { _promise = null; return null; });
  }
  return _promise;
}

/** Liga do clube do utilizador. `league` é null enquanto carrega ou se o clube não tem liga. */
export function useClubLeague(): { league: ClubLeague | null; loading: boolean } {
  const [state, setState] = useState<{ league: ClubLeague | null; loading: boolean }>({ league: null, loading: true });
  useEffect(() => {
    let alive = true;
    load().then((league) => { if (alive) setState({ league, loading: false }); });
    return () => { alive = false; };
  }, []);
  return state;
}

/** Atributos de <Link>/<a> para abrir a liga (nova aba só se for site externo). */
export function leagueLinkProps(league: ClubLeague) {
  return league.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
