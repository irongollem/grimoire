import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestLevelFlags from "./QuestLevelFlags.vue";

const state = vi.hoisted(() => ({ npcsEnabled: null as (() => boolean) | null }));

vi.mock("@/composables/quests/useQuests", async () => {
  const { computed } = await import("vue");
  return { useEncounterQuestLinks: () => ({ data: computed(() => [{ encounterId: "e1", questId: "q1" }]) }) };
});
vi.mock("@/composables/encounters/useEncounters", async () => {
  const { computed } = await import("vue");
  return {
    useEncounters: () => ({
      data: computed(() => [{
        id: "e1", name: "The Ferry", combatants: [], factions: [], party_member_ids: [], companion_ids: ["comp1"],
        trap_ids: [], library_trap_ids: [], is_finished: false,
      }]),
    }),
  };
});
vi.mock("@/composables/encounters/useCompanions", async () => {
  const { computed } = await import("vue");
  return { useCompanions: () => ({ data: computed(() => [{ id: "comp1", source_npc_id: "npc1", source_monster_id: null }]) }) };
});
vi.mock("@/composables/monsters/useMonstersByIds", async () => {
  const { computed } = await import("vue");
  return { useMonstersByIds: () => ({ data: computed(() => new Map()) }) };
});
vi.mock("@/composables/npcs/useNpcs", async () => {
  const { computed } = await import("vue");
  return {
    useNpcs: (enabled: () => boolean) => {
      state.npcsEnabled = enabled;
      return { data: computed(() => []) };
    },
  };
});
vi.mock("@/composables/dungeon-features/useTraps", async () => {
  const { computed } = await import("vue");
  return { useTrapResolver: () => ({ byId: computed(() => new Map()) }) };
});

describe("QuestLevelFlags", () => {
  // CodeRabbit on #1227: a fight whose only NPC stands behind a companion left the NPC list unread, so the companion
  // counted with no challenge rating and the warning was worked out on part of the fight.
  it("reads the NPCs when a companion of the fight is built from one", () => {
    mount(QuestLevelFlags, { props: { questIds: ["q1"], level: 4, partyIds: ["a"] }, global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(state.npcsEnabled?.()).toBe(true);
  });
});
