import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { ref } from "vue";

const LOCALE_KEY = "grimoire_locale";

const storedLocale = safeLocalStorage().getItem(LOCALE_KEY) ?? "";
const chatLocale = ref(storedLocale);

export function useLocalePrefs() {
  function setChatLocale(locale: string) {
    const trimmed = locale.trim();
    chatLocale.value = trimmed;
    if (trimmed) safeLocalStorage().setItem(LOCALE_KEY, trimmed);
    else safeLocalStorage().removeItem(LOCALE_KEY);
  }
  return { chatLocale, setChatLocale };
}
