import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerEncounterPanel from "./PlayerEncounterPanel.vue";

const h = vi.hoisted(() => ({
  location: null as unknown,
  image: null as unknown,
  live: null as unknown,
  memberId: null as string | null,
  promptRoll: vi.fn(),
}));

vi.mock("@/composables/encounters/useEncounterLive", async () => {
  const { ref } = await import("vue");
  h.live = ref({ id: "enc-1", is_running: true, current_round: 1, active_combatant_index: 0, combatants_live: [], location_id: "loc-1" });
  return { liveState: h.live };
});
vi.mock("@/composables/locations/useLocations", async () => {
  const { computed } = await import("vue");
  return { usePlayerVisibleLocation: () => ({ data: computed(() => h.location) }) };
});
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: { value: "2024" } }) }));
vi.mock("@/lib/locations/mapStack", () => ({ primaryImage: () => h.image }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll: h.promptRoll }) }));
vi.mock("@/composables/party/useParty", async () => {
  const { ref } = await import("vue");
  return { useParty: () => ({ data: ref([]) }), useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) };
});
vi.mock("@/composables/encounters/useCompanions", async () => {
  const { ref } = await import("vue");
  return { useCompanions: () => ({ data: ref([]) }), useUpdateCompanion: () => ({ mutateAsync: vi.fn() }) };
});
vi.mock("@/composables/npcs/useNpcs", async () => {
  const { ref } = await import("vue");
  return { useSharedNpcs: () => ({ data: ref([]) }) };
});
vi.mock("@/composables/encounters/useTurnTimerConfig", async () => {
  const { ref } = await import("vue");
  return { useTurnTimerConfig: () => ({ turnTimerSeconds: ref(0), turnResetKey: ref(0) }) };
});
vi.mock("@/composables/player/usePlayerCombatPrefs", async () => {
  const { ref } = await import("vue");
  return { usePlayerCombatPrefs: () => ({ turnAudioEnabled: ref(false) }) };
});
vi.mock("@/composables/player/useTurnChime", () => ({ useTurnChime: () => ({ playTurnChime: vi.fn() }) }));
vi.mock("@/composables/useScreenShake", async () => {
  const { ref } = await import("vue");
  return { useScreenShake: () => ({ isShaking: ref(false), triggerShake: vi.fn() }) };
});
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: h.memberId }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: null, activeCampaignId: "c1" }) }));

const Button = defineComponent({ props: ["to", "label"], template: `<a :href="to">{{ label }}</a>` });
const Plain = defineComponent({ template: `<div />` });

function mountPanel() {
  return mount(PlayerEncounterPanel, {
    global: {
      stubs: {
        AppButton: Button,
        PartyMemberLightbox: Plain,
        EncounterCombatantList: Plain,
        PlayerNpcLightbox: Plain,
        EncounterCombatantLightbox: Plain,
        TurnTimer: Plain,
        FocalImage: Plain,
      },
    },
  });
}

const calibrated = { url: "map.png", calibration: { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0 } };

beforeEach(() => {
  h.memberId = null;
  h.promptRoll.mockReset();
  h.location = { id: "loc-1", is_battle_map: false };
  h.image = calibrated;
});

describe("the View battle map entry", () => {
  it("shows on a calibrated grid even though the site is not flagged as a battle map (#1125 decision 14)", () => {
    expect(mountPanel().text()).toContain("View battle map");
  });

  it("is not hidden below md: a phone gets it too", () => {
    // jsdom has no stylesheet, so the only way a phone loses the entry is a `hidden` utility on it.
    expect(mountPanel().find('a[href="/play/encounter/map"]').classes()).not.toContain("hidden");
  });

  it("stays away until the grid is calibrated, since there is nothing to play on", () => {
    h.image = { url: "map.png", calibration: null };
    expect(mountPanel().text()).not.toContain("View battle map");
  });

  it("stays away when the encounter has no location to read", () => {
    h.location = undefined;
    h.image = null;
    expect(mountPanel().text()).not.toContain("View battle map");
  });
});

describe("the player's own initiative roll (#1149)", () => {
  function seat(over: Record<string, unknown>) {
    h.memberId = "pm-1";
    (h.live as { value: { current_round: number; combatants_live: unknown[] } }).value = {
      ...(h.live as { value: object }).value,
      current_round: 0,
      combatants_live: [
        {
          instance_id: "p-pm-1", type: "player", name: "Toddy", faction_id: "f", initiative: null, hp: 10, max_hp: 10,
          ac: "12", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 },
          party_member_id: "pm-1", dex_mod: 2, ...over,
        },
      ],
    } as never;
  }

  it("shows and rolls DEX plus initiative_extra, the +7 the DM's runner rolls, not the DEX modifier alone", async () => {
    // Initiative is a DEX check; the character adds Alert (+3 here) and Jack of All Trades (+2): 2 + 5 = 7.
    seat({ initiative_extra: 5 });
    h.promptRoll.mockResolvedValue(null);
    const w = mountPanel();
    expect(w.text()).toContain("d20 +7 for Toddy");
    await w.findAll("a").find((a) => a.text() === "Roll initiative")?.trigger("click");
    expect(h.promptRoll).toHaveBeenCalledWith(expect.objectContaining({ modifier: 7, mode: "normal" }));
  });

  it("rolls at disadvantage while Poisoned: a check made with a condition that imposes it (PHB 2014 Poisoned)", async () => {
    seat({ conditions: [{ name: "Poisoned" }] });
    h.promptRoll.mockResolvedValue(null);
    const w = mountPanel();
    await w.findAll("a").find((a) => a.text() === "Roll initiative")?.trigger("click");
    expect(h.promptRoll).toHaveBeenCalledWith(expect.objectContaining({ modifier: 2, mode: "disadvantage" }));
  });
});
