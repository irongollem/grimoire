import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { ALL_PLAYER_NAV } from "@/lib/playerNav";
import { useAppUiStore } from "@/stores/ui/app";
import type { CampaignRule } from "@/types/rule.types";

const session = vi.hoisted(() => ({ isPlayer: true }));
const rules = vi.hoisted(() => ({ rows: undefined as unknown }));

vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isPlayer: session.isPlayer }) }));
vi.mock("@/composables/rules/useOptionalRules", async () => {
  const actual = await vi.importActual<typeof import("@/composables/rules/useOptionalRules")>("@/composables/rules/useOptionalRules");
  return { ...actual, useOptionalRules: () => ({ data: ref(rules.rows) }) };
});

import { applyNavOrder, loadNavOrder, usePlayerNavPrefs } from "./usePlayerNavPrefs";

const ids = (order: readonly string[]) => applyNavOrder(ALL_PLAYER_NAV, order).map((i) => i.id);
const defaults = ALL_PLAYER_NAV.map((i) => i.id);

beforeEach(() => localStorage.clear());

describe("loadNavOrder", () => {
  it("is empty for a fresh user, giving defaults", () => {
    expect(loadNavOrder()).toEqual([]);
    expect(ids([])).toEqual(defaults);
  });

  it("converts the legacy path order once: /play is the character, hearth goes first", () => {
    localStorage.setItem("grimoire_nav_order", JSON.stringify(["/play/spells", "/play", "/play/journal"]));
    expect(loadNavOrder()).toEqual(["hearth", "spells", "character", "journal"]);
    expect(localStorage.getItem("grimoire_nav_order")).toBeNull();
    expect(JSON.parse(localStorage.getItem("grimoire_nav_order_v2") ?? "null")).toEqual([
      "hearth", "spells", "character", "journal",
    ]);
    // Second read comes from the new key.
    expect(loadNavOrder()).toEqual(["hearth", "spells", "character", "journal"]);
  });

  it("drops unknown legacy entries", () => {
    localStorage.setItem("grimoire_nav_order", JSON.stringify(["/play/gone", "/play/atlas"]));
    expect(loadNavOrder()).toEqual(["hearth", "atlas"]);
  });

  it("ignores corrupt storage, a stored value that is not a list, and entries that are not ids", () => {
    localStorage.setItem("grimoire_nav_order_v2", "{nope");
    expect(loadNavOrder()).toEqual([]);
    localStorage.setItem("grimoire_nav_order_v2", JSON.stringify({ atlas: 1 }));
    expect(loadNavOrder()).toEqual([]);
    localStorage.setItem("grimoire_nav_order_v2", JSON.stringify(["atlas", 5, null, "hearth"]));
    expect(loadNavOrder()).toEqual(["atlas", "hearth"]);
  });
});

describe("applyNavOrder", () => {
  it("drops unknown ids and keeps saved order", () => {
    const out = ids(["ghost", "atlas", "hearth"]);
    expect(out.indexOf("atlas")).toBeLessThan(out.indexOf("hearth"));
    expect(out).not.toContain("ghost");
    expect(out).toHaveLength(defaults.length);
  });

  it("places a newly added item after its default predecessor", () => {
    const saved = defaults.filter((id) => id !== "calendar").reverse();
    const out = ids(saved);
    expect(out.indexOf("calendar")).toBe(out.indexOf("inventory") + 1);
  });
});

describe("usePlayerNavPrefs visible tabs", () => {
  const ruleRow = (rule_key: string, enabled: boolean): CampaignRule => ({
    campaign_id: "c1",
    rule_key,
    enabled,
    config: null,
    updated_at: "",
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    session.isPlayer = true;
    rules.rows = undefined;
  });

  it("hides a tab whose module the DM switched off, and keeps an on-by-default tab while the rules load", () => {
    expect(usePlayerNavPrefs().sortedNav.value.map((i) => i.id)).toContain("crafting");
    rules.rows = [ruleRow("crafting", false)];
    const ids = usePlayerNavPrefs().sortedNav.value.map((i) => i.id);
    expect(ids).not.toContain("crafting");
    expect(ids).toContain("hearth");
  });

  it("shows only the standalone tabs to an account with no campaign seat", () => {
    session.isPlayer = false;
    const items = usePlayerNavPrefs().sortedNav.value;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.standalone)).toBe(true);
  });

  it("keeps the full nav in the DM's player preview, since the preview is a seat's view", () => {
    session.isPlayer = false;
    useAppUiStore().dmPreviewMode = true;
    expect(usePlayerNavPrefs().sortedNav.value.map((i) => i.id)).toContain("hearth");
  });
});
