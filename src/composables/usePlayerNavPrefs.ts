// Module-level state is intentional — singleton shared between PlayerLayout and PlayerSettingsView.
import { ref, computed } from "vue";
import { ALL_PLAYER_NAV } from "@/lib/playerNav";

const NAV_ORDER_KEY = "grimoire_nav_order";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

const navOrder = ref<string[]>(loadJson<string[]>(NAV_ORDER_KEY, []));

// Pre-built index map avoids O(n) indexOf calls inside sort comparators.
const DEFAULT_NAV_INDEX = new Map(ALL_PLAYER_NAV.map((item, i) => [item.to, i]));

const sortedNav = computed(() => {
  if (navOrder.value.length > 0) {
    const orderMap = new Map(navOrder.value.map((to, i) => [to, i]));
    return [...ALL_PLAYER_NAV].sort((a, b) => {
      const ia = orderMap.get(a.to) ?? DEFAULT_NAV_INDEX.get(a.to) ?? 0;
      const ib = orderMap.get(b.to) ?? DEFAULT_NAV_INDEX.get(b.to) ?? 0;
      return ia - ib;
    });
  }
  return [...ALL_PLAYER_NAV];
});

export function usePlayerNavPrefs() {
  function setNavOrder(order: string[]) {
    navOrder.value = order;
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
  }

  return {
    navOrder,
    sortedNav,
    setNavOrder,
  };
}
