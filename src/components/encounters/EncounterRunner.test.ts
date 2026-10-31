// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { RunCombatant } from "@/types/encounter.types";

// The runner wires a dozen data composables; none of them is under test here.
const isMobile = ref(false);
const canOpenBattleMap = ref(false);
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useIsMobile: () => isMobile,
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { id: "enc1" } }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: vi.fn(), error: vi.fn(), fromError: vi.fn() }) }));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounter: () => ({ data: ref(null) }) }));
// The Play bar names the site a fight is in (its back link); no site here, so no location reads.
vi.mock("@/composables/locations/useEncounterSite", () => ({ useEncounterSite: () => ref(null) }));
vi.mock("@/composables/encounters/useCombatExploration", () => ({
  useCombatExploration: () => ({
    canOpenBattleMap,
    battleMapDisabledReason: ref(""),
    markRoomsExploredFromFogMask: vi.fn(),
  }),
}));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({
  useCompanions: () => ({ data: ref([]) }),
  useUpdateCompanion: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useUpdateNpc: () => ({ mutateAsync: vi.fn() }) }));
// The point of the test: not live, and not able to go live.
vi.mock("@/composables/encounters/useEncounterLive", () => ({
  useEncounterLive: () => ({ isLive: ref(false), goLive: vi.fn(), schedulePush: vi.fn(), endLive: vi.fn() }),
  liveState: ref(null),
}));
vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({ useAutoDiscoverMonsters: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendSystemMessages: vi.fn() }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll: vi.fn() }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({
  useOptionalRules: () => ({ data: ref(undefined) }),
  isRuleEffectivelyEnabled: () => false,
}));
vi.mock("@/composables/encounters/useTurnTimerConfig", () => ({
  useTurnTimerConfig: () => ({ turnTimerSeconds: ref(null), turnResetKey: ref("k") }),
}));
vi.mock("@/lib/audio/audioTriggers", () => ({ requestAudioTheme: vi.fn(), releaseAudioTheme: vi.fn() }));
vi.mock("@/composables/encounters/useRunnerPartySync", () => ({
  useRunnerPartySync: () => ({ clearPartyInitiatives: vi.fn(), writePartyMember: vi.fn() }),
}));
vi.mock("@/composables/encounters/useEvergreenWildShape", () => ({ useEvergreenWildShape: vi.fn() }));

import EncounterRunner from "./EncounterRunner.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";

const beastArt = vi.hoisted(() => ({ byId: new Map<string, { image_url: string | null }>() }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({
  useMonstersByIds: () => ({ data: { value: beastArt.byId } }),
}));

function combatant(id: string): RunCombatant {
  return {
    instance_id: id, type: "monster", name: `Name ${id}`, faction_id: "f", initiative: 10, hp: 10, max_hp: 10, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0,
  };
}

const stubs = {
  RouterLink: { template: "<a><slot /></a>" },
  ManualHelpLink: true, TurnTimer: true, FocalImage: true,
  RunnerDueConditions: true, RunnerBossMechanics: true, RunnerSurprisePanel: true,
  RunnerCombatantList: true, RunnerSpawnPanel: true, RunnerDmTools: true,
  RunnerToolsSheet: true, DmNoteBox: true, PlayMap: true, PlayPhoneMap: true,
  RunnerEntityDetail: { template: "<div data-testid='detail' />" },
};

function mountRunner() {
  return mount(EncounterRunner, { global: { stubs }, attachTo: document.body });
}

describe("EncounterRunner", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
    const store = useEncounterRunStore();
    store.combatants = [combatant("a"), combatant("b")];
    store.round = 0;
    canOpenBattleMap.value = false;
  });

  // A DM who is not live (or has no campaign, so no Go Live) could never begin combat.
  it("desktop: Start combat is offered in the lobby when the DM is not live", () => {
    isMobile.value = false;
    const w = mountRunner();
    expect(w.findAll("button").some((b) => b.text().includes("Start Combat"))).toBe(true);
  });

  it("desktop: Start combat is gone once combat has begun", () => {
    isMobile.value = false;
    useEncounterRunStore().round = 1;
    const w = mountRunner();
    expect(w.findAll("button").some((b) => b.text().includes("Start Combat"))).toBe(false);
  });

  it("phone: Start combat is in the turn bar when not live, and the desktop top bar is not drawn", () => {
    isMobile.value = true;
    const w = mountRunner();
    expect(w.find("[data-testid=turn-bar]").text()).toContain("Start combat");
    expect(w.find(".runner-topbar").exists()).toBe(false);
  });

  it("phone: the turn bar's centre opens the active combatant's stat block full-screen", async () => {
    isMobile.value = true;
    const store = useEncounterRunStore();
    store.round = 1;
    const w = mountRunner();
    expect(document.body.querySelector("[data-testid=detail]")).toBeNull();
    await w.find("[aria-label='Open the active combatant']").trigger("click");
    expect(document.body.querySelector("[data-testid=detail]")).not.toBeNull();
    expect(document.body.querySelector(".fixed.inset-0")).not.toBeNull();
  });

  describe("with a battle map (the Play screen)", () => {
    beforeEach(() => {
      isMobile.value = false;
      canOpenBattleMap.value = true;
    });

    // #1125 decision 9: one screen from tablet up, so the old top bar and list body are gone.
    it("draws the Play screen instead of the classic top bar and list", () => {
      const w = mountRunner();
      expect(w.find("[data-testid=play-layout]").exists()).toBe(true);
      expect(w.find(".runner-topbar").exists()).toBe(false);
      expect(w.find(".runner-body-wrap").exists()).toBe(false);
    });

    it("names the round once combat runs, and offers Roll and Start only before it", () => {
      const pre = mountRunner();
      expect(pre.find("[data-testid=play-round-chip]").exists()).toBe(false);
      expect(pre.findAll("button").some((b) => b.text().includes("Start Combat"))).toBe(true);
      pre.unmount();

      const store = useEncounterRunStore();
      store.started = true;
      store.round = 3;
      const running = mountRunner();
      expect(running.find("[data-testid=play-round-chip]").text()).toBe("Fighting · Round 3");
      expect(running.findAll("button").some((b) => b.text().includes("Start Combat"))).toBe(false);
    });

    it("Next turn passes the turn to the next combatant in initiative order", async () => {
      const store = useEncounterRunStore();
      store.combatants = [{ ...combatant("a"), initiative: 15 }, { ...combatant("b"), initiative: 5 }];
      store.started = true;
      store.round = 1;
      store.activeIndex = 0;
      const w = mountRunner();
      await w.findAll("button").find((b) => b.text().includes("Next turn"))!.trigger("click");
      expect(store.activeCombatant?.instance_id).toBe("b");
    });

    it("Next turn is not offered as a live control before combat starts", () => {
      const w = mountRunner();
      const next = w.findAll("button").find((b) => b.text().includes("Next turn"))!;
      expect(next.attributes("disabled")).toBeDefined();
    });

    it("the initiative column lists everyone, sorted, and the one whose turn it is wears the bookmark edge", () => {
      const store = useEncounterRunStore();
      store.combatants = [{ ...combatant("a"), initiative: 5 }, { ...combatant("b"), initiative: 15 }];
      store.started = true;
      store.round = 1;
      store.activeIndex = 0;
      const w = mountRunner();
      const rows = w.findAll("[aria-label='Initiative order'] li");
      expect(rows.map((r) => r.text())).toEqual([expect.stringContaining("Name b"), expect.stringContaining("Name a")]);
      expect(rows[0].find("[data-turn=true]").exists()).toBe(true);
      expect(rows[1].find("[data-turn=true]").exists()).toBe(false);
    });
  });

  // In the lobby activeIndex still points at the first row, but nobody's turn has begun.
  it("marks nobody's turn before combat has started", () => {
    const store = useEncounterRunStore();
    store.combatants = [{ ...combatant("a"), initiative: 5 }];
    canOpenBattleMap.value = true;
    isMobile.value = false;
    const w = mountRunner();
    expect(w.find("[data-turn=true]").exists()).toBe(false);
  });

  it("phone with a battle map: a List | Map switch sits under the header and Map swaps the list for the map", async () => {
    isMobile.value = true;
    canOpenBattleMap.value = true;
    const w = mountRunner();
    expect(w.findComponent({ name: "PlayPhoneMap" }).exists()).toBe(false);
    await w.findAll("button").find((b) => b.text() === "Map")!.trigger("click");
    expect(w.findComponent({ name: "PlayPhoneMap" }).exists()).toBe(true);
  });

  it("phone without a battle map has no switch", () => {
    isMobile.value = true;
    const w = mountRunner();
    expect(w.findAll("button").some((b) => b.text() === "Map")).toBe(false);
  });
});
