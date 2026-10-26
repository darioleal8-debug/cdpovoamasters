"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ShieldCheck } from "lucide-react";

const NAV_LINKS = [
  { href: "/liga-inatel",               label: "Início" },
  { href: "/liga-inatel/noticias",      label: "Notícias" },
  { href: "/liga-inatel/classificacao", label: "Classificação" },
  { href: "/liga-inatel/calendario",    label: "Calendário" },
  { href: "/liga-inatel/resultados",    label: "Resultados" },
  { href: "/liga-inatel/equipas",       label: "Equipas" },
];

type TeamInfo = {
  name: string;
  short_name: string | null;
  sigla: string | null;
  logo_url: string | null;
};

const CTA_FONT: React.CSSProperties = {
  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
  fontWeight: 800,
  fontSize: "12px",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

export function LigaHeaderButtons() {
  const pathname = usePathname();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Check league session on mount
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      type Row = { team_id: string; league_teams: TeamInfo | null };
      const { data } = await supabase
        .from("league_team_members")
        .select("team_id, league_teams(name, short_name, sigla, logo_url)")
        .eq("user_id", user.id)
        .maybeSingle();
      const t = (data as Row | null)?.league_teams ?? null;
      if (t) setTeam(t);
    }
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [dropdownOpen]);

  // Close overlay on navigation and ESC
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  async function signOut() {
    setDropdownOpen(false);
    setMenuOpen(false);
    await fetch("/api/liga/auth/signout", { method: "POST" });
    setTeam(null);
    window.location.href = "/liga-inatel";
  }

  const teamLabel = team
    ? (team.sigla ?? team.short_name ?? team.name.split(" ")[0])
    : null;

  const secondaryBtn: React.CSSProperties = {
    ...CTA_FONT,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "4px",
    background: "transparent",
    border: "1.5px solid #F97316",
    color: "#F6F2EC",
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background .15s",
  };

  return (
    <>
      {/* ── Desktop CTAs (≥769px) ─────────────────────────────── */}
      <div className="liga-desktop-cta">
        {team ? (
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              aria-label="Menu da equipa"
              aria-expanded={dropdownOpen}
              style={secondaryBtn}
            >
              {team.logo_url ? (
                <img src={team.logo_url} alt="" style={{ width: 16, height: 16, objectFit: "contain", borderRadius: 2 }} aria-hidden />
              ) : (
                <ShieldCheck size={13} aria-hidden />
              )}
              {teamLabel}
              <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: 2 }} aria-hidden>▾</span>
            </button>

            {dropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                background: "#1E1915", border: "1px solid rgba(249,115,22,.3)",
                borderRadius: "6px", minWidth: "160px", zIndex: 100, overflow: "hidden",
                boxShadow: "0 8px 24px rgba(0,0,0,.4)",
              }}>
                <Link
                  href="/liga-inatel/equipa#resultados"
                  onClick={() => setDropdownOpen(false)}
                  style={{ display: "block", padding: "11px 16px", fontSize: "13px", color: "#F6F2EC", textDecoration: "none" }}
                >
                  Submeter resultado
                </Link>
                <button
                  onClick={signOut}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "11px 16px", fontSize: "13px", color: "#B9AFA4",
                    background: "none", border: "none", cursor: "pointer",
                    borderTop: "1px solid rgba(249,115,22,.15)",
                  }}
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/liga-inatel/equipa/login" aria-label="Entrar na área de equipa" style={secondaryBtn}>
            <ShieldCheck size={13} aria-hidden />
            Área de Equipa
          </Link>
        )}

      </div>

      {/* ── Mobile bar: compact CTA + hamburger (≤768px) ─────── */}
      <div className="liga-mobile-bar">
        <button
          className="liga-hamburger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
        >
          <span aria-hidden style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                display: "block", width: "22px", height: "2px",
                background: "#F6F2EC", borderRadius: "1px",
                transition: "transform .2s, opacity .2s",
                ...(menuOpen && i === 0 ? { transform: "translateY(7px) rotate(45deg)" } : {}),
                ...(menuOpen && i === 1 ? { opacity: 0 } : {}),
                ...(menuOpen && i === 2 ? { transform: "translateY(-7px) rotate(-45deg)" } : {}),
              }} />
            ))}
          </span>
        </button>
      </div>

      {/* ── Mobile overlay ────────────────────────────────────── */}
      {menuOpen && (
        <div
          role="dialog"
          aria-label="Menu de navegação"
          style={{
            position: "fixed", inset: 0, zIndex: 49,
            background: "rgba(21,17,14,.97)",
            display: "flex", flexDirection: "column",
            paddingTop: "52px",
            overflowY: "auto",
          }}
        >
          <nav style={{ padding: "8px 20px 32px", display: "flex", flexDirection: "column" }}>

            {/* Área de equipa — destacada no topo */}
            {team ? (
              <>
                <Link
                  href="/liga-inatel/equipa"
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "16px 0",
                    ...CTA_FONT, fontSize: "15px", color: "#F97316",
                    textDecoration: "none",
                    borderBottom: "1px solid rgba(249,115,22,.2)",
                  }}
                >
                  {team.logo_url ? (
                    <img src={team.logo_url} alt="" style={{ width: 18, height: 18, objectFit: "contain", borderRadius: 2 }} aria-hidden />
                  ) : (
                    <ShieldCheck size={16} aria-hidden />
                  )}
                  {team.short_name ?? team.name}
                </Link>
                <button
                  onClick={signOut}
                  style={{
                    padding: "14px 0", textAlign: "left",
                    fontSize: "13px", color: "#B9AFA4",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: "1px solid rgba(249,115,22,.08)",
                  }}
                >
                  Sair da conta de equipa
                </button>
              </>
            ) : (
              <Link
                href="/liga-inatel/equipa/login"
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "16px 0",
                  ...CTA_FONT, fontSize: "15px", color: "#F97316",
                  textDecoration: "none",
                  borderBottom: "1px solid rgba(249,115,22,.2)",
                }}
              >
                <ShieldCheck size={16} aria-hidden />
                Login
              </Link>
            )}

            {/* Nav links */}
            {NAV_LINKS.map((l) => {
              const active = l.href === "/liga-inatel" ? pathname === l.href : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  style={{
                    padding: "14px 0",
                    ...CTA_FONT, fontSize: "15px",
                    color: active ? "#F6F2EC" : "#B9AFA4",
                    fontWeight: active ? 800 : 400,
                    textDecoration: "none",
                    borderBottom: "1px solid rgba(249,115,22,.08)",
                  }}
                >
                  {l.label}
                </Link>
              );
            })}

          </nav>
        </div>
      )}
    </>
  );
}
