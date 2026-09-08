import { reactive, ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import QuestDetailView from "./QuestDetailView.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewPanel from "@/components/quests/QuestOverviewPanel.vue";
import { useUiStore } from "@/stores/ui";

const mocks = vi.hoisted(() => ({
  route: {
    name: "quest-detail",
    params: { id: "quest-1" },
    query: {} as Record<string, string>,
  },
  replace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuest: () => ({
    data: ref({ id: "quest-1", title: "The Unseen", status: "active", player_visible_to: [] }),
    isLoading: ref(false),
  }),
}));

let ui: ReturnType<typeof useUiStore>;

// The quest is a full page with three permanent tabs, never a modal over the
// log — "i utterly dont like the quest in a modal. its too much data and
// inconsistent" / "perhaps we just need 3 menus always instead of 1 swapping
// around based on that state" (epic #850). There is no more state deciding
// which of Overview, Story flow and Run exists; only `?view=` and a running
// session decide which one is *current*.
describe("QuestDetailView", () => {
  const mountView = () => shallowMount(QuestDetailView, {
    global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    ui = useUiStore();
    mocks.route.name = "quest-detail";
    mocks.route.params = { id: "quest-1" };
    mocks.route.query = {};
    ui.sessionRunning = false;
    mocks.replace.mockReset();
  });

  it("always renders all three tabs, whatever the session state", () => {
    const options = [
      { value: "overview", label: "Overview" },
      { value: "work", label: "Story flow" },
      { value: "run", label: "Run" },
    ];

    const prep = mountView();
    expect(prep.findComponent({ name: "SegmentedControl" }).props("options")).toEqual(options);

    ui.sessionRunning = true;
    const playing = mountView();
    expect(playing.findComponent({ name: "SegmentedControl" }).props("options")).toEqual(options);
  });

  it("defaults to the overview when nothing else is running", () => {
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestOverviewPanel).exists()).toBe(true);
    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(false);
    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(false);
  });

  it("defaults to the run cockpit while a session is running", () => {
    ui.sessionRunning = true;
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(true);
    expect(wrapper.findComponent(QuestOverviewPanel).exists()).toBe(false);
  });

  it("switches surfaces through the view query", () => {
    mocks.route.query = { view: "work" };
    const work = mountView();
    expect(work.findComponent(QuestGraphDesigner).exists()).toBe(true);

    mocks.route.query = { view: "run" };
    const runSurface = mountView();
    expect(runSurface.findComponent(QuestRunCockpit).exists()).toBe(true);

    mocks.route.query = { view: "overview" };
    const overview = mountView();
    expect(overview.findComponent(QuestOverviewPanel).exists()).toBe(true);
  });

  it("records the chosen surface without disturbing the rest of the query", async () => {
    mocks.route.query = { beat: "beat-1" };
    const wrapper = mountView();

    // Looked up by name rather than by component: `SegmentedControl` is a
    // generic component, and `findComponent(Component)` cannot type one.
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "work");
    await wrapper.vm.$nextTick();

    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1", view: "work" } });
  });

  // `?mode=`, `?overview=` and `?edit=true` are what the retired modal/drawer
  // left behind, in bookmarks and attachment return-to paths. Nothing reads
  // them as an alias any more — every generator writes `?view=` directly — so
  // the only obligation left is to not carry them forward on a fresh switch.
  it("strips retired query keys from a stale bookmark when switching tabs", async () => {
    mocks.route.query = { mode: "details", overview: "true", edit: "true", beat: "beat-1" };
    const wrapper = mountView();

    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "run");
    await wrapper.vm.$nextTick();

    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1", view: "run" } });
  });
});
