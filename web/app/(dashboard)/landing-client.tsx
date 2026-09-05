"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, CreditCard, BarChart3, Menu, X, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicClub {
  id: string;
  name: string;
  logo_url: string | null;
  league: string | null;
  position: number | null;
  wins: number;
  losses: number;
  lastActivityLabel: string;
  lastActivityAt: string;
}

interface HomeData {
  clubCount: number;
  leagueCount: number;
  activeClubs: PublicClub[];
}

// ─── Tokens (product, not club) ───────────────────────────────────────────────
const BLACK  = "#111111";
const ORANGE = "#F28C28";
const DARK_ORANGE = "#B26016"; // laranja acessível sobre branco (4.5:1 em texto pequeno)
const GRAY   = "#4B5563";
const LIGHT  = "#F2F4F7";
const BORDER = "#E5E7EB";

// ─── NavBar ───────────────────────────────────────────────────────────────────

function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b"
      style={{ background: "#fff", borderColor: BORDER }}
    >
      {/* Logo wordmark */}
      <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="Início hoophub">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-sm font-black"
          style={{ background: ORANGE }}
          aria-hidden="true"
        >
          ◉
        </span>
        <span className="font-black text-[18px]" style={{ color: BLACK }}>
          hoop<span style={{ color: ORANGE }}>hub</span>
        </span>
      </Link>

      {/* Desktop nav links */}
      <nav className="hidden lg:flex items-center gap-8" aria-label="Menu principal">
        {[
          { label: "Como funciona", href: "#como-funciona" },
          { label: "Clubes e ligas", href: "#clubes" },
          { label: "Funcionalidades", href: "#funcionalidades" },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="text-[15px] font-medium transition-colors hover:opacity-70"
            style={{ color: GRAY }}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Desktop CTAs */}
      <div className="hidden lg:flex items-center gap-3">
        <Link
          href="/login"
          className="text-[15px] font-semibold transition-colors hover:opacity-70"
          style={{ color: BLACK }}
        >
          Entrar
        </Link>
        <Link
          href="/pedir-acesso"
          className="rounded-xl px-5 py-2.5 text-[15px] font-semibold transition-opacity hover:opacity-85"
          style={{ background: ORANGE, color: "#fff" }}
        >
          Pedir acesso
        </Link>
      </div>

      {/* Mobile: Entrar + hamburger */}
      <div className="flex lg:hidden items-center gap-3">
        <Link
          href="/login"
          className="text-[15px] font-semibold"
          style={{ color: BLACK }}
        >
          Entrar
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: LIGHT }}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div
          className="lg:hidden absolute top-full left-0 right-0 border-b py-4 px-6 flex flex-col gap-4"
          style={{ background: "#fff", borderColor: BORDER }}
        >
          {[
            { label: "Como funciona", href: "#como-funciona" },
            { label: "Clubes e ligas",  href: "#clubes" },
            { label: "Funcionalidades", href: "#funcionalidades" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-[16px] font-medium py-1"
              style={{ color: GRAY }}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            href="/pedir-acesso"
            className="mt-2 rounded-xl px-5 py-3.5 text-center text-[16px] font-semibold"
            style={{ background: ORANGE, color: "#fff" }}
            onClick={() => setOpen(false)}
          >
            Pedir acesso para o meu clube
          </Link>
        </div>
      )}
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ data }: { data: HomeData | null }) {
  const showPill = (data?.clubCount ?? 0) >= 3;

  return (
    <section className="px-6 py-16 md:py-24 flex flex-col items-center text-center">
      <div className="w-full max-w-[840px] mx-auto flex flex-col items-center gap-6">

        {/* Pílula de prova social — só aparece com dados reais suficientes */}
        {showPill && (
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold"
            style={{ background: "#FFF7ED", color: DARK_ORANGE, border: `1px solid #FDDCB0` }}
          >
            <span aria-hidden="true">🏀</span>
            {data!.clubCount} clubes e {data!.leagueCount}{" "}
            {data!.leagueCount === 1 ? "liga" : "ligas"} já a usar
          </div>
        )}

        {/* H1 */}
        <h1
          className="font-black text-balance"
          style={{
            fontSize: "clamp(31px, 6.5vw, 50px)",
            lineHeight: 1.08,
            letterSpacing: "-.035em",
            color: BLACK,
          }}
        >
          Gerir uma equipa de veteranos devia dar menos trabalho que jogar.
        </h1>

        {/* Subtítulo */}
        <p
          className="max-w-[660px] text-[17px] leading-relaxed"
          style={{ color: GRAY }}
        >
          O hoophub junta num só sítio o plantel, as convocatórias, as quotas e a
          estatística de jogo — marcada no telemóvel, à beira do campo. Feito para
          clubes que se gerem a si próprios.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-2">
          <Link
            href="/pedir-acesso"
            className="w-full sm:w-auto rounded-2xl px-8 text-[16px] font-semibold transition-opacity hover:opacity-85 flex items-center justify-center"
            style={{ background: ORANGE, color: "#fff", height: 54 }}
          >
            Pedir acesso para o meu clube
          </Link>
          <a
            href="#clubes"
            className="w-full sm:w-auto rounded-2xl px-8 text-[16px] font-semibold transition-colors hover:opacity-70 flex items-center justify-center"
            style={{
              border: `2px solid ${BORDER}`,
              color: BLACK,
              height: 54,
              background: "#fff",
            }}
          >
            Ver clubes e ligas
          </a>
        </div>

        {/* Copy honesta — sem "grátis" nem "sem cartão" */}
        <p className="text-[13px]" style={{ color: "#9CA3AF" }}>
          Entrada por convite · respondemos em 48 horas
        </p>

        {/* Prova visual — ecrãs reais em desktop, só o central em mobile */}
        <div
          className="w-full mt-8 rounded-2xl overflow-hidden"
          style={{ background: LIGHT }}
          aria-label="Três ecrãs da aplicação: convocatória, marcação ao vivo e quotas"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 md:p-8 items-end">

            {/* Ecrã 1: Convocatória — esconde em mobile */}
            <div className="hidden md:block">
              <ScreenConvocatoria />
            </div>

            {/* Ecrã 2: Marcação ao vivo — sempre visível, maior */}
            <div className="md:scale-105 md:-translate-y-2 transition-transform">
              <ScreenLive />
            </div>

            {/* Ecrã 3: Quotas — esconde em mobile */}
            <div className="hidden md:block">
              <ScreenQuotas />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── App screen mockups ───────────────────────────────────────────────────────

function ScreenConvocatoria() {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg"
      style={{ background: "#fff", border: `1px solid ${BORDER}` }}
      role="img"
      aria-label="Ecrã de convocatória: 5 de 9 confirmados para o próximo jogo"
    >
      <div className="px-4 py-3 border-b text-[11px] font-bold uppercase tracking-widest" style={{ borderColor: BORDER, color: GRAY }}>
        Convocatória
      </div>
      <div className="px-4 py-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-[13px] font-semibold" style={{ color: BLACK }}>CD Póvoa vs PT Norte</span>
          <span className="text-[11px]" style={{ color: GRAY }}>Sex, 29 Set</span>
        </div>
        {/* Barra de confirmações */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: BORDER }}>
            <div className="h-full rounded-full" style={{ width: "55%", background: "#12855B" }} />
          </div>
          <span className="text-[12px] font-bold" style={{ color: "#12855B" }}>5/9</span>
        </div>
        {/* Jogadores */}
        {["#7 Ferreira", "#12 Santos", "#4 Costa", "#9 Oliveira", "#3 Silva"].map((n, i) => (
          <div key={n} className="flex items-center justify-between py-1">
            <span className="text-[12px]" style={{ color: i < 3 ? BLACK : GRAY }}>{n}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: i < 3 ? "#DCFCE7" : "#F3F4F6",
                color: i < 3 ? "#15803D" : GRAY,
              }}
            >
              {i < 3 ? "Confirmado" : i < 5 ? "Confirmado" : "Pendente"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenLive() {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-xl"
      style={{ background: "#0A1220" }}
      role="img"
      aria-label="Marcação ao vivo: placar 34-29, teclado de ações no telemóvel"
    >
      {/* Score bar */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Póvoa</p>
          <p className="text-[36px] font-black tabular-nums leading-none text-white">34</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full animate-pulse"
            style={{ background: "#12855B", color: "#fff" }}
          >
            ● LIVE
          </span>
          <span className="text-[12px] font-mono font-bold" style={{ color: ORANGE }}>
            Q3 · 4:22
          </span>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Rival</p>
          <p className="text-[36px] font-black tabular-nums leading-none text-white">29</p>
        </div>
      </div>

      {/* Keyboard */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-4">
        {[
          { label: "2PT", sub: "acertou", color: "#12855B" },
          { label: "3PT", sub: "acertou", color: "#12855B" },
          { label: "LL",  sub: "acertou", color: "#12855B" },
          { label: "2PT", sub: "falhado", color: "#D92D20" },
          { label: "3PT", sub: "falhado", color: "#D92D20" },
          { label: "Assist", sub: "",     color: ORANGE     },
          { label: "Reb.Of", sub: "",     color: GRAY       },
          { label: "Reb.Def",sub: "",     color: GRAY       },
          { label: "Roubo", sub: "",      color: GRAY       },
        ].map(({ label, sub, color }, i) => (
          <div
            key={i}
            className="rounded-xl py-2.5 flex flex-col items-center gap-0.5"
            style={{ background: "rgba(255,255,255,.07)" }}
          >
            <span className="text-[13px] font-bold" style={{ color }}>{label}</span>
            {sub && <span className="text-[9px] text-white/40">{sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenQuotas() {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg"
      style={{ background: "#fff", border: `1px solid ${BORDER}` }}
      role="img"
      aria-label="Ecrã de quotas: total recebido e jogadores com pagamento pendente"
    >
      <div className="px-4 py-3 border-b text-[11px] font-bold uppercase tracking-widest" style={{ borderColor: BORDER, color: GRAY }}>
        Quotas 2025/26
      </div>
      <div className="px-4 py-4 space-y-3">
        {/* Totais */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Recebido", value: "€ 1.240", color: "#12855B" },
            { label: "Em falta", value: "€ 360",   color: "#D92D20" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: LIGHT }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: GRAY }}>{label}</p>
              <p className="text-[18px] font-black mt-0.5" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
        {/* Jogadores */}
        {[
          { name: "#7 Ferreira", status: "Pago",    ok: true  },
          { name: "#12 Santos",  status: "Em falta", ok: false },
          { name: "#4 Costa",    status: "Pago",    ok: true  },
        ].map(({ name, status, ok }) => (
          <div key={name} className="flex items-center justify-between py-1 border-b last:border-0" style={{ borderColor: BORDER }}>
            <span className="text-[12px]" style={{ color: BLACK }}>{name}</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: ok ? "#DCFCE7" : "#FEE2E2",
                color: ok ? "#15803D" : "#B91C1C",
              }}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

function Features() {
  const items = [
    {
      icon: Calendar,
      title: "Ninguém falta por esquecimento",
      body: "Cada jogo e treino abre uma convocatória. O jogador responde no telemóvel. Vês o número real de confirmados antes de sair de casa.",
    },
    {
      icon: CreditCard,
      title: "Quotas sem conversas difíceis",
      body: "A época inteira numa grelha — quem pagou, quem falta, quanto. Lembretes por mensagem privada, nunca no grupo da equipa.",
    },
    {
      icon: BarChart3,
      title: "Estatística marcada em jogo",
      body: "Três toques por ação, telemóvel na horizontal, funciona sem rede. No fim do jogo a ficha está feita e as médias atualizadas.",
    },
  ];

  return (
    <section
      id="funcionalidades"
      className="px-6 py-16 md:py-20"
      style={{ background: "#F7F8FA" }}
      aria-labelledby="feat-title"
    >
      <div className="max-w-5xl mx-auto">
        <h2
          id="feat-title"
          className="text-[13px] font-bold uppercase tracking-widest mb-10 text-center"
          style={{ color: DARK_ORANGE }}
        >
          Como funciona
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl p-7 flex flex-col gap-4"
              style={{ background: "#fff", border: `1px solid ${BORDER}` }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "#FDEFDF" }}
              >
                <Icon className="h-5 w-5" style={{ color: ORANGE }} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold leading-snug mb-2" style={{ color: BLACK }}>
                  {title}
                </h3>
                <p className="text-[14px] leading-relaxed" style={{ color: GRAY }}>
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Clubs section ────────────────────────────────────────────────────────────

function ClubsSection({ data }: { data: HomeData | null }) {
  const clubs = data?.activeClubs ?? [];

  return (
    <section
      id="clubes"
      className="px-6 py-16 md:py-20"
      aria-labelledby="clubs-title"
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2
              id="clubs-title"
              className="text-[26px] font-black leading-tight"
              style={{ color: BLACK }}
            >
              Clubes e ligas ativos
            </h2>
            <p className="text-[14px] mt-1" style={{ color: GRAY }}>
              Já a usar o hoophub esta época
            </p>
          </div>
          {clubs.length > 0 && (
            <a
              href="#clubes"
              className="flex items-center gap-1 text-[14px] font-semibold transition-colors hover:opacity-70"
              style={{ color: DARK_ORANGE }}
            >
              Ver todos <ChevronRight className="h-4 w-4" />
            </a>
          )}
        </div>

        {clubs.length === 0 ? (
          // Fora de época ou sem clubes públicos
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: LIGHT, border: `1px solid ${BORDER}` }}
          >
            <p className="text-[16px] font-semibold" style={{ color: BLACK }}>
              Época começa em setembro
            </p>
            <p className="text-[14px] mt-2" style={{ color: GRAY }}>
              Os resultados e classificações aparecerão aqui assim que a competição começar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {clubs.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ClubCard({ club }: { club: PublicClub }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#fff", border: `1px solid ${BORDER}` }}
    >
      <div className="px-5 py-5 flex items-center gap-3">
        {/* Emblema ou inicial */}
        {club.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.logo_url}
            alt={`Emblema ${club.name}`}
            className="h-9 w-9 rounded-[9px] object-contain"
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[14px] font-black text-white"
            style={{ background: ORANGE }}
            aria-hidden="true"
          >
            {club.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-bold truncate" style={{ color: BLACK }}>
            {club.name}
          </p>
          <p className="text-[12px]" style={{ color: GRAY }}>
            {[
              club.league,
              club.position ? `${club.position}.º` : null,
              `${club.wins}V–${club.losses}D`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {/* Última notícia */}
      <div
        className="px-5 py-3 text-[12px] border-t truncate"
        style={{ color: GRAY, borderColor: BORDER }}
      >
        {club.lastActivityLabel}
      </div>
    </div>
  );
}

// ─── CTA final ────────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <section
      className="px-6 py-16 md:py-20"
      style={{ background: BLACK }}
      aria-labelledby="cta-title"
    >
      <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-6">
        <h2
          id="cta-title"
          className="text-[28px] md:text-[34px] font-black leading-tight"
          style={{ color: "#fff" }}
        >
          Traz o teu clube para o hoophub.
        </h2>
        <p className="text-[16px] leading-relaxed max-w-xl" style={{ color: "rgba(255,255,255,.65)" }}>
          Pede acesso e ajudamos-te a montar o plantel e a primeira convocatória.
          Se a tua liga já estiver aqui, os resultados aparecem sozinhos.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            href="/pedir-acesso"
            className="w-full sm:w-auto rounded-2xl px-8 text-[16px] font-semibold transition-opacity hover:opacity-85 flex items-center justify-center"
            style={{ background: ORANGE, color: "#fff", height: 54 }}
          >
            Pedir acesso
          </Link>
          <a
            href="mailto:hoophub@example.com"
            className="w-full sm:w-auto rounded-2xl px-8 text-[16px] font-semibold transition-colors hover:opacity-70 flex items-center justify-center"
            style={{
              border: "2px solid rgba(255,255,255,.2)",
              color: "#fff",
              height: 54,
            }}
          >
            Falar com alguém
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  const cols = [
    {
      title: "Produto",
      links: [
        { label: "Funcionalidades", href: "#funcionalidades" },
        { label: "Como funciona",   href: "#como-funciona"   },
      ],
    },
    {
      title: "Comunidade",
      links: [
        { label: "Clubes",          href: "#clubes" },
        { label: "Ligas",           href: "#clubes" },
      ],
    },
    {
      title: "Clube",
      links: [
        { label: "Entrar",          href: "/login"          },
        { label: "Pedir acesso",    href: "/pedir-acesso"   },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacidade",     href: "/privacidade"    },
        { label: "Termos",          href: "/termos"         },
      ],
    },
  ];

  return (
    <footer
      className="px-6 pt-12 pb-8 border-t"
      style={{ borderColor: BORDER }}
      aria-label="Rodapé do site"
    >
      <div className="max-w-5xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-sm font-black"
            style={{ background: ORANGE }}
            aria-hidden="true"
          >
            ◉
          </span>
          <span className="font-black text-[16px]" style={{ color: BLACK }}>
            hoop<span style={{ color: ORANGE }}>hub</span>
          </span>
        </div>

        {/* Colunas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {cols.map(({ title, links }) => (
            <div key={title}>
              <p className="text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: GRAY }}>
                {title}
              </p>
              <ul className="space-y-2">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-[14px] transition-colors hover:opacity-70"
                      style={{ color: BLACK }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-[13px]" style={{ color: "#9CA3AF" }} suppressHydrationWarning>
          © {new Date().getFullYear()} hoophub · Gestão de clubes de basquetebol de veteranos
        </p>
      </div>
    </footer>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function LandingClient({ initialData }: { initialData: HomeData | null }) {
  const [data, setData] = useState<HomeData | null>(initialData);

  useEffect(() => {
    // Se os dados chegaram via server props, não re-fetcha
    if (initialData) return;
    fetch("/api/public/home")
      .then((r) => r.json())
      .then((d: HomeData) => setData(d))
      .catch(() => {});
  }, [initialData]);

  return (
    <div style={{ minHeight: "100dvh", background: "#fff" }}>
      <NavBar />
      <main id="main-content">
        <Hero data={data} />
        <Features />
        <ClubsSection data={data} />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
