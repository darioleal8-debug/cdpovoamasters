"use client";

// Estado partilhado do convite de instalação da Liga INATEL (botão do menu,
// banner da página inicial e modal). Store mínima com useSyncExternalStore.

import { useSyncExternalStore } from "react";
import { detectPlatform, type PlatformInfo } from "./pwa-platform";

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    /** Capturado por um script inline no layout antes da hidratação */
    __ligaBIP?: BeforeInstallPromptEvent | null;
  }
}

export interface LigaPwaState {
  ready: boolean;
  info: PlatformInfo | null;
  /** A abrir já como app instalada (standalone) */
  standalone: boolean;
  /** Instalação concluída neste browser (appinstalled) */
  installed: boolean;
  deferred: BeforeInstallPromptEvent | null;
  modalOpen: boolean;
  installing: boolean;
  /** Mostra a confirmação "Liga INATEL instalada" */
  justInstalled: boolean;
}

const INSTALLED_KEY = "hh_liga_pwa_installed";

const initial: LigaPwaState = {
  ready: false,
  info: null,
  standalone: false,
  installed: false,
  deferred: null,
  modalOpen: false,
  installing: false,
  justInstalled: false,
};

let state: LigaPwaState = initial;
const listeners = new Set<() => void>();

function set(patch: Partial<LigaPwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLigaPwa(): LigaPwaState {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}

/** Pode mostrar o convite? Só mobile, e só se ainda não estiver instalada. */
export function canOfferInstall(s: LigaPwaState): boolean {
  return s.ready && !!s.info && s.info.platform !== "desktop" && !s.standalone && !s.installed;
}

export function isStandaloneDisplay(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function readInstalledFlag(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}
function writeInstalledFlag(v: boolean) {
  try {
    if (v) localStorage.setItem(INSTALLED_KEY, "1");
    else localStorage.removeItem(INSTALLED_KEY);
  } catch { /* storage indisponível */ }
}

let started = false;

/** Liga os listeners globais. Idempotente; devolve função de limpeza. */
export function startLigaPwa(): () => void {
  if (started) return () => {};
  started = true;

  const onBip = (e: Event) => {
    e.preventDefault(); // usamos o nosso botão em vez da mini-barra do Chrome
    window.__ligaBIP = e as BeforeInstallPromptEvent;
    // Se o browser volta a oferecer a instalação, a app não está instalada
    // (ex.: foi desinstalada) — limpa a marca antiga.
    writeInstalledFlag(false);
    set({ deferred: e as BeforeInstallPromptEvent, installed: false });
  };
  const onEarlyBip = () => {
    if (window.__ligaBIP) {
      writeInstalledFlag(false);
      set({ deferred: window.__ligaBIP, installed: false });
    }
  };
  const onInstalled = () => {
    window.__ligaBIP = null;
    writeInstalledFlag(true);
    set({ installed: true, deferred: null, installing: false, modalOpen: false, justInstalled: true });
  };
  const mq = window.matchMedia("(display-mode: standalone)");
  const onDisplay = () => set({ standalone: isStandaloneDisplay() });

  window.addEventListener("beforeinstallprompt", onBip);
  window.addEventListener("liga-bip", onEarlyBip);
  window.addEventListener("appinstalled", onInstalled);
  mq.addEventListener?.("change", onDisplay);

  const early = window.__ligaBIP ?? null;
  set({
    ready: true,
    info: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    standalone: isStandaloneDisplay(),
    installed: early ? false : readInstalledFlag(),
    deferred: early,
  });

  return () => {
    started = false;
    window.removeEventListener("beforeinstallprompt", onBip);
    window.removeEventListener("liga-bip", onEarlyBip);
    window.removeEventListener("appinstalled", onInstalled);
    mq.removeEventListener?.("change", onDisplay);
  };
}

export function openInstallModal() { set({ modalOpen: true }); }
export function closeInstallModal() { set({ modalOpen: false, installing: false }); }
export function clearJustInstalled() { set({ justInstalled: false }); }

/** Abre a janela nativa de instalação (Android/Chrome). */
export async function runNativeInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = state.deferred;
  if (!ev) return "unavailable";
  set({ installing: true });
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    // O evento só pode ser usado uma vez
    window.__ligaBIP = null;
    if (outcome === "accepted") {
      // A conclusão real chega pelo evento appinstalled; por segurança marca já
      writeInstalledFlag(true);
      set({ deferred: null, installing: false, installed: true, modalOpen: false, justInstalled: true });
    } else {
      set({ deferred: null, installing: false });
    }
    return outcome;
  } catch {
    window.__ligaBIP = null;
    set({ deferred: null, installing: false });
    return "unavailable";
  }
}
