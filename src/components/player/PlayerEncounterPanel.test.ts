import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerEncounterPanel from "./PlayerEncounterPanel.vue";

const h = vi.hoisted(() => ({
  location: null as unknown,
  image: null as unknown,
  live: null as unknown,
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
vi.mock("@/composables/party/useJackOfAllTrades", () => ({ useJackOfAllTrades: () => ({ jack: { value: "none" }, settledJack: () => Promise.resolve("none") }) }));
vi.mock("@/lib/locations/mapStack", () => ({ primaryImage: () => h.image }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll: vi.fn() }) }));
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
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: null }) }));
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
