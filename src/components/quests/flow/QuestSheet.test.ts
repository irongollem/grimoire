import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import QuestDrawer from "./QuestDrawer.vue";

const below = vi.hoisted(() => ({ value: { value: true } as { value: boolean } }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useBelow: () => below.value,
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref([{ id: "o1", status: "complete" }, { id: "o2", status: "pending" }, { id: "o3", status: "pending" }]) }),
}));
vi.mock("@/composables/quests/useQuestClocks", () => ({
  useQuestClocks: () => ({ data: ref([{ id: "c1", label: "The pack returns", segments: 6, filled: 2 }]) }),
}));

async function mountDrawer(mode: "quest" | "beat" | "route", isBelow = true) {
  setActivePinia(createPinia());
  below.value = ref(isBelow);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/quests/:id", component: { template: "<div />" } }] });
  await router.push("/quests/q1");
  const wrapper = mount(QuestDrawer, {
    props: { questId: "q1", mode },
    slots: { quest: "<p>quest panel</p>", beat: "<p>beat panel</p>", route: "<p>route panel</p>" },
    global: { plugins: [router] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("QuestSheet", () => {
  it("peeks with nothing selected, and Run goes to the party's beat", async () => {
    const { wrapper, router } = await mountDrawer("quest");
    const sheet = wrapper.get('[aria-label="Quest sheet"]');
    expect(sheet.attributes("data-level")).toBe("peek");
    expect(sheet.text()).toContain("1 of 3 objectives · The pack returns 2/6");
    await sheet.findAll("button").find((b) => b.text() === "Run")!.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.open).toBe("party");
  });

  it("is half height with a beat selected, showing that panel", async () => {
    const { wrapper } = await mountDrawer("beat");
    expect(wrapper.get('[aria-label="Quest sheet"]').attributes("data-level")).toBe("half");
    expect(wrapper.text()).toContain("beat panel");
  });

  it("collapsing a selection deselects instead of resizing", async () => {
    const { wrapper } = await mountDrawer("beat");
    await wrapper.get('button[aria-label="Collapse"]').trigger("click");
    expect(wrapper.emitted("deselect")).toHaveLength(1);
  });

  it("the handle raises the peek to the quest panel", async () => {
    const { wrapper } = await mountDrawer("quest");
    await wrapper.get('button[aria-label="Expand"]').trigger("click");
    expect(wrapper.get('[aria-label="Quest sheet"]').attributes("data-level")).toBe("full");
    expect(wrapper.text()).toContain("quest panel");
  });

  it("does not render from md up", async () => {
    const { wrapper } = await mountDrawer("quest", false);
    expect(wrapper.find('[aria-label="Quest sheet"]').exists()).toBe(false);
  });
});
