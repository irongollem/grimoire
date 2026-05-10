import { ref } from "vue";

const LOCALE_KEY = "grimoire_locale";

const storedLocale =
  typeof localStorage !== "undefined" ? (localStorage.getItem(LOCALE_KEY) ?? "") : "";
const chatLocale = ref(storedLocale);

export function useLocalePrefs() {
  function setChatLocale(locale: string) {
    const trimmed = locale.trim();
    chatLocale.value = trimmed;
    if (typeof localStorage !== "undefined") {
      if (trimmed) localStorage.setItem(LOCALE_KEY, trimmed);
      else localStorage.removeItem(LOCALE_KEY);
    }
  }
  return { chatLocale, setChatLocale };
}
