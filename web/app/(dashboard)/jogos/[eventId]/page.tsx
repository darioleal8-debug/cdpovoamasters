"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useGameCallups } from "@/hooks/use-game-callups";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { cn, buildMapsUrl } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ArrowLeft, Calendar, Clock, MapPin, Shield, Trophy, Map as MapIcon,
  Users, BarChart2, Video, CheckCircle2, XCircle, HelpCircle, Loader2,
} from "lucide-react";
import type { Event } from "@/types/database";

// ─── Types ────────────────────────────────────────────────

interface OwnAvailability {
  status: "available" | "unavailable" | null;
  reason_code: string | null;
  reason_text: string | null;
  responded_at: string | null;
}

interface EventMeta {
  jornada?: number;
  volta?: number;
  home_team?: string;
  away_team?: string;
  pavilion?: string;
  locality?: string;
  is_home?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt }); }
  catch { return iso; }
}

function fmtTime(t?: string | null) {
  return t?.slice(0, 5) ?? null;
}

function parseMeta(ev: Event): EventMeta | null {
  if (!ev.description) return null;
  try { return JSON.parse(ev.description) as EventMeta; }
  catch { return null; }
}

function StatusBadge({ status }: { status: "available" | "unavailable" | null }) {
  if (status === "available")
    return (
      <Badge className="gap-1 bg-green-600 hover:bg-green-600 text-white">
        <CheckCircle2 className="h-3 w-3" /> Disponível
      </Badge>
    );
  if (status === "unavailable")
    return (
      <Badge className="gap-1 bg-red-600 hover:bg-red-600 text-white">
        <XCircle className="h-3 w-3" /> Indisponível
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <HelpCircle className="h-3 w-3" /> Sem resposta
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function GameDetailPage() {
  const params  = useParams<{ eventId: string }>();
  const router  = useRouter();
  const supabase = createClient();
  const gameId   = params.eventId;

  const [event,        setEvent]        = useState<Event | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [own,          setOwn]          = useState<OwnAvailability | null>(null);
  const [ownLoading,   setOwnLoading]   = useState(true);
  const [saving,       setSaving]       = useState(false);

  const { callups, loading: callupsLoading } = useGameCallups(gameId);

  // ── Fetch event ──────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("events").select("*").eq("id", gameId).single()
      .then(({ data, error }) => {
        if (!error) setEvent(data as Event);
        setEventLoading(false);
      });
  }, [gameId]);

  // ── Fetch own availability ───────────────────────────────
  useEffect(() => {
    setOwnLoading(true);
    fetch(`/api/games/${gameId}/availability`)
      .then((r) => r.json())
      .then((json) => { setOwn(json.own ?? null); })
      .catch(() => {})
      .finally(() => setOwnLoading(false));
  }, [gameId]);

  // ── Update own availability ──────────────────────────────
  async function setAvailability(status: "available" | "unavailable") {
    setSaving(true);
    try {
      const res = await fetch(`/api/games/${gameId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json();
        toast({ title: "Erro", description: j.error, variant: "destructive" });
        return;
      }
      setOwn({
        status,
        reason_code: null,
        reason_text: null,
        responded_at: new Date().toISOString(),
      });
      toast({ title: status === "available" ? "Confirmado: disponível!" : "Registado: indisponível" });
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────
  const meta   = event ? parseMeta(event) : null;
  const isHome = meta?.is_home ?? null;
  const homeTeam = meta?.home_team ?? (isHome ? "CD Póvoa Masters" : (event?.opponent ?? ""));
  const awayTeam = meta?.away_team ?? (!isHome ? "CD Póvoa Masters" : (event?.opponent ?? ""));
  const pavilion = meta?.pavilion ?? event?.location ?? null;
  const locality = meta?.locality ?? null;
  const mapsUrl  = buildMapsUrl(pavilion, locality);
  const jornada  = meta?.jornada;
  const volta    = meta?.volta;

  const isPast = event ? event.event_date < new Date().toISOString().slice(0, 10) : false;

  // ── Loading ──────────────────────────────────────────────
  if (eventLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
        <p>Jogo não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/jogos")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-20">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Jogos
      </Button>

      {/* ── Cabeçalho do jogo ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {event.is_test && (
            <Badge variant="outline" className="text-[10px] text-slate-500">Teste</Badge>
          )}
          {jornada && (
            <Badge variant="secondary" className="text-xs">
              Jornada {jornada}{volta && volta > 1 ? ` · ${volta}ª Volta` : ""}
            </Badge>
          )}
          {event.competition && (
            <Badge variant="outline" className="gap-0.5 text-[10px] border-cdpovoa-primary/30 text-cdpovoa-primary/80">
              <Trophy className="h-2.5 w-2.5" />
              {event.competition}
            </Badge>
          )}
          {isHome !== null && (
            <Badge
              variant={isHome ? "default" : "outline"}
              className={cn(
                "text-[10px]",
                isHome
                  ? "bg-cdpovoa-primary hover:bg-cdpovoa-primary/90"
                  : "border-cdpovoa-primary/50 text-cdpovoa-primary"
              )}
            >
              <Shield className="h-2.5 w-2.5 mr-1" />
              {isHome ? "Casa" : "Fora"}
            </Badge>
          )}
        </div>

        {/* Equipas */}
        {(meta?.home_team || meta?.away_team) ? (
          <div className="flex items-center gap-3 py-2">
            <span className={cn("flex-1 text-base font-bold truncate", isHome && "text-cdpovoa-primary")}>
              {homeTeam}
            </span>
            <span className="text-muted-foreground font-medium shrink-0">vs</span>
            <span className={cn("flex-1 text-base font-bold truncate text-right", !isHome && "text-cdpovoa-primary")}>
              {awayTeam}
            </span>
          </div>
        ) : (
          <h1 className="text-xl font-bold">
            {event.title}
            {event.opponent && <span className="font-normal text-muted-foreground"> vs. {event.opponent}</span>}
          </h1>
        )}

        {/* Data / hora / local */}
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="capitalize">{fmtDate(event.event_date)}</span>
          </div>
          {event.event_time && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{fmtTime(event.event_time)}h</span>
            </div>
          )}
          {pavilion && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{[pavilion, locality].filter(Boolean).join(", ")}</span>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 flex items-center gap-1 text-orange-500 hover:text-orange-600"
                >
                  <MapIcon className="h-3 w-3" />
                  Mapa
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Disponibilidade ── (só para jogos futuros) */}
      {!isPast && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">A minha disponibilidade</h2>
            {ownLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <StatusBadge status={own?.status ?? null} />
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={saving || ownLoading}
              onClick={() => setAvailability("available")}
              className={cn(
                "flex-1 gap-1.5",
                own?.status === "available"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Disponível
            </Button>
            <Button
              size="sm"
              disabled={saving || ownLoading}
              onClick={() => setAvailability("unavailable")}
              variant="outline"
              className={cn(
                "flex-1 gap-1.5",
                own?.status === "unavailable"
                  ? "border-red-500 bg-red-50 text-red-600 dark:bg-red-950/20 hover:bg-red-100"
                  : ""
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Indisponível
            </Button>
          </div>
        </div>
      )}

      {/* ── Convocados ── */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold text-sm">
          Convocados{callups.length > 0 ? ` (${callups.length})` : ""}
        </h2>
        {callupsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : callups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lista ainda não definida.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {callups.map((c) => (
              <div
                key={c.player.id}
                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground w-5 text-right">
                  {c.player.number ?? ""}
                </span>
                <span>{c.player.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Botões de acção ── */}
      <div className="flex flex-col gap-2">
        <Link href={`/jogos/${gameId}/convocatoria`} className="w-full">
          <Button variant="outline" className="w-full gap-2">
            <Users className="h-4 w-4" />
            Ver convocatória completa
          </Button>
        </Link>
        <Link href={`/jogos/${gameId}/stats`} className="w-full">
          <Button variant="outline" className="w-full gap-2">
            <BarChart2 className="h-4 w-4" />
            Estatísticas
          </Button>
        </Link>
        <Link href={`/jogos/${gameId}/live`} className="w-full">
          <Button variant="outline" className="w-full gap-2">
            <Video className="h-4 w-4" />
            Live
          </Button>
        </Link>
      </div>
    </div>
  );
}
