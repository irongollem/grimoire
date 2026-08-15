// Module-level state is intentional — singleton shared between PlayerLayout and PlayerSettingsView.
import { ref, computed } from "vue";
import { ALL_PLAYER_NAV } from "@/lib/playerNav";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

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
  // A tab for a module the DM has switched off must not appear in the portal.
  // The rule query is campaign-scoped and cached, so calling it here is cheap.
  // While it loads, `isRuleEffectivelyEnabled` falls back to the rule's
  // `defaultEnabled`, so an on-by-default tab never flickers out and back in.
  const { data: campaignRules } = useOptionalRules();
  const auth = useAuthStore();
  const ui = useUiStore();

  const visibleNav = computed(() => {
    // No campaign membership (#729): every campaign-scoped tab would only
    // bounce off the router guard back to the pool, so show the pool alone.
    // DM preview keeps the full nav — the preview *is* a membership's view.
    if (!auth.isPlayer && !ui.dmPreviewMode) {
      return sortedNav.value.filter((item) => item.standalone);
    }
    return sortedNav.value.filter(
      (item) => !item.ruleKey || isRuleEffectivelyEnabled(campaignRules.value, item.ruleKey),
    );
  });

  function setNavOrder(order: string[]) {
    navOrder.value = order;
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
  }

  return {
    navOrder,
    /** Rule-gated — a module the DM switched off is absent everywhere, including
     *  the reorder UI. A tab dropped from the saved order simply falls back to
     *  its default position if the rule is turned back on. */
    sortedNav: visibleNav,
    setNavOrder,
  };
}
