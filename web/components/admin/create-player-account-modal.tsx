"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Copy, Check, ExternalLink, Loader2, Mail, UserPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { useSeasons } from "@/hooks/use-seasons";

interface Props {
  open:    boolean;
  onClose: (created?: boolean) => void;
}

interface ActivationInfo {
  activationLink:   string;
  emailSent:        boolean;
  emailDevFallback: boolean;
  emailError?:      string | null;
}

function maxBirthDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 16);
  return d.toISOString().slice(0, 10);
}

const POSITIONS = [
  { value: "base",    label: "Base" },
  { value: "extremo", label: "Extremo" },
  { value: "poste",   label: "Poste" },
];

// ─── Ecrã de sucesso com link de ativação ─────────────────

function SuccessScreen({
  userName,
  userEmail,
  activation,
  playerError,
  onClose,
}: {
  userName:    string;
  userEmail:   string;
  activation:  ActivationInfo | null;
  playerError: string | null;
  onClose:     () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!activation?.activationLink) return;
    navigator.clipboard.writeText(activation.activationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-5">
      {/* Confirmação */}
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <div>
          <p className="font-semibold text-foreground">Conta criada com sucesso!</p>
          <p className="text-sm text-muted-foreground">{userName} · {userEmail}</p>
        </div>
      </div>

      {/* Aviso: perfil de jogador não foi criado/ligado */}
      {playerError && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
          <p className="font-medium mb-1">Perfil de jogador não foi criado</p>
          <p className="text-xs">{playerError}</p>
        </div>
      )}

      {activation && (
        <>
          <Separator />

          {/* Estado do email */}
          {activation.emailSent ? (
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-700 border border-green-200">
              <Mail className="h-4 w-4 shrink-0" />
              Email de ativação enviado para <strong>{userEmail}</strong>
            </div>
          ) : activation.emailError ? (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
              <p className="font-medium mb-1">Erro ao enviar email</p>
              <p className="text-xs font-mono break-all">{activation.emailError}</p>
              <p className="text-xs mt-1.5">Partilha o link de ativação abaixo manualmente com o jogador.</p>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
              <p className="font-medium mb-1">
                {activation.emailDevFallback
                  ? "Modo desenvolvimento — email impresso no terminal do servidor"
                  : "Email não enviado — RESEND_API_KEY não configurada"}
              </p>
              <p>Partilha o link de ativação abaixo manualmente com o jogador.</p>
            </div>
          )}

          {/* Link de ativação */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Link de ativação · válido 24 horas
            </p>
            <div className="rounded-md border bg-muted p-3">
              <p className="break-all font-mono text-[11px] leading-relaxed select-all">
                {activation.activationLink}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={copyLink}
              >
                {copied
                  ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copiado!</>
                  : <><Copy  className="h-3.5 w-3.5" /> Copiar link</>}
              </Button>
              <Button
                variant="outline" size="sm"
                className="gap-1.5 text-xs"
                onClick={() => window.open(activation.activationLink, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Testar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O jogador deve clicar neste link para ativar a conta antes de fazer login.
            </p>
          </div>
        </>
      )}

      <DialogFooter className="pt-2">
        <Button onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </div>
  );
}

// ─── Modal principal ───────────────────────────────────────

export function CreatePlayerAccountModal({ open, onClose }: Props) {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();

  const [role,      setRole]      = useState("jogador");
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [seasonId,  setSeasonId]  = useState("");
  const [jersey,    setJersey]    = useState("");
  const [position,  setPosition]  = useState("");
  const [height,    setHeight]    = useState("");
  const [weight,    setWeight]    = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Resultado pós-criação
  const [created,     setCreated]     = useState<{ name: string; email: string } | null>(null);
  const [activation,  setActivation]  = useState<ActivationInfo | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    if (open && activeSeason && !seasonId) setSeasonId(activeSeason.id);
  }, [open, activeSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPlayer = role === "jogador";

  function reset() {
    setRole("jogador"); setName(""); setEmail(""); setPassword("");
    setPhone(""); setBirthDate(""); setSeasonId("");
    setJersey(""); setPosition(""); setHeight(""); setWeight("");
    setCreated(null); setActivation(null); setPlayerError(null);
  }

  function handleClose() {
    const wasCreated = !!created;
    reset();
    onClose(wasCreated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPlayer && !phone.trim()) {
      toast({ title: "Telemóvel obrigatório para jogadores", variant: "destructive" });
      return;
    }
    if (isPlayer && !birthDate.trim()) {
      toast({ title: "Data de nascimento obrigatória para jogadores", variant: "destructive" });
      return;
    }
    if (isPlayer && !seasonId) {
      toast({ title: "Temporada obrigatória para jogadores", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:          name.trim(),
          email:         email.trim(),
          password:      password.trim(),
          role,
          phone:         phone.trim()     || undefined,
          birth_date:    birthDate.trim() || undefined,
          season_id:     isPlayer ? seasonId     : undefined,
          jersey_number: isPlayer && jersey.trim()   ? jersey.trim()   : undefined,
          position:      isPlayer && position.trim() ? position.trim() : undefined,
          height:        isPlayer && height.trim()   ? height.trim()   : undefined,
          weight:        isPlayer && weight.trim()   ? weight.trim()   : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast({ title: "Erro ao criar conta", description: json.error, variant: "destructive" });
        return;
      }

      // Conta criada — mostrar ecrã de sucesso com link de ativação
      setCreated({ name: name.trim(), email: email.trim() });
      setPlayerError((json.playerError as string | null) ?? null);
      if (json.activation) {
        setActivation(json.activation as ActivationInfo);
      } else {
        // Non-jogador accounts don't need activation
        setActivation(null);
        // Close immediately for admin/treinador
        toast({ title: "Conta criada com sucesso", description: `${email.trim()} · ${role}` });
        reset();
        onClose(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {created ? "Conta Criada" : "Criar Conta de Acesso"}
          </DialogTitle>
        </DialogHeader>

        {/* Ecrã de sucesso */}
        {created ? (
          <SuccessScreen
            userName={created.name}
            userEmail={created.email}
            activation={activation}
            playerError={playerError}
            onClose={handleClose}
          />
        ) : (

        /* Formulário de criação */
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Tipo de conta */}
          <div className="space-y-1.5">
            <Label>Tipo de Conta</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="jogador">Jogador</SelectItem>
                <SelectItem value="treinador">Treinador</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Credenciais */}
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Nome completo *</Label>
            <Input id="acc-name" required value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-email">Email *</Label>
            <Input id="acc-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-pass">Password *</Label>
            <Input id="acc-pass" type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>

          <Separator />

          {/* Dados pessoais */}
          <div className="space-y-1.5">
            <Label htmlFor="acc-phone">
              Telemóvel {isPlayer ? "*" : "(opcional)"}
            </Label>
            <Input id="acc-phone" type="tel" value={phone} required={isPlayer}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="912345678 ou +351912345678" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-birth">
              Data de Nascimento {isPlayer ? "*" : "(opcional)"}
            </Label>
            <Input id="acc-birth" type="date" value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={maxBirthDate()} required={isPlayer} />
            <p className="text-[11px] text-muted-foreground">Idade mínima: 16 anos</p>
          </div>

          {/* Dados de jogador */}
          {isPlayer && (
            <>
              <Separator />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                Dados Desportivos
              </p>

              <div className="space-y-1.5">
                <Label>Temporada *</Label>
                {seasonsLoading ? (
                  <div className="h-10 animate-pulse rounded-md bg-muted" />
                ) : (
                  <Select value={seasonId} onValueChange={setSeasonId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona uma temporada..." />
                    </SelectTrigger>
                    <SelectContent>
                      {seasons.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.status === "ativa" ? " ✓" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-jersey">Nº Camisola</Label>
                  <Input id="acc-jersey" type="number" min={0} max={99}
                    value={jersey} onChange={(e) => setJersey(e.target.value)} placeholder="10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Posição</Label>
                  <Select value={position} onValueChange={setPosition}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-height">Altura (cm)</Label>
                  <Input id="acc-height" type="number" min={100} max={260}
                    value={height} onChange={(e) => setHeight(e.target.value)} placeholder="182" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-weight">Peso (kg)</Label>
                  <Input id="acc-weight" type="number" min={30} max={200} step={0.1}
                    value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="85.0" />
                </div>
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" disabled={submitting}
              onClick={() => { reset(); onClose(); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <UserPlus className="h-4 w-4" />}
              Criar Conta
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
