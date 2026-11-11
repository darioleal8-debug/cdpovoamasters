export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/** Tema guardado (ou preferência do sistema, se ainda não houver escolha). */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Aplica o tema ao <html>. O CSS (variáveis shadcn) e o Tailwind (darkMode: "class")
 * reagem à classe `dark`; o atributo data-theme é mantido para quem o lê (ex: play-viewer).
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* modo privado / storage indisponível — o tema aplica-se na mesma nesta sessão */
  }
}

/** Remove a classe `dark` (ao sair da área de gestão, que é a única com tema escuro). */
export function clearDarkClass() {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "";
}
