"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminNoticia = {
  id: string; slug: string; title: string;
  cover_image_url: string | null;
  image_status: string | null;
  image_prompt: string | null;
  image_error: string | null;
  image_error_type: string | null;
  image_seed: number | null;
  published_at: string | null; is_published: boolean;
  home_team_name: string | null; away_team_name: string | null;
  game_id: string | null;
};

const FAL_ERROR_LABELS: Record<string, string> = {
  BILLING: "Sem saldo fal.ai — carrega créditos em fal.ai/dashboard/billing",
  AUTH: "Chave FAL_KEY inválida ou expirada — verifica as variáveis de ambiente no Vercel",
  RATE_LIMIT: "Limite de pedidos atingido — tenta novamente em breve",
  TRANSIENT: "Erro temporário na fal.ai",
  CONTENT: "Conteúdo rejeitado pela política da fal.ai",
  UNKNOWN: "Erro desconhecido",
};

type Submission = {
  id: string; event_id: string; status: string;
  home_team_name: string; away_team_name: string;
  home_score: number; away_score: number;
  submitted_by_name: string; submitted_by_team: string | null;
  submitted_at: string; notes: string | null;
};

type AdminGame = {
  id: string; event_date: string; event_time: string | null;
  location: string | null; home_team: string; away_team: string;
  jornada: number | null; volta: number | null; serie: string | null;
  original_scheduled_at: string | null;
  result: { home_score: number; away_score: number } | null;
  result_status: "no_result" | "pending" | "approved";
  pending_count: number;
  submissions: Submission[];
};

type DeletedGame = {
  id: string; event_date: string; event_time: string | null;
  location: string | null; home_team: string; away_team: string;
  jornada: number | null; deleted_at: string;
};

type AuditRecord = {
  id: string; jogo_id: string; alterado_por: string | null;
  valor_antigo: Record<string, unknown> | null;
  valor_novo: Record<string, unknown>;
  motivo: string; created_at: string;
};

type TeamAccessMember = {
  id: string; user_id: string; email: string; role: string; created_at: string;
};
type TeamAccess = {
  team_id: string; team_name: string; team_slug: string | null;
  team_sigla: string | null; logo_url: string | null;
  members: TeamAccessMember[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string, t: string | null) {
  const dt = new Date(d + "T12:00:00");
  const day = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
  return t ? `${day} ${t.slice(0, 5)}` : day;
}

function fmtDateShort(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  no_result: { label: "Sem resultado", bg: "#F3F4F6", color: "#6B7280" },
  pending:   { label: "Pendente",      bg: "#FEF3C7", color: "#92400E" },
  approved:  { label: "Aprovado",      bg: "#D1FAE5", color: "#065F46" },
};

function Chip({ status }: { status: string }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.no_result;
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, padding: "3px 8px",
      borderRadius: "99px", background: s.bg, color: s.color,
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M9.5 2.5L11.5 4.5M2 12l.88-.44.56-.56 7-7L8.44 2 1.56 8.88 1 12z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3.5h10M5.5 3.5V2h3v1.5M3.5 3.5l.75 8h5.5l.75-8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LigaAdminPage() {
  const router = useRouter();
  const [games, setGames]             = useState<AdminGame[]>([]);
  const [competitionId, setCompId]    = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Filters
  const [filterJornada, setFilterJornada] = useState<number | "all">("all");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [filterTeam,    setFilterTeam]    = useState<string>("all");

  // Selected game for inline result editing
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [audit, setAudit]             = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [editHome, setEditHome]       = useState("");
  const [editAway, setEditAway]       = useState("");
  const [editMotivo, setEditMotivo]   = useState("");
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState<string | null>(null);
  const [subActing, setSubActing]     = useState<string | null>(null);
  const [subMotivo, setSubMotivo]     = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [regenMsg, setRegenMsg]       = useState<Record<string, string>>({});

  // Edit game modal
  const [editingGame, setEditingGame]         = useState<AdminGame | null>(null);
  const [editDate, setEditDate]               = useState("");
  const [editTime, setEditTime]               = useState("");
  const [editLocation, setEditLocation]       = useState("");
  const [editJornada, setEditJornada]         = useState("");
  const [editVolta, setEditVolta]             = useState("");
  const [editHomeTeam, setEditHomeTeam]       = useState("");
  const [editAwayTeam, setEditAwayTeam]       = useState("");
  const [editSaving, setEditSaving]           = useState(false);
  const [editError, setEditError]             = useState<string | null>(null);

  // Delete confirm modal
  const [deletingGame, setDeletingGame]       = useState<AdminGame | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting]               = useState(false);
  const [deleteError, setDeleteError]         = useState<string | null>(null);
  const deleteInputRef                        = useRef<HTMLInputElement>(null);

  // Deleted games section
  const [deletedGames, setDeletedGames]       = useState<DeletedGame[]>([]);
  const [loadingDeleted, setLoadingDeleted]   = useState(false);
  const [showDeleted, setShowDeleted]         = useState(false);
  const [restoring, setRestoring]             = useState<string | null>(null);

  // Team access tab
  const [activeTab, setActiveTab]             = useState<"games" | "access" | "noticias">("games");

  // Notícias tab
  const [noticias, setNoticias]               = useState<AdminNoticia[]>([]);
  const [loadingNoticias, setLoadingNoticias] = useState(false);
  const [uploadingId, setUploadingId]         = useState<string | null>(null);
  const [removingId, setRemovingId]           = useState<string | null>(null);
  const [noticiaMsg, setNoticiaMsg]           = useState<Record<string, string>>({});
  const [regenModal, setRegenModal]           = useState<{ id: string; currentPrompt: string | null } | null>(null);
  const [regenModalPrompt, setRegenModalPrompt] = useState("");
  const [regenLoading, setRegenLoading]       = useState(false);
  const [batchLoading, setBatchLoading]       = useState(false);
  const [teamAccess, setTeamAccess]           = useState<TeamAccess[]>([]);
  const [loadingAccess, setLoadingAccess]     = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTeamId, setCreateTeamId]       = useState("");
  const [createEmail, setCreateEmail]         = useState("");
  const [createLoading, setCreateLoading]     = useState(false);
  const [createError, setCreateError]         = useState<string | null>(null);
  const [resetUserId, setResetUserId]         = useState<string | null>(null);
  const [resetEmail, setResetEmail]           = useState("");
  const [resetLoading, setResetLoading]       = useState(false);
  const [resetError, setResetError]           = useState<string | null>(null);
  const [removeUserId, setRemoveUserId]       = useState<string | null>(null);
  const [removeEmail, setRemoveEmail]         = useState("");
  const [removeTeamName, setRemoveTeamName]   = useState("");
  const [removeLoading, setRemoveLoading]     = useState(false);
  const [removeError, setRemoveError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/liga/admin/games");
      if (res.status === 401 || res.status === 403) {
        router.push("/liga-inatel/equipa/login?msg=admin_required");
        return;
      }
      if (!res.ok) { setError("Erro ao carregar jogos."); return; }
      const json = await res.json();
      setGames(json.games ?? []);
      setCompId(json.competition_id ?? null);
    } catch { setError("Erro de rede."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function loadAudit(eventId: string) {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/liga/admin/games/${eventId}/audit`);
      const json = await res.json();
      setAudit(json.audit ?? []);
    } finally { setAuditLoading(false); }
  }

  async function loadDeletedGames() {
    setLoadingDeleted(true);
    try {
      const res = await fetch("/api/liga/admin/games/deleted");
      const json = await res.json();
      setDeletedGames(json.games ?? []);
    } finally { setLoadingDeleted(false); }
  }

  function selectGame(game: AdminGame) {
    const same = selectedId === game.id;
    setSelectedId(same ? null : game.id);
    setAudit([]);
    setSaveMsg(null);
    if (!same) {
      setEditHome(game.result ? String(game.result.home_score) : "");
      setEditAway(game.result ? String(game.result.away_score) : "");
      setEditMotivo("");
      loadAudit(game.id);
    }
  }

  async function handleSaveResult(game: AdminGame) {
    if (!editMotivo.trim()) { setSaveMsg("Motivo obrigatório."); return; }
    const hs = parseInt(editHome, 10);
    const as_ = parseInt(editAway, 10);
    if (isNaN(hs) || isNaN(as_)) { setSaveMsg("Pontuação inválida."); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/liga/admin/games/${game.id}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home_score: hs, away_score: as_, motivo: editMotivo }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveMsg(json.error ?? "Erro ao guardar."); return; }
      setSaveMsg("✓ Resultado guardado.");
      setEditMotivo("");
      await load();
      await loadAudit(game.id);
    } finally { setSaving(false); }
  }

  async function handleSubAction(subId: string, action: "approve" | "reject", eventId: string) {
    const motivo = subMotivo[subId]?.trim();
    if (!motivo) { alert("Motivo obrigatório para esta acção."); return; }
    setSubActing(subId);
    try {
      const res = await fetch(`/api/liga/admin/submissions/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, motivo }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await load();
      await loadAudit(eventId);
    } finally { setSubActing(null); }
  }

  async function handleRegenerateNews(gameId: string) {
    setRegenerating(gameId);
    setRegenMsg(m => ({ ...m, [gameId]: "" }));
    try {
      const res = await fetch("/api/liga/admin/generate-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRegenMsg(m => ({ ...m, [gameId]: `Erro: ${json.error ?? "falhou"}` }));
      } else {
        setRegenMsg(m => ({ ...m, [gameId]: "✓ Notícia gerada/actualizada." }));
      }
    } finally {
      setRegenerating(null);
    }
  }

  function openEditModal(game: AdminGame, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingGame(game);
    setEditDate(game.event_date);
    setEditTime(game.event_time?.slice(0, 5) ?? "");
    setEditLocation(game.location ?? "");
    setEditJornada(game.jornada !== null ? String(game.jornada) : "");
    setEditVolta(game.volta !== null ? String(game.volta) : "");
    setEditHomeTeam(game.home_team);
    setEditAwayTeam(game.away_team);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editingGame) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {
        event_date: editDate || undefined,
        event_time: editTime || null,
        location: editLocation.trim() || null,
        jornada: editJornada !== "" ? parseInt(editJornada, 10) : null,
        volta: editVolta !== "" ? parseInt(editVolta, 10) : null,
      };
      if (!editingGame.result) {
        body.home_team = editHomeTeam.trim();
        body.away_team = editAwayTeam.trim();
      }
      const res = await fetch(`/api/liga/admin/games/${editingGame.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error ?? "Erro ao guardar."); return; }
      setEditingGame(null);
      await load();
    } finally { setEditSaving(false); }
  }

  function openDeleteModal(game: AdminGame, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingGame(game);
    setDeleteConfirmText("");
    setDeleteError(null);
    // Focus the input after modal opens
    setTimeout(() => deleteInputRef.current?.focus(), 50);
  }

  async function handleDeleteConfirm() {
    if (!deletingGame) return;
    if (deletingGame.result && deleteConfirmText !== "ELIMINAR") {
      setDeleteError('Escreve "ELIMINAR" para confirmar.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/liga/admin/games/${deletingGame.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setDeleteError(json.error ?? "Erro ao eliminar."); return; }
      setDeletingGame(null);
      if (selectedId === deletingGame.id) setSelectedId(null);
      await load();
      if (showDeleted) await loadDeletedGames();
    } finally { setDeleting(false); }
  }

  async function handleRestore(id: string) {
    setRestoring(id);
    try {
      const res = await fetch(`/api/liga/admin/games/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await Promise.all([load(), loadDeletedGames()]);
    } finally { setRestoring(null); }
  }

  async function toggleDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    if (next && deletedGames.length === 0) await loadDeletedGames();
  }

  const loadNoticias = useCallback(async () => {
    setLoadingNoticias(true);
    try {
      const res = await fetch("/api/liga/admin/news");
      if (!res.ok) return;
      const json = await res.json();
      setNoticias(json.news ?? []);
    } finally { setLoadingNoticias(false); }
  }, []);

  // Polling: actualiza notícias enquanto alguma tem image_status='pending'
  const hasPendingImages = noticias.some(n => n.image_status === "pending");
  useEffect(() => {
    if (activeTab !== "noticias" || !hasPendingImages) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/liga/admin/news");
        if (!res.ok || cancelled) return;
        const incoming: AdminNoticia[] = (await res.json()).news ?? [];
        if (cancelled) return;
        setNoticias(prev => {
          // Limpa "⏳ A gerar..." para artigos que saíram de pending
          const idsNoLongerPending = prev
            .filter(p => p.image_status === "pending")
            .filter(p => incoming.find(n => n.id === p.id)?.image_status !== "pending")
            .map(p => p.id);
          if (idsNoLongerPending.length > 0) {
            setNoticiaMsg(m => {
              const next = { ...m };
              idsNoLongerPending.forEach(id => delete next[id]);
              return next;
            });
          }
          return incoming;
        });
      } catch { /* ignore */ }
    }, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasPendingImages]);

  async function handleRegen(id: string, customPrompt?: string) {
    setRegenLoading(true);
    setNoticiaMsg(m => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/liga/admin/news/${id}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customPrompt ? { custom_prompt: customPrompt } : {}),
      });
      const json = await res.json();
      if (res.ok) {
        setNoticias(prev => prev.map(n => n.id === id ? { ...n, image_status: "pending" } : n));
        setNoticiaMsg(m => ({ ...m, [id]: "⏳ A gerar imagem…" }));
      } else {
        setNoticiaMsg(m => ({ ...m, [id]: `Erro: ${json.error ?? "falhou"}` }));
      }
    } finally {
      setRegenLoading(false);
      setRegenModal(null);
    }
  }

  async function handleBatchGen() {
    setBatchLoading(true);
    try {
      const res = await fetch("/api/liga/admin/news/generate-images-batch", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.count > 0) {
        setNoticias(prev => prev.map(n =>
          !n.cover_image_url && n.image_status !== "pending"
            ? { ...n, image_status: "pending" }
            : n
        ));
        setNoticiaMsg(() => ({ _batch: `⏳ ${json.count} notícia(s) enfileirada(s).` }));
      } else if (res.ok) {
        setNoticiaMsg(() => ({ _batch: "Todas as notícias já têm imagem." }));
      } else {
        setNoticiaMsg(() => ({ _batch: `Erro: ${json.error ?? "falhou"}` }));
      }
    } finally { setBatchLoading(false); }
  }

  async function handleImageUpload(id: string, file: File) {
    setUploadingId(id);
    setNoticiaMsg(m => ({ ...m, [id]: "" }));
    const form = new FormData();
    form.append("image", file);
    try {
      const res = await fetch(`/api/liga/admin/news/${id}/image`, { method: "PATCH", body: form });
      const json = await res.json();
      if (res.ok) {
        setNoticias(prev => prev.map(n => n.id === id ? { ...n, cover_image_url: json.cover_image_url } : n));
        setNoticiaMsg(m => ({ ...m, [id]: "✓ Imagem guardada." }));
      } else {
        setNoticiaMsg(m => ({ ...m, [id]: `Erro: ${json.error ?? "falhou"}` }));
      }
    } finally { setUploadingId(null); }
  }

  async function handleImageRemove(id: string) {
    setRemovingId(id);
    setNoticiaMsg(m => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/liga/admin/news/${id}/image`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        setNoticias(prev => prev.map(n => n.id === id ? { ...n, cover_image_url: null } : n));
        setNoticiaMsg(m => ({ ...m, [id]: "✓ Imagem removida." }));
      } else {
        setNoticiaMsg(m => ({ ...m, [id]: `Erro: ${json.error ?? "falhou"}` }));
      }
    } finally { setRemovingId(null); }
  }

  async function loadTeamAccess() {
    setLoadingAccess(true);
    try {
      const res = await fetch("/api/liga/admin/team-access");
      if (!res.ok) return;
      const json = await res.json();
      setTeamAccess(json.teams ?? []);
    } finally { setLoadingAccess(false); }
  }

  function openCreateModal(teamId: string) {
    setCreateTeamId(teamId);
    setCreateEmail(""); setCreateError(null);
    setShowCreateModal(true);
  }

  async function handleCreateAccess() {
    if (!createEmail.trim()) return;
    setCreateLoading(true); setCreateError(null);
    try {
      const res = await fetch("/api/liga/admin/team-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: createTeamId, email: createEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? "Erro ao criar acesso."); return; }
      setShowCreateModal(false);
      await loadTeamAccess();
    } finally { setCreateLoading(false); }
  }

  function openResetModal(userId: string, email: string) {
    setResetUserId(userId); setResetEmail(email); setResetError(null);
  }

  async function handleResetPassword() {
    if (!resetUserId) return;
    setResetLoading(true); setResetError(null);
    try {
      const res = await fetch(`/api/liga/admin/team-access/${resetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) { setResetError(json.error ?? "Erro ao redefinir password."); return; }
      setResetUserId(null);
    } finally { setResetLoading(false); }
  }

  function openRemoveModal(userId: string, email: string, teamName: string) {
    setRemoveUserId(userId); setRemoveEmail(email); setRemoveTeamName(teamName); setRemoveError(null);
  }

  async function handleRemoveAccess() {
    if (!removeUserId) return;
    setRemoveLoading(true); setRemoveError(null);
    try {
      const res = await fetch(`/api/liga/admin/team-access/${removeUserId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { setRemoveError(json.error ?? "Erro ao remover acesso."); return; }
      setRemoveUserId(null);
      await loadTeamAccess();
    } finally { setRemoveLoading(false); }
  }

  // Derived filter data
  const jornadas = [...new Set(games.map(g => g.jornada).filter(Boolean) as number[])].sort((a, b) => a - b);
  const teams = [...new Set([...games.map(g => g.home_team), ...games.map(g => g.away_team)])].sort();

  const filtered = games.filter(g => {
    if (filterJornada !== "all" && g.jornada !== filterJornada) return false;
    if (filterStatus  !== "all" && g.result_status !== filterStatus) return false;
    if (filterTeam    !== "all" && g.home_team !== filterTeam && g.away_team !== filterTeam) return false;
    return true;
  });

  const selectedGame = games.find(g => g.id === selectedId) ?? null;

  if (loading) return (
    <div style={{ padding: "80px 20px", textAlign: "center", color: "#6F675F", fontSize: "14px" }}>
      A carregar jogos…
    </div>
  );

  if (error) return (
    <div style={{ padding: "80px 20px", textAlign: "center", color: "#DC2626", fontSize: "14px" }}>{error}</div>
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px 64px" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <div>
          <p style={{
            fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px",
            fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "#F97316", margin: "0 0 4px",
          }}>LIGA INATEL · SUPER-ADMIN</p>
          <h1 style={{
            fontFamily: "var(--font-bc-heavy, sans-serif)", fontWeight: 800,
            fontSize: "clamp(24px, 5vw, 36px)", letterSpacing: "0.04em",
            textTransform: "uppercase", color: "#1A1612", margin: 0,
          }}>Painel de Administração</h1>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link href="/liga-inatel" style={{ fontSize: "12px", color: "#8C837A", textDecoration: "none" }}>
            ← Liga INATEL
          </Link>
          <span style={{ color: "#D1C9C0" }}>·</span>
          <SignOutBtn />
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ display: "flex", gap: "0", marginBottom: "24px", borderBottom: "2px solid #E8E0D6" }}>
        {(["games", "access", "noticias"] as const).map(tab => (
          <button key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "access" && teamAccess.length === 0) loadTeamAccess();
              if (tab === "noticias" && noticias.length === 0) loadNoticias();
            }}
            style={{
              padding: "8px 20px", fontWeight: 700, fontSize: "12px",
              letterSpacing: "0.06em", textTransform: "uppercase",
              border: "none", background: "none", cursor: "pointer",
              color: activeTab === tab ? "#F97316" : "#8C837A",
              borderBottom: `2px solid ${activeTab === tab ? "#F97316" : "transparent"}`,
              marginBottom: "-2px",
            }}>
            {tab === "games" ? "Jogos" : tab === "access" ? "Acessos das Equipas" : "Notícias"}
          </button>
        ))}
      </div>

      {activeTab === "games" && <>

      {/* ── Filters ── */}
      <div style={{
        display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px",
        padding: "12px 16px", background: "#FFFDFA",
        borderRadius: "8px", border: "1px solid #E8E0D6",
      }}>
        <select
          value={filterJornada === "all" ? "all" : String(filterJornada)}
          onChange={e => setFilterJornada(e.target.value === "all" ? "all" : Number(e.target.value))}
          style={selectStyle}
        >
          <option value="all">Todas as jornadas</option>
          {jornadas.map(j => <option key={j} value={j}>Jornada {j}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">Todos os estados</option>
          <option value="no_result">Sem resultado</option>
          <option value="pending">Pendente</option>
          <option value="approved">Aprovado</option>
        </select>

        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={selectStyle}>
          <option value="all">Todas as equipas</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <span style={{ fontSize: "12px", color: "#8C837A", alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length}/{games.length} jogos
        </span>
      </div>

      {/* ── Game list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#8C837A", fontSize: "14px", padding: "40px 0" }}>
            Nenhum jogo encontrado com estes filtros.
          </p>
        )}

        {filtered.map(game => {
          const isSelected = selectedId === game.id;
          const isRescheduled = Boolean(game.original_scheduled_at);

          return (
            <div key={game.id} style={{
              borderRadius: "8px", border: `1px solid ${isSelected ? "#F97316" : "#E8E0D6"}`,
              background: "#FFFDFA", overflow: "hidden",
              boxShadow: isSelected ? "0 0 0 2px rgba(249,115,22,.15)" : undefined,
            }}>
              {/* Game row */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px" }}>
                {/* Expand button – main click area */}
                <button
                  onClick={() => selectGame(game)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    flex: 1, minWidth: 0,
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", padding: 0,
                  }}
                >
                  <div style={{
                    width: "40px", textAlign: "center", flexShrink: 0,
                    fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px",
                    fontWeight: 600, color: "#F97316", letterSpacing: "0.08em",
                  }}>
                    J{game.jornada ?? "?"}
                    {game.volta ? <div style={{ fontSize: "9px", color: "#B9AFA4" }}>V{game.volta}</div> : null}
                    {game.serie ? <div style={{ fontSize: "8px", color: "#B9AFA4" }}>{game.serie}</div> : null}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{
                        fontWeight: 700, fontSize: "14px", color: "#1A1612",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}>
                        {game.home_team} <span style={{ color: "#8C837A", fontWeight: 400 }}>vs</span> {game.away_team}
                      </span>
                      {isRescheduled && (
                        <span style={{
                          fontSize: "9px", fontWeight: 700, padding: "2px 6px",
                          borderRadius: "99px", background: "#EFF6FF", color: "#1D4ED8",
                          letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0,
                        }}>Reagendado</span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "#8C837A", marginTop: "1px" }}>
                      {fmtDate(game.event_date, game.event_time)}
                      {game.location ? ` · ${game.location}` : ""}
                      {isRescheduled && game.original_scheduled_at && (
                        <span style={{ color: "#93C5FD" }}>
                          {" "}(orig. {fmtDateShort(game.original_scheduled_at.slice(0, 10))})
                        </span>
                      )}
                    </div>
                  </div>

                  {game.result && (
                    <div style={{
                      fontFamily: "var(--font-ibm-mono, monospace)", fontWeight: 700,
                      fontSize: "16px", color: "#1A1612", flexShrink: 0, letterSpacing: "0.04em",
                    }}>
                      {game.result.home_score}–{game.result.away_score}
                    </div>
                  )}

                  <div style={{ flexShrink: 0, display: "flex", gap: "6px", alignItems: "center" }}>
                    <Chip status={game.result_status} />
                    {game.pending_count > 0 && (
                      <span style={{
                        background: "#F97316", color: "#fff",
                        borderRadius: "99px", fontSize: "10px", fontWeight: 700,
                        padding: "1px 7px",
                      }}>{game.pending_count}</span>
                    )}
                  </div>

                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
                    transform: isSelected ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform .15s", flexShrink: 0, opacity: 0.5,
                  }}>
                    <path d="M4 2l4 4-4 4" stroke="#1A1612" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Edit / Delete icon buttons */}
                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                  <button
                    onClick={e => openEditModal(game, e)}
                    title="Editar jogo"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: "30px", height: "30px", borderRadius: "6px",
                      border: "1.5px solid #E8E0D6", background: "#FFFDFA",
                      color: "#6B7280", cursor: "pointer",
                    }}
                  >
                    <IconPencil />
                  </button>
                  <button
                    onClick={e => openDeleteModal(game, e)}
                    title="Eliminar jogo"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: "30px", height: "30px", borderRadius: "6px",
                      border: "1.5px solid #FCA5A5", background: "#FFF5F5",
                      color: "#DC2626", cursor: "pointer",
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>

              {/* Expanded detail panel */}
              {isSelected && selectedGame?.id === game.id && (
                <div style={{ padding: "0 16px 20px", borderTop: "1px solid #F0EAE1" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", paddingTop: "16px" }}>

                    {/* Result edit form */}
                    <div>
                      <h3 style={sectionTitle}>Editar resultado</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <label style={labelStyle}>{selectedGame.home_team}</label>
                          <input type="number" min={0} value={editHome}
                            onChange={e => setEditHome(e.target.value)}
                            style={inputStyle} placeholder="Pontos" />
                        </div>
                        <div>
                          <label style={labelStyle}>{selectedGame.away_team}</label>
                          <input type="number" min={0} value={editAway}
                            onChange={e => setEditAway(e.target.value)}
                            style={inputStyle} placeholder="Pontos" />
                        </div>
                      </div>
                      <div style={{ marginBottom: "8px" }}>
                        <label style={labelStyle}>Motivo da correção *</label>
                        <input type="text" value={editMotivo}
                          onChange={e => setEditMotivo(e.target.value)}
                          placeholder="Ex: Correção de erro de transcrição"
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                      </div>
                      {saveMsg && (
                        <p style={{
                          fontSize: "12px", margin: "0 0 8px",
                          color: saveMsg.startsWith("✓") ? "#065F46" : "#DC2626",
                        }}>{saveMsg}</p>
                      )}
                      <button
                        onClick={() => handleSaveResult(selectedGame)}
                        disabled={saving}
                        style={{
                          padding: "8px 16px",
                          background: saving ? "#D1C9C0" : "#F97316",
                          color: "#fff", fontWeight: 700, fontSize: "13px",
                          border: "none", borderRadius: "6px",
                          cursor: saving ? "not-allowed" : "pointer",
                        }}
                      >
                        {saving ? "A guardar…" : "Guardar resultado"}
                      </button>

                      {/* Regenerar notícia — só para jogos com resultado aprovado */}
                      {selectedGame.result_status === "approved" && (
                        <div style={{ marginTop: "10px" }}>
                          <button
                            onClick={() => handleRegenerateNews(selectedGame.id)}
                            disabled={regenerating === selectedGame.id}
                            style={{
                              padding: "7px 14px",
                              background: regenerating === selectedGame.id ? "#D1C9C0" : "#FFFDFA",
                              color: regenerating === selectedGame.id ? "#8C837A" : "#1A1612",
                              fontWeight: 600, fontSize: "12px",
                              border: "1.5px solid #E8E0D6", borderRadius: "6px",
                              cursor: regenerating === selectedGame.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {regenerating === selectedGame.id ? "A gerar…" : "⟳ Regenerar notícia"}
                          </button>
                          {regenMsg[selectedGame.id] && (
                            <p style={{
                              fontSize: "11px", marginTop: "5px",
                              color: regenMsg[selectedGame.id].startsWith("✓") ? "#065F46" : "#DC2626",
                            }}>
                              {regenMsg[selectedGame.id]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Submissions */}
                    <div>
                      <h3 style={sectionTitle}>Submissões ({selectedGame.submissions.length})</h3>
                      {selectedGame.submissions.length === 0 ? (
                        <p style={{ fontSize: "13px", color: "#8C837A" }}>Sem submissões.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {selectedGame.submissions.map((sub) => (
                            <div key={sub.id} style={{
                              padding: "10px 12px", background: "#F6F2EC",
                              borderRadius: "6px", fontSize: "13px",
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span style={{ fontWeight: 600 }}>{sub.home_score}–{sub.away_score}</span>
                                <Chip status={sub.status} />
                              </div>
                              <div style={{ color: "#6B7280", fontSize: "11px", marginBottom: "6px" }}>
                                {sub.submitted_by_name}{sub.submitted_by_team ? ` · ${sub.submitted_by_team}` : ""}
                                {" · "}{new Date(sub.submitted_at).toLocaleDateString("pt-PT")}
                              </div>
                              {sub.notes && (
                                <p style={{ fontSize: "11px", color: "#6B7280", margin: "0 0 6px" }}>
                                  Nota: {sub.notes}
                                </p>
                              )}
                              {sub.status === "pending" && (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                                  <input
                                    type="text"
                                    placeholder="Motivo *"
                                    value={subMotivo[sub.id] ?? ""}
                                    onChange={e => setSubMotivo(m => ({ ...m, [sub.id]: e.target.value }))}
                                    style={{ ...inputStyle, flex: 1, minWidth: "120px", fontSize: "11px", padding: "5px 8px" }}
                                  />
                                  <button
                                    onClick={() => handleSubAction(sub.id, "approve", selectedGame.id)}
                                    disabled={subActing === sub.id}
                                    style={{ padding: "5px 10px", background: "#16A34A", color: "#fff", fontWeight: 700, fontSize: "11px", border: "none", borderRadius: "5px", cursor: "pointer" }}
                                  >
                                    ✓ Aprovar
                                  </button>
                                  <button
                                    onClick={() => handleSubAction(sub.id, "reject", selectedGame.id)}
                                    disabled={subActing === sub.id}
                                    style={{ padding: "5px 10px", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: "11px", border: "none", borderRadius: "5px", cursor: "pointer" }}
                                  >
                                    ✗ Rejeitar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Audit */}
                  <div style={{ marginTop: "16px" }}>
                    <h3 style={sectionTitle}>Histórico de alterações</h3>
                    {auditLoading ? (
                      <p style={{ fontSize: "12px", color: "#8C837A" }}>A carregar…</p>
                    ) : audit.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "#8C837A" }}>Sem alterações registadas.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {audit.map(a => (
                          <div key={a.id} style={{
                            display: "flex", gap: "12px", alignItems: "flex-start",
                            fontSize: "12px", color: "#6B7280",
                            padding: "8px 0", borderTop: "1px solid #F0EAE1",
                          }}>
                            <span style={{ color: "#B9AFA4", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", flexShrink: 0 }}>
                              {new Date(a.created_at).toLocaleString("pt-PT")}
                            </span>
                            <div>
                              <span style={{ color: "#1A1612", fontWeight: 600 }}>
                                {a.valor_antigo
                                  ? `${(a.valor_antigo as { home_score?: number }).home_score ?? "?"} – ${(a.valor_antigo as { away_score?: number }).away_score ?? "?"} → `
                                  : ""}
                                {(a.valor_novo as { home_score?: number }).home_score !== undefined
                                  ? `${(a.valor_novo as { home_score: number }).home_score} – ${(a.valor_novo as { away_score: number }).away_score}`
                                  : JSON.stringify(a.valor_novo)}
                              </span>
                              {" · "}
                              <em>{a.motivo}</em>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Deleted games toggle ── */}
      <div style={{ marginTop: "32px" }}>
        <button
          onClick={toggleDeleted}
          style={{
            fontSize: "12px", color: "#8C837A",
            background: "none", border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
            transform: showDeleted ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s",
          }}>
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Jogos eliminados {deletedGames.length > 0 ? `(${deletedGames.length})` : ""}
        </button>

        {showDeleted && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {loadingDeleted && (
              <p style={{ fontSize: "12px", color: "#8C837A" }}>A carregar…</p>
            )}
            {!loadingDeleted && deletedGames.length === 0 && (
              <p style={{ fontSize: "12px", color: "#8C837A" }}>Nenhum jogo eliminado.</p>
            )}
            {deletedGames.map(g => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 16px", borderRadius: "8px",
                border: "1px solid #E8E0D6", background: "#FFF5F5",
                opacity: restoring === g.id ? 0.5 : 1,
              }}>
                <div style={{
                  fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px",
                  fontWeight: 600, color: "#B9AFA4", width: "32px", flexShrink: 0,
                }}>
                  J{g.jornada ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#6B7280" }}>
                    {g.home_team} vs {g.away_team}
                  </div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "1px" }}>
                    {fmtDate(g.event_date, g.event_time)}
                    {g.location ? ` · ${g.location}` : ""}
                    {" · "}eliminado em {new Date(g.deleted_at).toLocaleDateString("pt-PT")}
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(g.id)}
                  disabled={restoring === g.id}
                  style={{
                    padding: "5px 12px", fontSize: "12px", fontWeight: 600,
                    border: "1.5px solid #D1C9C0", borderRadius: "6px",
                    background: "#FFFDFA", color: "#6B7280",
                    cursor: restoring === g.id ? "not-allowed" : "pointer",
                  }}
                >
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </>}

      {/* ── Notícias section ── */}
      {activeTab === "noticias" && (
        <div>
          {/* Banners de erro de conta */}
          {noticias.some(n => n.image_error_type === "BILLING") && (
            <div style={{
              marginBottom: "14px", padding: "12px 16px", borderRadius: "8px",
              background: "#FEF3C7", border: "1.5px solid #F59E0B",
              fontSize: "12px", color: "#78350F", lineHeight: 1.5,
            }}>
              <strong>⚠️ Conta fal.ai sem saldo</strong> — carrega créditos em{" "}
              <a href="https://fal.ai/dashboard/billing" target="_blank" rel="noopener noreferrer"
                style={{ color: "#B45309", textDecoration: "underline" }}>fal.ai/dashboard/billing</a>
              {" "}para gerar imagens com IA. O upload manual continua disponível.
            </div>
          )}
          {noticias.some(n => n.image_error_type === "AUTH") && (
            <div style={{
              marginBottom: "14px", padding: "12px 16px", borderRadius: "8px",
              background: "#FEE2E2", border: "1.5px solid #F87171",
              fontSize: "12px", color: "#7F1D1D", lineHeight: 1.5,
            }}>
              <strong>⚠️ Chave FAL_KEY inválida</strong> — verifica as variáveis de ambiente no Vercel.
            </div>
          )}

          {/* Header com acções globais */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {(() => {
                const hasBlockingError = noticias.some(n => n.image_error_type === "BILLING" || n.image_error_type === "AUTH");
                return (
                  <button
                    onClick={handleBatchGen}
                    disabled={batchLoading || hasBlockingError}
                    title={hasBlockingError ? "Resolve o erro de conta antes de gerar em lote" : undefined}
                    style={{
                      padding: "6px 14px", fontSize: "12px", fontWeight: 700,
                      border: "1.5px solid #6366F1", borderRadius: "6px",
                      background: "transparent",
                      color: (batchLoading || hasBlockingError) ? "#D1C9C0" : "#6366F1",
                      cursor: (batchLoading || hasBlockingError) ? "not-allowed" : "pointer",
                    }}
                  >
                    {batchLoading ? "A enfileirar…" : "⚡ Gerar imagens em falta"}
                  </button>
                );
              })()}
              {noticiaMsg._batch && (
                <span style={{ fontSize: "11px", color: noticiaMsg._batch.startsWith("⏳") ? "#065F46" : noticiaMsg._batch.startsWith("Erro") ? "#DC2626" : "#6B7280" }}>
                  {noticiaMsg._batch}
                </span>
              )}
            </div>
            <button
              onClick={loadNoticias}
              style={{ fontSize: "12px", color: "#8C837A", background: "none", border: "none", cursor: "pointer" }}
            >
              ↺ Actualizar
            </button>
          </div>

          {loadingNoticias && (
            <p style={{ fontSize: "14px", color: "#8C837A", padding: "40px 0", textAlign: "center" }}>A carregar notícias…</p>
          )}

          {!loadingNoticias && noticias.length === 0 && (
            <p style={{ fontSize: "14px", color: "#8C837A", padding: "40px 0", textAlign: "center" }}>Sem notícias da Liga INATEL.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {noticias.map(n => {
              const isUploading = uploadingId === n.id;
              const isRemoving  = removingId === n.id;
              const isPending   = n.image_status === "pending";
              const isReady     = n.image_status === "ready";
              const isFailed    = n.image_status === "failed";
              const isBlockingError = n.image_error_type === "BILLING" || n.image_error_type === "AUTH";
              const errorLabel  = n.image_error_type ? (FAL_ERROR_LABELS[n.image_error_type] ?? FAL_ERROR_LABELS.UNKNOWN) : null;
              const msg = noticiaMsg[n.id];
              return (
                <div key={n.id} style={{
                  display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap",
                  padding: "12px 16px", borderRadius: "8px",
                  border: "1px solid #E8E0D6", background: "#FFFDFA",
                }}>
                  {/* Thumbnail */}
                  <div style={{
                    width: "80px", height: "45px", borderRadius: "6px",
                    overflow: "hidden", flexShrink: 0, position: "relative",
                    background: n.cover_image_url ? undefined : "linear-gradient(135deg,#F97316,#C2530A)",
                  }}>
                    {n.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.cover_image_url} alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: "8px", color: "#fff", fontWeight: 800, letterSpacing: "0.06em" }}>
                          {isPending ? "…" : "SEM IMG"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: "160px" }}>
                    <p style={{
                      fontSize: "13px", fontWeight: 600, color: "#1A1612", margin: "0 0 4px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{n.title}</p>

                    {/* Status + data */}
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "4px" }}>
                      {isPending && (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px", background: "#FEF3C7", color: "#92400E", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          ⟳ A gerar…
                        </span>
                      )}
                      {isReady && (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px", background: "#D1FAE5", color: "#065F46", letterSpacing: "0.06em", textTransform: "uppercase" }}
                          title={n.image_seed != null ? `seed: ${n.image_seed}` : undefined}>
                          IA ✓
                        </span>
                      )}
                      {isFailed && (
                        <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px", background: "#FEE2E2", color: "#991B1B", letterSpacing: "0.06em", textTransform: "uppercase" }}
                          title={n.image_error ?? undefined}>
                          Falhou
                        </span>
                      )}
                      <span style={{ fontSize: "10px", color: "#8C837A" }}>
                        {n.published_at ? new Date(n.published_at).toLocaleDateString("pt-PT") : "—"}
                        {n.home_team_name ? ` · ${n.home_team_name} vs ${n.away_team_name}` : ""}
                      </span>
                    </div>

                    {/* Prompt preview */}
                    {n.image_prompt && (
                      <p style={{
                        fontSize: "10px", color: "#9CA3AF", margin: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: "360px", fontStyle: "italic",
                      }} title={n.image_prompt}>
                        "{n.image_prompt.slice(0, 80)}{n.image_prompt.length > 80 ? "…" : ""}"
                      </p>
                    )}

                    {/* Erro de geração */}
                    {isFailed && (
                      <p style={{
                        fontSize: "10px", color: "#991B1B", margin: "3px 0 0",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: "360px",
                      }} title={n.image_error ?? undefined}>
                        {errorLabel ?? n.image_error?.slice(0, 100) ?? "Erro desconhecido"}
                      </p>
                    )}

                    {msg && (
                      <p style={{ fontSize: "11px", margin: "4px 0 0", color: msg.startsWith("✓") || msg.startsWith("⏳") ? "#065F46" : "#DC2626" }}>{msg}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0, flexWrap: "wrap" }}>
                    {/* Gerar / Regenerar com IA */}
                    {!isPending && (
                      <button
                        onClick={() => {
                          setRegenModal({ id: n.id, currentPrompt: n.image_prompt });
                          setRegenModalPrompt(n.image_prompt ?? "");
                        }}
                        disabled={isBlockingError}
                        title={isBlockingError ? errorLabel ?? undefined : undefined}
                        style={{
                          padding: "5px 12px", fontSize: "11px", fontWeight: 700,
                          border: "1.5px solid #6366F1", borderRadius: "6px",
                          background: "transparent",
                          color: isBlockingError ? "#D1C9C0" : "#6366F1",
                          cursor: isBlockingError ? "not-allowed" : "pointer",
                        }}
                      >
                        {isReady ? "↻ Regenerar IA" : isFailed ? "↻ Tentar novamente" : "⚡ Gerar imagem IA"}
                      </button>
                    )}

                    {/* Upload manual */}
                    <label style={{
                      padding: "5px 12px", fontSize: "11px", fontWeight: 700,
                      border: "1.5px solid #F97316", borderRadius: "6px",
                      background: "transparent", color: isUploading ? "#D1C9C0" : "#F97316",
                      cursor: isUploading ? "not-allowed" : "pointer",
                    }}>
                      {isUploading ? "A enviar…" : n.cover_image_url ? "Substituir" : "Carregar"}
                      <input
                        type="file" accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        disabled={isUploading}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(n.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {/* Remover */}
                    {n.cover_image_url && (
                      <button
                        onClick={() => handleImageRemove(n.id)}
                        disabled={isRemoving}
                        style={{
                          padding: "5px 10px", fontSize: "11px", fontWeight: 600,
                          border: "1.5px solid #FCA5A5", borderRadius: "6px",
                          background: "#FFF5F5", color: isRemoving ? "#D1C9C0" : "#DC2626",
                          cursor: isRemoving ? "not-allowed" : "pointer",
                        }}
                      >
                        {isRemoving ? "…" : "Remover"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Regen modal ── */}
      {regenModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "16px",
        }}
          onClick={() => !regenLoading && setRegenModal(null)}
        >
          <div style={{
            background: "#FFFDFA", borderRadius: "12px", padding: "24px",
            width: "100%", maxWidth: "520px", boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#6366F1", margin: "0 0 4px",
            }}>Gerar imagem com IA</h2>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "0 0 16px" }}>
              Deixa o prompt em branco para DeepSeek gerar automaticamente. Ou edita o prompt para controlar o resultado.
            </p>

            <div>
              <label style={labelStyle}>Prompt (opcional)</label>
              <textarea
                value={regenModalPrompt}
                onChange={e => setRegenModalPrompt(e.target.value)}
                placeholder="Deixa em branco para gerar com IA…"
                rows={5}
                style={{
                  ...inputStyle, width: "100%", boxSizing: "border-box",
                  resize: "vertical", fontFamily: "var(--font-barlow, sans-serif)",
                  lineHeight: 1.5,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                onClick={() => setRegenModal(null)}
                disabled={regenLoading}
                style={{ ...btnSecondary }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRegen(regenModal.id, regenModalPrompt.trim() || undefined)}
                disabled={regenLoading}
                style={{ ...btnPrimary, background: "#6366F1", opacity: regenLoading ? 0.6 : 1 }}
              >
                {regenLoading ? "A enfileirar…" : "Gerar imagem"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Team access section ── */}
      {activeTab === "access" && (
        <div>
          {loadingAccess && (
            <p style={{ fontSize: "14px", color: "#8C837A", padding: "40px 0", textAlign: "center" }}>A carregar acessos…</p>
          )}
          {!loadingAccess && teamAccess.map(t => (
            <div key={t.team_id} style={{
              marginBottom: "12px", borderRadius: "10px",
              border: "1px solid #E8E0D6", background: "#FFFDFA", overflow: "hidden",
            }}>
              {/* Team header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", background: "#F9F6F0", borderBottom: "1px solid #E8E0D6",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {t.logo_url ? (
                    <img src={t.logo_url} alt={t.team_name}
                      style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "contain" }} />
                  ) : (
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "6px",
                      background: "#F97316", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: "10px", fontWeight: 900, color: "#fff",
                    }}>
                      {(t.team_sigla ?? t.team_name).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1A1612" }}>{t.team_name}</span>
                  {t.members.length === 0 && (
                    <span style={{ fontSize: "11px", color: "#9CA3AF", fontStyle: "italic" }}>sem acesso</span>
                  )}
                </div>
                <button
                  onClick={() => openCreateModal(t.team_id)}
                  style={{
                    padding: "5px 12px", fontSize: "11px", fontWeight: 700,
                    border: "1.5px solid #F97316", borderRadius: "6px",
                    background: "transparent", color: "#F97316", cursor: "pointer",
                  }}
                >
                  + Criar acesso
                </button>
              </div>

              {/* Members list */}
              {t.members.length > 0 && (
                <div style={{ padding: "0 16px" }}>
                  {t.members.map(m => (
                    <div key={m.id} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 0", borderBottom: "1px solid #F0EAE1",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: "13px", color: "#1A1612", margin: "0 0 2px",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.email}
                        </p>
                        <p style={{ fontSize: "11px", color: "#9CA3AF", margin: 0 }}>
                          {(m.role === "team_manager" || m.role === "delegate") ? "Delegado" : m.role}
                          {" · "}criado em {new Date(m.created_at).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button
                          onClick={() => openResetModal(m.user_id, m.email)}
                          style={{
                            padding: "4px 10px", fontSize: "11px", fontWeight: 600,
                            border: "1.5px solid #D1C9C0", borderRadius: "5px",
                            background: "#FFFDFA", color: "#6B7280", cursor: "pointer",
                          }}
                        >
                          Password
                        </button>
                        <button
                          onClick={() => openRemoveModal(m.user_id, m.email, t.team_name)}
                          style={{
                            padding: "4px 10px", fontSize: "11px", fontWeight: 600,
                            border: "1.5px solid #FCA5A5", borderRadius: "5px",
                            background: "#FFF5F5", color: "#DC2626", cursor: "pointer",
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Edit game modal ── */}
      {editingGame && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "16px",
        }}
          onClick={() => !editSaving && setEditingGame(null)}
        >
          <div style={{
            background: "#FFFDFA", borderRadius: "12px", padding: "24px",
            width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#F97316", margin: "0 0 4px",
            }}>Editar Jogo</h2>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#1A1612", margin: "0 0 20px" }}>
              {editingGame.home_team} vs {editingGame.away_team}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Data</label>
                <input type="date" value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                {editingGame.event_date !== editDate && !editingGame.original_scheduled_at && (
                  <p style={{ fontSize: "11px", color: "#1D4ED8", marginTop: "4px" }}>
                    A data original ({fmtDateShort(editingGame.event_date)}) ficará registada como data inicial.
                  </p>
                )}
              </div>
              <div>
                <label style={labelStyle}>Hora</label>
                <input type="time" value={editTime}
                  onChange={e => setEditTime(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={labelStyle}>Jornada</label>
                <input type="number" min={1} value={editJornada}
                  onChange={e => setEditJornada(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={labelStyle}>Volta</label>
                <input type="number" min={1} value={editVolta}
                  onChange={e => setEditVolta(e.target.value)}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Local</label>
                <input type="text" value={editLocation}
                  onChange={e => setEditLocation(e.target.value)}
                  placeholder="Pavilhão / localidade"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </div>

              {!editingGame.result && (
                <>
                  <div>
                    <label style={labelStyle}>Equipa casa</label>
                    <input type="text" value={editHomeTeam}
                      onChange={e => setEditHomeTeam(e.target.value)}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Equipa fora</label>
                    <input type="text" value={editAwayTeam}
                      onChange={e => setEditAwayTeam(e.target.value)}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                  </div>
                </>
              )}
              {editingGame.result && (
                <p style={{ gridColumn: "1 / -1", fontSize: "11px", color: "#8C837A", margin: 0 }}>
                  As equipas não podem ser alteradas depois de o resultado ser registado.
                </p>
              )}
            </div>

            {editError && (
              <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "12px" }}>{editError}</p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                onClick={() => setEditingGame(null)}
                disabled={editSaving}
                style={{ ...btnSecondary }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                style={{ ...btnPrimary, opacity: editSaving ? 0.6 : 1 }}
              >
                {editSaving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deletingGame && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "16px",
        }}
          onClick={() => !deleting && setDeletingGame(null)}
        >
          <div style={{
            background: "#FFFDFA", borderRadius: "12px", padding: "24px",
            width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#DC2626", margin: "0 0 4px",
            }}>Eliminar Jogo</h2>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#1A1612", margin: "0 0 8px" }}>
              {deletingGame.home_team} vs {deletingGame.away_team}
            </p>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "0 0 16px" }}>
              {fmtDate(deletingGame.event_date, deletingGame.event_time)}
              {deletingGame.location ? ` · ${deletingGame.location}` : ""}
            </p>

            {deletingGame.result ? (
              <>
                <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px" }}>
                  Este jogo tem resultado aprovado ({deletingGame.result.home_score}–{deletingGame.result.away_score}).
                  A eliminação irá remover o resultado e recalcular a classificação.
                </p>
                <div style={{ marginBottom: "4px" }}>
                  <label style={{ ...labelStyle, color: "#DC2626" }}>
                    Escreve ELIMINAR para confirmar
                  </label>
                  <input
                    ref={deleteInputRef}
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="ELIMINAR"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box", borderColor: "#FCA5A5" }}
                  />
                </div>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: "#6B7280", margin: "0 0 16px" }}>
                O jogo será movido para o arquivo de jogos eliminados. Pode ser restaurado depois.
              </p>
            )}

            {deleteError && (
              <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "8px" }}>{deleteError}</p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                onClick={() => setDeletingGame(null)}
                disabled={deleting}
                style={{ ...btnSecondary }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting || (!!deletingGame.result && deleteConfirmText !== "ELIMINAR")}
                style={{
                  ...btnPrimary,
                  background: "#DC2626",
                  opacity: (deleting || (!!deletingGame.result && deleteConfirmText !== "ELIMINAR")) ? 0.5 : 1,
                }}
              >
                {deleting ? "A eliminar…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create access modal ── */}
      {showCreateModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "16px",
        }}
          onClick={() => !createLoading && setShowCreateModal(false)}
        >
          <div style={{
            background: "#FFFDFA", borderRadius: "12px", padding: "24px",
            width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#F97316", margin: "0 0 4px",
            }}>Criar Acesso de Equipa</h2>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "0 0 20px" }}>
              {teamAccess.find(t => t.team_id === createTeamId)?.team_name}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  placeholder="delegado@equipa.pt"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </div>
              <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
                Será gerada uma palavra-passe segura automaticamente e enviada por email.
              </p>
            </div>

            {createError && (
              <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "10px" }}>{createError}</p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button onClick={() => setShowCreateModal(false)} disabled={createLoading} style={{ ...btnSecondary }}>
                Cancelar
              </button>
              <button
                onClick={handleCreateAccess}
                disabled={createLoading || !createEmail.trim()}
                style={{ ...btnPrimary, opacity: (createLoading || !createEmail.trim()) ? 0.5 : 1 }}
              >
                {createLoading ? "A criar…" : "Criar acesso"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset password modal ── */}
      {resetUserId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "16px",
        }}
          onClick={() => !resetLoading && setResetUserId(null)}
        >
          <div style={{
            background: "#FFFDFA", borderRadius: "12px", padding: "24px",
            width: "100%", maxWidth: "380px", boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#F97316", margin: "0 0 4px",
            }}>Regenerar Password</h2>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "0 0 16px" }}>{resetEmail}</p>

            <p style={{ fontSize: "13px", color: "#3D3630", margin: "0 0 4px" }}>
              Será gerada uma nova palavra-passe segura e enviada por email para este delegado.
            </p>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "0 0 4px" }}>
              O delegado terá de definir uma nova palavra-passe pessoal no próximo acesso.
            </p>

            {resetError && (
              <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "10px" }}>{resetError}</p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button onClick={() => setResetUserId(null)} disabled={resetLoading} style={{ ...btnSecondary }}>
                Cancelar
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetLoading}
                style={{ ...btnPrimary, opacity: resetLoading ? 0.5 : 1 }}
              >
                {resetLoading ? "A enviar…" : "Regenerar e enviar email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove access confirm modal ── */}
      {removeUserId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "16px",
        }}
          onClick={() => !removeLoading && setRemoveUserId(null)}
        >
          <div style={{
            background: "#FFFDFA", borderRadius: "12px", padding: "24px",
            width: "100%", maxWidth: "380px", boxShadow: "0 20px 60px rgba(0,0,0,.2)",
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "11px",
              fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#DC2626", margin: "0 0 4px",
            }}>Remover Acesso</h2>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#1A1612", margin: "0 0 4px" }}>
              {removeEmail}
            </p>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "0 0 16px" }}>
              Equipa: {removeTeamName}
            </p>
            <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 16px" }}>
              Esta acção irá eliminar permanentemente o utilizador e o seu acesso.
            </p>

            {removeError && (
              <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "8px" }}>{removeError}</p>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button onClick={() => setRemoveUserId(null)} disabled={removeLoading} style={{ ...btnSecondary }}>
                Cancelar
              </button>
              <button
                onClick={handleRemoveAccess}
                disabled={removeLoading}
                style={{ ...btnPrimary, background: "#DC2626", opacity: removeLoading ? 0.5 : 1 }}
              >
                {removeLoading ? "A remover…" : "Remover acesso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function SignOutBtn() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function handleSignOut() {
    setLoading(true);
    await fetch("/api/liga/auth/signout", { method: "POST" });
    router.push("/liga-inatel/equipa/login");
    router.refresh();
    setLoading(false);
  }
  return (
    <button onClick={handleSignOut} disabled={loading}
      style={{ fontSize: "12px", color: "#8C837A", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      {loading ? "A sair…" : "Terminar sessão"}
    </button>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-mono, monospace)",
  fontSize: "10px", fontWeight: 600,
  letterSpacing: "0.12em", textTransform: "uppercase",
  color: "#8C837A", margin: "0 0 10px",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 600,
  color: "#6B7280", marginBottom: "4px",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "7px 10px", fontSize: "13px",
  border: "1.5px solid #E8E0D6", borderRadius: "6px",
  background: "#FFFDFA", color: "#1A1612", outline: "none",
};

const selectStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: "12px",
  border: "1.5px solid #E8E0D6", borderRadius: "6px",
  background: "#FFFDFA", color: "#1A1612", cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 20px", background: "#F97316", color: "#fff",
  fontWeight: 700, fontSize: "13px",
  border: "none", borderRadius: "6px", cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 16px", background: "transparent", color: "#6B7280",
  fontWeight: 600, fontSize: "13px",
  border: "1.5px solid #E8E0D6", borderRadius: "6px", cursor: "pointer",
};
