import { reactive, ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestDetailView from "./QuestDetailView.vue";
import QuestGraphDesigner from "@/components/quests/flow/QuestGraphDesigner.vue";
import QuestFlowStarter from "@/components/quests/flow/QuestFlowStarter.vue";
import QuestPhoneTopBar from "@/components/quests/overview/QuestPhoneTopBar.vue";

const mocks = vi.hoisted(() => ({
  route: { name: "quest-detail", params: { id: "quest-1" }, query: {} as Record<string, string> },
}));

vi.mock("vue-router", () => ({ useRoute: () => reactive(mocks.route) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuest: () => ({
    data: ref({ id: "quest-1", title: "The Unseen", status: "active", player_visible_to: [] }),
    isLoading: ref(false),
  }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: ref([{ id: "beat-1", title: "The Gate" }]) }),
}));

// One screen (#1183): no tabs, so no query decides which surface exists.
describe("QuestDetailView", () => {
  const mountView = () => shallowMount(QuestDetailView, {
    global: { stubs: { PageHeader: { template: "<div><slot /></div>" } } },
  });

  beforeEach(() => {
    mocks.route.name = "quest-detail";
    mocks.route.params = { id: "quest-1" };
    mocks.route.query = {};
  });

  it("always renders the story flow, with no tab control, whatever a stale ?view= says", () => {
    mocks.route.query = { view: "run" };
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "SegmentedControl" }).exists()).toBe(false);
  });

  it("renders the starter, not the flow, for a quest with no row yet", () => {
    mocks.route.name = "quest-new";
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestFlowStarter).exists()).toBe(true);
    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(false);
  });

  it("names the opened beat in the phone bar, and only the lane otherwise", () => {
    expect(mountView().findComponent(QuestPhoneTopBar).props("subtitle")).toBe("Active");

    mocks.route.query = { beat: "beat-1", open: "1" };
    expect(mountView().findComponent(QuestPhoneTopBar).props("subtitle")).toBe("Active · The Gate");

    mocks.route.query = { beat: "beat-1" };
    expect(mountView().findComponent(QuestPhoneTopBar).props("subtitle")).toBe("Active");
  });
});
