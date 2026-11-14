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
    slots: { column: `<p>${mode} column</p>`, wide: `<p>${mode} wide</p>` },
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
    expect(wrapper.text()).toContain("beat column");
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
    expect(wrapper.text()).toContain("quest column");
  });

  // Fails if the phone has no way to the wide part, or shows it over the sheet.
  it("Open wide swaps the sheet for a page with the column and the wide part, and Back to the flow returns", async () => {
    const { wrapper } = await mountDrawer("beat");
    await wrapper.findAll("button").find((b) => b.text() === "Open wide")!.trigger("click");
    expect(wrapper.find('[aria-label="Quest sheet"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("beat column");
    expect(wrapper.text()).toContain("beat wide");
    await wrapper.findAll("button").find((b) => b.text() === "Back to the flow")!.trigger("click");
    expect(wrapper.find('[aria-label="Quest sheet"]').exists()).toBe(true);
  });

  it("a route has no wide part to open on the phone", async () => {
    const { wrapper } = await mountDrawer("route");
    expect(wrapper.findAll("button").some((b) => b.text() === "Open wide")).toBe(false);
  });

  it("does not render from md up", async () => {
    const { wrapper } = await mountDrawer("quest", false);
    expect(wrapper.find('[aria-label="Quest sheet"]').exists()).toBe(false);
  });
});
