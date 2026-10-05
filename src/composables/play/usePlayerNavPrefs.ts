// Module-level state is intentional — singleton shared between PlayerLayout and PlayerSettingsView.
import { ref, computed } from "vue";
import { ALL_PLAYER_NAV, type PlayerNavItem } from "@/lib/playerNav";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/rules/useOptionalRules";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

const NAV_ORDER_KEY = "grimoire_nav_order_v2";
// Pre-#977 key: stored `to` paths, where "/play" meant the character sheet.
const LEGACY_NAV_ORDER_KEY = "grimoire_nav_order";
const LEGACY_PATH_TO_ID: Readonly<Record<string, string>> = {
  "/play": "character",
  ...Object.fromEntries(
    ALL_PLAYER_NAV.filter((item) => item.to !== "/play" && item.to !== "/play/character").map((item) => [item.to, item.id]),
  ),
};

function readStringArray(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : null;
  } catch {
    return null;
  }
}

/** Reads the saved order (ids), converting the legacy path-keyed one once. */
export function loadNavOrder(): string[] {
  const current = readStringArray(NAV_ORDER_KEY);
  if (current) return current;
  const legacy = readStringArray(LEGACY_NAV_ORDER_KEY);
  if (!legacy) return [];
  const ids = legacy.flatMap((path) => {
    const id = LEGACY_PATH_TO_ID[path];
    return id ? [id] : [];
  });
  if (!ids.includes("hearth")) ids.unshift("hearth");
  try {
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(ids));
    localStorage.removeItem(LEGACY_NAV_ORDER_KEY);
  } catch {
    // Storage unavailable: the converted order still applies for this session.
  }
  return ids;
}

/**
 * Applies a saved id order. Listed items come first in saved order; items the
 * order does not mention (new tabs) keep their default relative order after the
 * last listed item that precedes them by default, so the result is deterministic.
 */
export function applyNavOrder(items: readonly PlayerNavItem[], order: readonly string[]): PlayerNavItem[] {
  if (order.length === 0) return [...items];
  const saved = new Map(order.map((id, i) => [id, i]));
  const result: PlayerNavItem[] = [];
  const known = items.filter((item) => saved.has(item.id));
  known.sort((a, b) => (saved.get(a.id) ?? 0) - (saved.get(b.id) ?? 0));
  result.push(...known);
  // Insert each unlisted item right after the item that precedes it by default.
  items.forEach((item, i) => {
    if (saved.has(item.id)) return;
    const prev = i > 0 ? items[i - 1] : null;
    const at = prev ? result.findIndex((r) => r.id === prev.id) : -1;
    result.splice(at + 1, 0, item);
  });
  return result;
}

const navOrder = ref<string[]>(typeof localStorage === "undefined" ? [] : loadNavOrder());

const sortedNav = computed(() => applyNavOrder(ALL_PLAYER_NAV, navOrder.value));

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
    try {
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
    } catch {
      // Storage unavailable: the order holds for this session only.
    }
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
