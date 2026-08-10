import { reactive, ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import QuestDetailView from "./QuestDetailView.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewDrawer from "@/components/quests/QuestOverviewDrawer.vue";
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

  it("normalizes legacy Details into an overview over the active surface", async () => {
    mocks.route.query = { mode: "details" };
    const wrapper = mountView();

    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(true);
    expect(wrapper.findComponent(QuestOverviewDrawer).exists()).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith({ query: { overview: "true" } });
  });

  it("keeps the overview open above the surface when Prep/Play changes", async () => {
    mocks.route.query = { overview: "true" };
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestGraphDesigner).exists()).toBe(true);
    expect(wrapper.findComponent(QuestOverviewDrawer).exists()).toBe(true);

    ui.dmMode = "play";
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(true);
    expect(wrapper.findComponent(QuestOverviewDrawer).exists()).toBe(true);
  });

  it("closes the overview without changing the active quest mode", async () => {
    mocks.route.query = { overview: "true", beat: "beat-1" };
    const wrapper = mountView();

    wrapper.findComponent(QuestOverviewDrawer).vm.$emit("close");
    await wrapper.vm.$nextTick();

    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1" } });
    expect(ui.dmMode).toBe("prep");
  });
});
