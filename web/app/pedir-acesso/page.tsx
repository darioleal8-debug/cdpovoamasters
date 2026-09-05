"use client";

import { useState, useRef, useId } from "react";
import Link from "next/link";

const BLACK      = "#111111";
const ORANGE     = "#F28C28";
const DARK_ORANGE = "#B26016";
const GRAY       = "#4B5563";
const BORDER     = "#E5E7EB";
const ERROR_BG   = "#FFF5F6";
const ERROR_TEXT = "#CE1236";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  club_name:    string;
  city:         string;
  category:     string;
  league:       string;
  player_count: string;
  contact_name: string;
  contact_role: string;
  email:        string;
  phone:        string;
  website:      string;  // honeypot
}

type FieldErrors = Partial<Record<keyof Omit<FormData, "website">, string>>;

const INITIAL: FormData = {
  club_name:    "",
  city:         "",
  category:     "",
  league:       "",
  player_count: "",
  contact_name: "",
  contact_role: "",
  email:        "",
  phone:        "",
  website:      "",
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(f: FormData): FieldErrors {
  const errs: FieldErrors = {};
  if (!f.club_name.trim())   errs.club_name    = "Nome do clube obrigatório";
  if (!f.city.trim())        errs.city         = "Cidade obrigatória";
  if (!f.category)           errs.category     = "Seleciona o escalão";
  if (!f.league.trim())      errs.league       = "Liga ou competição obrigatória";
  const n = Number(f.player_count);
  if (!f.player_count || !Number.isInteger(n) || n < 1 || n > 200)
    errs.player_count = "Número de jogadores inválido (entre 1 e 200)";
  if (!f.contact_name.trim()) errs.contact_name = "O teu nome é obrigatório";
  if (!f.contact_role)        errs.contact_role = "Seleciona o teu papel";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
    errs.email = "Email inválido";
  return errs;
}

// ─── Field component ─────────────────────────────────────────────────────────

interface FieldProps {
  label:       string;
  id:          string;
  error?:      string;
  required?:   boolean;
  children:    React.ReactNode;
}

function Field({ label, id, error, required = true, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold" style={{ color: BLACK }}>
        {label}{required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[13px]" style={{ color: ERROR_TEXT }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height:         52,
  borderRadius:   12,
  border:         `1px solid ${BORDER}`,
  padding:        "0 16px",
  fontSize:       16,
  color:          BLACK,
  background:     "#fff",
  outline:        "none",
  width:          "100%",
  boxSizing:      "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: 44,
};

// ─── Form ─────────────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "success" | "error";

export default function PedirAcessoPage() {
  const [form,   setForm]   = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [apiErr, setApiErr] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  function field(name: keyof FormData) {
    return {
      id:       `${uid}-${name}`,
      value:    form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [name]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validate(form);
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      summaryRef.current?.focus();
      return;
    }

    setStatus("loading");
    setApiErr(null);

    try {
      const res = await fetch("/api/public/request-access", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...form,
          player_count: Number(form.player_count),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setApiErr(json.error ?? "Erro ao enviar. Tenta novamente.");
        setStatus("error");
        summaryRef.current?.focus();
        return;
      }
      setStatus("success");
    } catch {
      setApiErr("Sem ligação à internet. Tenta novamente.");
      setStatus("error");
      summaryRef.current?.focus();
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div style={{ minHeight: "100dvh", background: "#fff" }}>
        <TopBar />
        <main className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl mb-6"
            style={{ background: "#DCFCE7" }}
            aria-hidden="true"
          >
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-[28px] font-black mb-3" style={{ color: BLACK }}>
            Pedido recebido.
          </h1>
          <p className="text-[16px] max-w-sm leading-relaxed" style={{ color: GRAY }}>
            Falamos contigo em 48 horas. Entretanto, podes explorar o que o hoophub faz.
          </p>
          <Link
            href="/"
            className="mt-8 rounded-2xl px-8 text-[16px] font-semibold flex items-center justify-center transition-opacity hover:opacity-85"
            style={{ background: ORANGE, color: "#fff", height: 54 }}
          >
            Voltar ao início
          </Link>
        </main>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div style={{ minHeight: "100dvh", background: "#fff" }}>
      <TopBar />

      <main className="px-6 py-12">
        <div className="max-w-[560px] mx-auto">
          {/* Cabeçalho */}
          <div className="mb-8">
            <p
              className="text-[12px] font-bold uppercase tracking-widest mb-2"
              style={{ color: DARK_ORANGE }}
            >
              Entrada por convite
            </p>
            <h1 className="text-[30px] font-black leading-tight" style={{ color: BLACK }}>
              Pedir acesso para o meu clube
            </h1>
            <p className="text-[15px] mt-2" style={{ color: GRAY }}>
              Respondemos em 48 horas. Sem auto-registo — analisamos cada pedido.
            </p>
          </div>

          {/* Resumo de erros — acessível */}
          {(hasErrors || status === "error") && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              className="rounded-xl p-4 mb-6"
              style={{ background: ERROR_BG, border: `1px solid #FECDD3` }}
              role="alert"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="text-[14px] font-semibold mb-1" style={{ color: ERROR_TEXT }}>
                {status === "error" ? apiErr : "Corrige os campos assinalados:"}
              </p>
              {hasErrors && (
                <ul className="list-disc list-inside space-y-0.5">
                  {Object.values(errors).map((msg, i) => (
                    <li key={i} className="text-[13px]" style={{ color: ERROR_TEXT }}>
                      {msg}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            {/* Honeypot — invisível para humanos */}
            <input
              type="text"
              name="website"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              tabIndex={-1}
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", opacity: 0 }}
              autoComplete="off"
            />

            {/* Clube */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Nome do clube" id={`${uid}-club_name`} error={errors.club_name}>
                <input
                  {...field("club_name")}
                  type="text"
                  autoComplete="organization"
                  placeholder="ex. CD Póvoa Masters"
                  style={{
                    ...inputStyle,
                    borderColor: errors.club_name ? ERROR_TEXT : BORDER,
                  }}
                  aria-describedby={errors.club_name ? `${uid}-club_name-err` : undefined}
                  aria-invalid={!!errors.club_name}
                />
              </Field>
              <Field label="Cidade" id={`${uid}-city`} error={errors.city}>
                <input
                  {...field("city")}
                  type="text"
                  autoComplete="address-level2"
                  placeholder="ex. Póvoa de Varzim"
                  style={{
                    ...inputStyle,
                    borderColor: errors.city ? ERROR_TEXT : BORDER,
                  }}
                  aria-invalid={!!errors.city}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Escalão / categoria" id={`${uid}-category`} error={errors.category}>
                <select
                  {...field("category")}
                  style={{
                    ...selectStyle,
                    borderColor: errors.category ? ERROR_TEXT : BORDER,
                    color: form.category ? BLACK : GRAY,
                  }}
                  aria-invalid={!!errors.category}
                >
                  <option value="" disabled>Seleciona</option>
                  <option value="+40">Veteranos +40</option>
                  <option value="+50">Veteranos +50</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
              <Field label="Nº aproximado de jogadores" id={`${uid}-player_count`} error={errors.player_count}>
                <input
                  {...field("player_count")}
                  type="number"
                  min="1"
                  max="200"
                  inputMode="numeric"
                  placeholder="ex. 12"
                  style={{
                    ...inputStyle,
                    borderColor: errors.player_count ? ERROR_TEXT : BORDER,
                  }}
                  aria-invalid={!!errors.player_count}
                />
              </Field>
            </div>

            <Field label="Liga ou competição onde joga" id={`${uid}-league`} error={errors.league}>
              <input
                {...field("league")}
                type="text"
                placeholder="ex. Liga Norte Veteranos"
                list={`${uid}-leagues-list`}
                style={{
                  ...inputStyle,
                  borderColor: errors.league ? ERROR_TEXT : BORDER,
                }}
                aria-invalid={!!errors.league}
              />
              <datalist id={`${uid}-leagues-list`}>
                <option value="Liga Norte Veteranos" />
                <option value="Liga Sul Veteranos" />
                <option value="Campeonato Distrital do Porto" />
                <option value="Associação de Basquetebol do Porto" />
              </datalist>
            </Field>

            {/* Contacto */}
            <hr style={{ borderColor: BORDER }} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="O teu nome" id={`${uid}-contact_name`} error={errors.contact_name}>
                <input
                  {...field("contact_name")}
                  type="text"
                  autoComplete="name"
                  placeholder="ex. João Silva"
                  style={{
                    ...inputStyle,
                    borderColor: errors.contact_name ? ERROR_TEXT : BORDER,
                  }}
                  aria-invalid={!!errors.contact_name}
                />
              </Field>
              <Field label="O teu papel no clube" id={`${uid}-contact_role`} error={errors.contact_role}>
                <select
                  {...field("contact_role")}
                  style={{
                    ...selectStyle,
                    borderColor: errors.contact_role ? ERROR_TEXT : BORDER,
                    color: form.contact_role ? BLACK : GRAY,
                  }}
                  aria-invalid={!!errors.contact_role}
                >
                  <option value="" disabled>Seleciona</option>
                  <option value="dirigente">Dirigente</option>
                  <option value="treinador">Treinador</option>
                  <option value="jogador-organizador">Jogador-organizador</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Email" id={`${uid}-email`} error={errors.email}>
                <input
                  {...field("email")}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="tu@exemplo.pt"
                  style={{
                    ...inputStyle,
                    borderColor: errors.email ? ERROR_TEXT : BORDER,
                  }}
                  aria-invalid={!!errors.email}
                />
              </Field>
              <Field label="Telefone" id={`${uid}-phone`} error={errors.phone} required={false}>
                <input
                  {...field("phone")}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="ex. 912 000 000"
                  style={{ ...inputStyle, borderColor: BORDER }}
                />
              </Field>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-2xl text-[16px] font-semibold transition-opacity hover:opacity-85 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: ORANGE, color: "#fff", height: 54 }}
              aria-busy={status === "loading"}
            >
              {status === "loading" ? (
                <>
                  <span
                    className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
                    aria-hidden="true"
                  />
                  A enviar…
                </>
              ) : (
                "Enviar pedido"
              )}
            </button>

            <p className="text-center text-[13px]" style={{ color: "#9CA3AF" }}>
              Entrada por convite · respondemos em 48 horas ·{" "}
              <Link href="/login" style={{ color: DARK_ORANGE }}>
                já tens conta?
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 border-b"
      style={{ borderColor: BORDER }}
    >
      <Link href="/" className="flex items-center gap-2" aria-label="Início hoophub">
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
      <Link
        href="/login"
        className="text-[14px] font-semibold transition-colors hover:opacity-70"
        style={{ color: GRAY }}
      >
        Já tenho conta →
      </Link>
    </div>
  );
}
