import { mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import QuestLevelPlan from "./QuestLevelPlan.vue";
import type { LevelMilestone } from "@/composables/party/useLevelMilestones";

const state = vi.hoisted(() => ({
  xp: false,
  milestones: [] as LevelMilestone[],
  partyEnabled: null as (() => boolean) | null,
  folded: {} as Record<string, boolean>,
  /** The store's refs, as the real store caches them; cleared per test. */
  foldRefs: new Map<string, { value: boolean }>(),
}));

vi.mock("@/composables/rules/useOptionalRules", async () => {
  const { computed } = await import("vue");
  return { useIsRuleEnabled: () => computed(() => state.xp) };
});
vi.mock("@/composables/party/useLevelMilestones", async () => {
  const { computed } = await import("vue");
  return { useLevelMilestones: () => ({ data: computed(() => state.milestones) }) };
});
vi.mock("@/composables/party/useActiveParty", async () => {
  const { computed } = await import("vue");
  return {
    useActiveParty: (enabled: () => boolean) => {
      state.partyEnabled = enabled;
      return { data: computed(() => [{ id: "pm-a" }, { id: "pm-b" }]) };
    },
  };
});
vi.mock("@/composables/quests/useQuests", async () => {
  const { computed } = await import("vue");
  return { useQuests: () => ({ data: computed(() => []) }) };
});
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { id: "c1", party_level: 3 } }) }));
vi.mock("@/stores/ui/quests", async () => {
  const { ref } = await import("vue");
  return {
    useQuestsUiStore: () => ({
      levelPlanFoldedFor: (id: string) => {
        if (!state.foldRefs.has(id)) state.foldRefs.set(id, ref(state.folded[id] ?? false));
        return state.foldRefs.get(id)!;
      },
    }),
  };
});

/** The warning line, reduced to what it was asked to check. */
const FlagsStub = defineComponent({
  props: { questIds: { type: Array, required: true }, level: { type: Number, required: true }, partyIds: { type: Array, required: true } },
  setup: (props) => () => h("p", { "data-flags": "" }, `${(props.questIds as string[]).join(",")} @ ${props.level}`),
});

const XpStub = defineComponent({ setup: () => () => h("div", { "data-xp": "" }) });

const item = (id: string, done: boolean, inQuestId: string, objective = false) => ({
  id, questId: objective ? null : inQuestId, objectiveId: objective ? `o-${id}` : null, label: id, questTitle: objective ? "A quest" : null, inQuestId, done,
});
const milestone = (level: number, over: Partial<LevelMilestone> = {}): LevelMilestone => ({
  id: `m${level}`, level, needs: 2, note: null, reachedAt: null,
  items: [item("salt", true, "q-salt"), item("count", false, "q-count"), item("tower", false, "q-map", true), item("map", false, "q-map")],
  ...over,
});

const mountPlan = () =>
  mount(QuestLevelPlan, {
    global: { stubs: { RouterLink: RouterLinkStub, QuestLevelFlags: FlagsStub, QuestLevelExperience: XpStub } },
  });

describe("QuestLevelPlan", () => {
  beforeEach(() => {
    state.xp = false;
    state.milestones = [milestone(3, { reachedAt: "2026-11-18T00:00:00Z" }), milestone(4), milestone(5)];
    state.folded = {};
    state.foldRefs.clear();
  });

  it("warns about the next milestone's fights at the level it brings, from its quests and its objectives' quests, each once", () => {
    expect(mountPlan().find("[data-flags]").text()).toBe("q-salt,q-count,q-map @ 4");
  });

  it("folded, keeps the next level in one line and draws no columns", () => {
    state.folded = { c1: true };
    const w = mountPlan();
    expect(w.text()).toContain("next: level 4, 1 of 2 done");
    expect(w.find("[data-flags]").exists()).toBe(false);
  });

  it("folding is kept for the campaign", async () => {
    const w = mountPlan();
    await w.find('button[aria-label="Fold the level plan"]').trigger("click");
    expect(mountPlan().find('button[aria-label="Open the level plan"]').exists()).toBe(true);
  });

  it("an Experience campaign shows the XP plan, and no milestones or Edit levels", () => {
    state.xp = true;
    const w = mountPlan();
    expect(w.find("[data-xp]").exists()).toBe(true);
    expect(w.text()).not.toContain("Edit levels");
    expect(w.text()).not.toContain("Level 4");
  });

  it("does not read the party for a milestone campaign with nothing ahead", () => {
    state.milestones = [milestone(3, { reachedAt: "2026-11-18T00:00:00Z" })];
    mountPlan();
    expect(state.partyEnabled?.()).toBe(false);
  });
});
