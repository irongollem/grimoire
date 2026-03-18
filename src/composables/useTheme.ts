import { ref, readonly } from "vue";
import { THEMES, DEFAULT_THEME_ID } from "@/lib/themes";
import type { GrimoireTheme } from "@/lib/themes";

const STORAGE_KEY = "grimoire-theme";

const activeId = ref<string>(
  localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
);

function applyTheme(theme: GrimoireTheme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute("data-theme", theme.id);
  localStorage.setItem(STORAGE_KEY, theme.id);
  activeId.value = theme.id;
}

export function useTheme() {
  function setTheme(id: string) {
    const theme = THEMES.find((t) => t.id === id);
    if (theme) applyTheme(theme);
  }

  /** Call once at app startup to restore the saved theme. */
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
    setTheme(saved);
  }

  return {
    activeThemeId: readonly(activeId),
    themes: THEMES,
    setTheme,
    initTheme,
  };
}
