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
import { WIDGET_COMPONENTS } from "@/components/dashboard/widgetComponents";
import { DEFAULT_LAYOUTS } from "@/lib/dashboard/defaultLayouts";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import type { DashboardSurface } from "@/lib/dashboard/widgetCatalog";

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  replace: vi.fn(),
  widgetsFor: (_surface: string): DashboardLayoutEntry[] => [],
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));

// The view only knows the composable's contract, not how a layout is
// fetched or saved — so the mock reproduces the contract (widgets, driven by
// surface) rather than stubbing it out to nothing, which would let the view
// ignore the composable entirely without a single test noticing.
vi.mock("@/composables/useDashboardLayout", async () => {
  const { computed, toValue } = await import("vue");
  return {
    useDashboardLayout: (surface: unknown) => ({
      widgets: computed(() => mocks.widgetsFor(toValue(surface as never))),
    }),
  };
});

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
    mocks.widgetsFor = (surface) => DEFAULT_LAYOUTS[surface as DashboardSurface].widgets;
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

  // The view renders whatever DEFAULT_LAYOUTS says, in that order — this is
  // the registry doing the composing, not hand-written markup.
  it("renders each surface's default layout, in the registry's order", () => {
    const prepWrapper = mountView();
    const grid = prepWrapper.find(".grid");
    const renderedOrder = Array.from(grid.element.children);
    const expectedOrder = DEFAULT_LAYOUTS.prep.widgets.map(
      (entry) => prepWrapper.findComponent(WIDGET_COMPONENTS[entry.id]).element,
    );
    expect(renderedOrder).toEqual(expectedOrder);

    ui.sessionRunning = true;
    const sessionWrapper = mountView();
    expect(sessionWrapper.findComponent(WIDGET_COMPONENTS["live-encounter"]).exists()).toBe(true);
    expect(sessionWrapper.findComponent(WIDGET_COMPONENTS["recent-npcs"]).exists()).toBe(true);
  });

  // If the view read DEFAULT_LAYOUTS directly instead of the composable's
  // `widgets`, a DM's saved arrangement would never reach the screen — they
  // would rearrange the dashboard, save, and see the stock layout again on
  // every visit. This is the one behaviour the other five tests, which all
  // drive the mock with DEFAULT_LAYOUTS, would not catch.
  it("renders the DM's saved arrangement — reordered, with a widget removed and a width changed", () => {
    const saved: DashboardLayoutEntry[] = [
      { key: "quests", id: "quests", width: "wide" },
      { key: "prep-gaps", id: "prep-gaps", width: "cell" },
      { key: "stats", id: "stats", width: "full" },
    ];
    mocks.widgetsFor = () => saved;

    const wrapper = mountView();
    const grid = wrapper.find(".grid");
    const renderedOrder = Array.from(grid.element.children);
    const expectedOrder = saved.map(
      (entry) => wrapper.findComponent(WIDGET_COMPONENTS[entry.id]).element,
    );
    expect(renderedOrder).toEqual(expectedOrder);

    // "quests" is "cell" width in DEFAULT_LAYOUTS.prep; the saved arrangement
    // widened it to "wide".
    expect(wrapper.findComponent(WIDGET_COMPONENTS.quests).classes()).toContain("lg:col-span-2");
    // "next-session" is part of the default prep layout but absent from the
    // saved one — a removed widget must not sneak back in.
    expect(wrapper.findComponent(WIDGET_COMPONENTS["next-session"]).exists()).toBe(false);
  });
});
