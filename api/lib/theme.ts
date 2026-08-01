export type Theme = "light" | "dark";

const KEY = "excise-portal:theme";

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
}

export function resolveInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
