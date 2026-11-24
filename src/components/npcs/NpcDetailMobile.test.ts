import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NpcDetailMobile from "./NpcDetailMobile.vue";
import type { NpcListRow } from "@/types/npc.types";

// The two async chunks the Combat section draws: each is counted when its module is first imported, which is when the browser would fetch it.
const loaded = vi.hoisted(() => ({ panel: 0, tactics: 0 }));
vi.mock("@/components/common/statblock/StatBlockPanel.vue", () => {
  loaded.panel += 1;
  return { __esModule: true, default: { template: "<div data-testid='stat-block-panel' />" } };
});
vi.mock("@/components/common/statblock/StatBlockTacticsSummary.vue", () => {
  loaded.tactics += 1;
  return { __esModule: true, default: { template: "<div data-testid='tactics' />" } };
});
vi.mock("@/composables/npcs/useNpcs", () => ({ useDeleteNpc: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useNpcFactions: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: { value: [] } }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const npc = { id: "npc-1", name: "Elowen", relationship: "neutral", status: "alive", tags: [], campaign_id: "c1", stat_block: { special_abilities: [], actions: [] } } as unknown as NpcListRow;

function mountSheet() {
  setActivePinia(createPinia());
  return mount(NpcDetailMobile, {
    props: { npc },
    global: {
      // The real accordion (it is what toggles and hides with v-show); everything else about the sheet is out of this test's way.
      stubs: {
        EntitySheetMobile: { template: "<div><slot /></div>" }, NpcRevealControl: true, NpcLoreSections: true, NpcPartyTab: true, NpcMemoryTab: true,
        NpcInventorySection: true, NpcRelationsTab: true, NpcVoiceCoach: true, NpcSpokenVoice: true, DmNoteBox: true, EntityBacklinks: true, TraitList: { template: "<div><slot /></div>" }, SpellcastingList: true,
        BannerLoader: true, QuickFact: true, AppButton: true,
      },
    },
  });
}

describe("NpcDetailMobile: the Combat section builds its body when first opened", () => {
  // The accordion hides a closed body with v-show, so it is mounted anyway. Until Combat is opened the stat block and tactics chunks must not be fetched
  // (CodeRabbit on #1261), and once opened the body stays so the collapse animation has something to collapse.
  // Bugs caught: the heavy stat block chunks loaded by every NPC sheet that never opens Combat; a body torn down the moment the section closes.
  it("fails if Combat's chunks load before it is opened, or its body goes when it is closed again", async () => {
    const w = mountSheet();
    await flushPromises();
    expect(loaded).toEqual({ panel: 0, tactics: 0 });
    expect(w.find("[data-testid='stat-block-panel']").exists()).toBe(false);

    const combat = w.findAll("button").find((b) => b.text() === "Combat");
    expect(combat).toBeDefined();
    await combat!.trigger("click");
    await flushPromises();
    expect(loaded).toEqual({ panel: 1, tactics: 1 });
    expect(w.find("[data-testid='stat-block-panel']").exists()).toBe(true);

    await combat!.trigger("click");
    await flushPromises();
    expect(w.find("[data-testid='stat-block-panel']").exists()).toBe(true);
  });

  // An NPC with no stat block says so, whether or not the section was opened.
  // Bug caught: the "no stat block" line lost when the body became conditional.
  it("fails if an NPC with no stat block loses its empty-state line", () => {
    setActivePinia(createPinia());
    const bare = mount(NpcDetailMobile, { props: { npc: { ...npc, stat_block: null } as unknown as NpcListRow }, global: { stubs: { EntitySheetMobile: { template: "<div><slot /></div>" }, NpcRevealControl: true, NpcLoreSections: true, NpcPartyTab: true, NpcMemoryTab: true, NpcInventorySection: true, NpcRelationsTab: true, NpcVoiceCoach: true, NpcSpokenVoice: true, DmNoteBox: true, EntityBacklinks: true, BannerLoader: true, QuickFact: true, AppButton: true } } });
    expect(bare.text()).toContain("No stat block defined for this NPC.");
  });
});
