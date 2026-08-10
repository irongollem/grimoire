import { reactive, ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import QuestDetailView from "./QuestDetailView.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
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

  it("uses the global Prep/Play mode as the primary quest surface", async () => {
    const wrapper = mountView();
    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(true);

    ui.dmMode = "play";
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(true);
  });

  it("normalizes a legacy run URL into the global mode", () => {
    mocks.route.query = { mode: "run", beat: "beat-1" };
    mountView();

    expect(ui.dmMode).toBe("play");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1" } });
  });

  it("leaves Details when the global mode changes", async () => {
    mocks.route.query = { mode: "details" };
    const wrapper = mountView();

    ui.dmMode = "play";
    await wrapper.vm.$nextTick();

    expect(mocks.replace).toHaveBeenCalledWith({ query: {} });
  });
});
