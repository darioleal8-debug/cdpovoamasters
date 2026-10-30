// Ícones/ilustrações do convite de instalação da Liga INATEL.

type P = { size?: number; color?: string };

/** Smartphone com seta de instalação */
export function PhoneInstallIcon({ size = 22, color = "currentColor" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5.5" y="2" width="13" height="20" rx="2.6" stroke={color} strokeWidth="1.8" />
      <path d="M10.2 19h3.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 6.3v7.2m0 0-3-3m3 3 3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Botão Partilhar do iOS (quadrado com seta para cima) */
export function IosShareIcon({ size = 22, color = "#0A84FF" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8.5 8.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8.5a2 2 0 0 0-2-2h-1.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 14.5V2.8m0 0L8.3 6.5M12 2.8l3.7 3.7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Adicionar ao ecrã principal" do iOS (quadrado com +) */
export function IosAddIcon({ size = 22, color = "#1A1612" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke={color} strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Menu ⋮ do Chrome Android */
export function KebabIcon({ size = 22, color = "#1A1612" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}

/** Ícone de "abrir no Safari/browser" (bússola) */
export function CompassIcon({ size = 22, color = "#0A84FF" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
