import { reactive } from "vue";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import DashboardView from "./DashboardView.vue";
import PrepGapsWidget from "@/components/dashboard/widgets/PrepGapsWidget.vue";
import SessionWidget from "@/components/dashboard/widgets/SessionWidget.vue";
import NextSessionWidget from "@/components/dashboard/widgets/NextSessionWidget.vue";
import LiveEncounterBanner from "@/components/dashboard/widgets/LiveEncounterBanner.vue";
import { useUiStore } from "@/stores/ui";

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  replace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));

let ui: ReturnType<typeof useUiStore>;

const mountView = () =>
  shallowMount(DashboardView, {
    global: { stubs: { PageHeader: { template: "<div><slot name='actions' /><slot /></div>" } } },
  });

describe("DashboardView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    ui = useUiStore();
    mocks.route.query = {};
    mocks.replace.mockReset();
  });

  // The composition follows the session, which is what finally makes starting
  // one visibly change the page instead of only the chrome — #758's first and
  // worst finding was that on a laptop it changed nothing you could see.
  it("shows what still needs preparing when no session is running", () => {
    const wrapper = mountView();
    expect(wrapper.findComponent(PrepGapsWidget).exists()).toBe(true);
    expect(wrapper.findComponent(NextSessionWidget).exists()).toBe(true);
    expect(wrapper.findComponent(LiveEncounterBanner).exists()).toBe(false);
  });

  it("shows what is in front of you once a session starts", async () => {
    ui.sessionRunning = true;
    const wrapper = mountView();
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(SessionWidget).exists()).toBe(true);
    expect(wrapper.findComponent(LiveEncounterBanner).exists()).toBe(true);
    expect(wrapper.findComponent(PrepGapsWidget).exists()).toBe(false);
  });

  // A DM mid-session must be able to check the gaps without ending the table.
  it("lets the query override the session", () => {
    ui.sessionRunning = true;
    mocks.route.query = { view: "prep" };
    expect(mountView().findComponent(PrepGapsWidget).exists()).toBe(true);

    ui.sessionRunning = false;
    mocks.route.query = { view: "session" };
    expect(mountView().findComponent(SessionWidget).exists()).toBe(true);
  });

  it("pins the override in the query, keeping the rest of it", () => {
    mocks.route.query = { foo: "bar" };
    const wrapper = mountView();
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "session");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { foo: "bar", view: "session" } });
  });

  // Choosing the side the session would have picked anyway clears the override
  // rather than pinning it — otherwise a DM who toggled back and forth once
  // would stay frozen on that side for the rest of the evening.
  it("clears the override when it agrees with the session", () => {
    ui.sessionRunning = true;
    mocks.route.query = { view: "prep", foo: "bar" };
    const wrapper = mountView();
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "session");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { foo: "bar" } });
  });
});
