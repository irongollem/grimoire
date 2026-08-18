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
vi.mock("@/composables/useQuests", () => ({
  useQuest: () => ({
    data: ref({ id: "quest-1", title: "The Unseen", status: "active", player_visible_to: [] }),
    isLoading: ref(false),
  }),
}));

let ui: ReturnType<typeof useUiStore>;

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
    ui.dmMode = "prep";
    mocks.replace.mockReset();
  });

  // Preparing a quest starts from its premise; running one starts from where the
  // party is standing. The overview is a peer of the working surface, not an
  // overlay above it, so exactly one of them is mounted.
  it("opens Prep on the overview and Play on the session", async () => {
    const wrapper = mountView();
    expect(wrapper.findComponent(QuestOverviewPanel).exists()).toBe(true);
    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(false);

    ui.dmMode = "play";
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(true);
    expect(wrapper.findComponent(QuestOverviewPanel).exists()).toBe(false);
  });

  it("switches surfaces through the view query, per mode", async () => {
    mocks.route.query = { view: "work" };
    const prep = mountView();
    expect(prep.findComponent(QuestGraphDesigner).exists()).toBe(true);

    ui.dmMode = "play";
    await prep.vm.$nextTick();
    expect(prep.findComponent(QuestRunCockpit).exists()).toBe(true);

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

  it("normalizes a legacy run URL into the global mode", () => {
    mocks.route.query = { mode: "run", beat: "beat-1" };
    mountView();

    expect(ui.dmMode).toBe("play");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1" } });
  });

  // `?overview=true` and `?mode=details` are what the drawer left behind, in
  // bookmarks, attachment adapters and return-to paths. They still land here.
  it("carries legacy Details, edit and overview links onto the overview surface", async () => {
    mocks.route.query = { mode: "details" };
    const details = mountView();
    await details.vm.$nextTick();
    expect(details.findComponent(QuestOverviewPanel).exists()).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith({ query: { view: "overview" } });

    mocks.replace.mockReset();
    mocks.route.query = { edit: "true", beat: "beat-1" };
    const editing = mountView();
    await editing.vm.$nextTick();
    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1", view: "overview" } });

    mocks.route.query = { overview: "true" };
    ui.dmMode = "play";
    const bookmarked = mountView();
    expect(bookmarked.findComponent(QuestOverviewPanel).exists()).toBe(true);
    expect(bookmarked.findComponent(QuestRunCockpit).exists()).toBe(false);
  });
});
