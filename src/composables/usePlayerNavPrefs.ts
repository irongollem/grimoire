// Module-level state is intentional — singleton shared between PlayerLayout and PlayerSettingsView.
import { ref, computed } from "vue";
import { ALL_PLAYER_NAV } from "@/lib/playerNav";

const NAV_MODE_KEY  = "grimoire_nav_mode";
const NAV_ORDER_KEY = "grimoire_nav_order";
const NAV_USAGE_KEY = "grimoire_nav_usage";

function loadJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

const navMode  = ref<"dynamic" | "custom">(
  (localStorage.getItem(NAV_MODE_KEY) as "dynamic" | "custom" | null) ?? "dynamic",
);
const navOrder = ref<string[]>(loadJson<string[]>(NAV_ORDER_KEY, []));
const usageScores = ref<Record<string, number>>(loadJson<Record<string, number>>(NAV_USAGE_KEY, {}));

// Pre-built index map avoids O(n) indexOf calls inside sort comparators.
const DEFAULT_NAV_INDEX = new Map(ALL_PLAYER_NAV.map((item, i) => [item.to, i]));

// Tier = floor(log2(score + 1)).  Boundaries: 0, 1, 3, 7, 15, 31 …
// Needs ~2× visits to advance one tier — prevents jitter from small score diffs.
function logTier(to: string): number {
  return Math.floor(Math.log2((usageScores.value[to] ?? 0) + 1));
}

const sortedNav = computed(() => {
  if (navMode.value === "custom" && navOrder.value.length > 0) {
    const orderMap = new Map(navOrder.value.map((to, i) => [to, i]));
    return [...ALL_PLAYER_NAV].sort((a, b) => {
      const ia = orderMap.get(a.to) ?? DEFAULT_NAV_INDEX.get(a.to) ?? 0;
      const ib = orderMap.get(b.to) ?? DEFAULT_NAV_INDEX.get(b.to) ?? 0;
      return ia - ib;
    });
  }

  return [...ALL_PLAYER_NAV].sort((a, b) => {
    const diff = logTier(b.to) - logTier(a.to);
    return diff !== 0 ? diff : (DEFAULT_NAV_INDEX.get(a.to) ?? 0) - (DEFAULT_NAV_INDEX.get(b.to) ?? 0);
  });
});

export function usePlayerNavPrefs() {
  function setNavMode(mode: "dynamic" | "custom") {
    navMode.value = mode;
    localStorage.setItem(NAV_MODE_KEY, mode);
    // When first switching to custom, seed the order from the current dynamic sort
    if (mode === "custom" && navOrder.value.length === 0) {
      const seeded = sortedNav.value.map((item) => item.to);
      navOrder.value = seeded;
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(seeded));
    }
  }

  function setNavOrder(order: string[]) {
    navOrder.value = order;
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
  }

  function trackNav(to: string) {
    usageScores.value = {
      ...usageScores.value,
      [to]: (usageScores.value[to] ?? 0) + 1,
    };
    localStorage.setItem(NAV_USAGE_KEY, JSON.stringify(usageScores.value));
  }

  return {
    navMode,
    navOrder,
    usageScores,
    sortedNav,
    setNavMode,
    setNavOrder,
    trackNav,
  };
}
