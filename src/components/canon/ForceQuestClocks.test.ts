import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { QuestClock } from "@/types/quest.types";
import { canonEntry } from "@/test/canonEntry";

const clocks = ref<QuestClock[]>([]);
vi.mock("@/composables/quests/useQuestClocks", () => ({ useCampaignQuestClocks: () => ({ data: clocks }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([{ id: "q1", title: "The Sour Orchard" }]) }) }));

import ForceQuestClocks from "./ForceQuestClocks.vue";

const clock = (over: Partial<QuestClock>) =>
  ({ id: "k1", quest_id: "q1", label: "The ritual", segments: 6, filled: 2, moves_force_id: "f1", ...over }) as QuestClock;
const force = (over = {}) => canonEntry({ id: "f1", part: "force", title: "The Stain", ...over });
const RouterLink = { props: ["to"], template: "<a :href=\"to\"><slot /></a>" };
const mountIt = (entry = force()) => mount(ForceQuestClocks, { props: { entry }, global: { stubs: { RouterLink } } });

describe("ForceQuestClocks", () => {
  // Bug caught: the list showed every clock of the campaign, not only those tied to this force.
  it("lists only the clocks that move this force, with the quest and the fill", () => {
    clocks.value = [clock({}), clock({ id: "k2", label: "Another force's", moves_force_id: "f2" }), clock({ id: "k3", label: "Moves none", moves_force_id: null })];
    const w = mountIt();
    expect(w.text()).toContain("The ritual");
    expect(w.text()).toContain("2 of 6");
    expect(w.get("a").attributes("href")).toBe("/quests/q1");
    expect(w.text()).toContain("The Sour Orchard");
    expect(w.text()).not.toContain("Another force's");
    expect(w.text()).not.toContain("Moves none");
  });

  // Bug caught: an empty "Moved by quest clocks" heading on every force.
  it("renders nothing when no clock moves it", () => {
    clocks.value = [clock({ moves_force_id: "f2" })];
    expect(mountIt().find("[data-testid=force-quest-clocks]").exists()).toBe(false);
  });

  // Bug caught: an ended force listed its clocks as if they still moved it.
  it("says an ended force is no longer moved, and a moving one does not", () => {
    clocks.value = [clock({})];
    expect(mountIt().find("[data-testid=force-quest-clocks-ended]").exists()).toBe(false);
    const w = mountIt(force({ closed_as: "stopped", closed_at: "2026-11-20T10:00:00Z" }));
    expect(w.get("[data-testid=force-quest-clocks-ended]").text()).toBe("It has ended, so these clocks no longer move it.");
    expect(w.text()).toContain("The ritual");
  });
});
