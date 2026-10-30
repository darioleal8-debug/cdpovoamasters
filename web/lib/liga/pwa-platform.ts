// Deteção do dispositivo/browser para o convite de instalação da Liga INATEL.
// Lógica pura (sem window) para poder ser testada em Node.

export type InstallPlatform =
  /** iPhone/iPad no Safari — instalação manual via Partilhar › Adicionar ao ecrã principal */
  | "ios-safari"
  /** iOS noutro browser (Chrome, Firefox, Edge…) — o processo deve ser concluído no Safari */
  | "ios-other"
  /** iOS dentro de uma app (Instagram, Facebook, Google…) — não permite instalar */
  | "ios-inapp"
  /** Android num browser — instalação nativa (beforeinstallprompt) ou pelo menu */
  | "android"
  /** Android dentro de uma app/WebView — não permite instalar */
  | "android-inapp"
  /** Computador — o convite não é mostrado (funcionalidade só mobile) */
  | "desktop";

export interface PlatformInfo {
  platform: InstallPlatform;
  /** "iPhone" | "iPad" | "telemóvel" — para os textos do modal */
  deviceLabel: string;
  /** Browser iOS reconhecido (para mensagens específicas, ex.: Chrome) */
  iosBrowser?: "chrome" | "firefox" | "edge" | "other";
}

const IN_APP_RE = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Twitter|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Pinterest|GSA\//i;

export function detectPlatform(ua: string, maxTouchPoints = 0): PlatformInfo {
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const isIOS = isIPad || /iPhone|iPod/.test(ua);

  if (isIOS) {
    const deviceLabel = isIPad ? "iPad" : "iPhone";
    if (IN_APP_RE.test(ua)) return { platform: "ios-inapp", deviceLabel };
    if (/CriOS/.test(ua)) return { platform: "ios-other", deviceLabel, iosBrowser: "chrome" };
    if (/FxiOS/.test(ua)) return { platform: "ios-other", deviceLabel, iosBrowser: "firefox" };
    if (/EdgiOS/.test(ua)) return { platform: "ios-other", deviceLabel, iosBrowser: "edge" };
    if (/OPiOS|OPT\/|YaBrowser|DuckDuckGo|Brave/.test(ua)) {
      return { platform: "ios-other", deviceLabel, iosBrowser: "other" };
    }
    // Safari real tem "Safari/" e "Version/"; WebViews genéricas não têm "Safari/"
    if (!/Safari\//.test(ua)) return { platform: "ios-inapp", deviceLabel };
    return { platform: "ios-safari", deviceLabel };
  }

  if (/Android/i.test(ua)) {
    // "; wv)" identifica a Android System WebView usada dentro de apps
    if (IN_APP_RE.test(ua) || /; wv\)/.test(ua)) {
      return { platform: "android-inapp", deviceLabel: "telemóvel" };
    }
    return { platform: "android", deviceLabel: "telemóvel" };
  }

  return { platform: "desktop", deviceLabel: "computador" };
}

export function isMobilePlatform(p: InstallPlatform): boolean {
  return p !== "desktop";
}

/** Escolhe o conteúdo do modal conforme o dispositivo e a disponibilidade da instalação nativa. */
export type InstallView =
  | "android-native"
  | "android-manual"
  | "ios-safari"
  | "ios-open-safari"
  | "open-browser";

export function chooseInstallView(platform: InstallPlatform, nativePromptAvailable: boolean): InstallView {
  switch (platform) {
    case "android":
      return nativePromptAvailable ? "android-native" : "android-manual";
    case "ios-safari":
      return "ios-safari";
    case "ios-other":
      return "ios-open-safari";
    case "ios-inapp":
    case "android-inapp":
      return "open-browser";
    default:
      // Desktop com prompt nativo (não deve acontecer: o convite é só mobile)
      return nativePromptAvailable ? "android-native" : "android-manual";
  }
}
