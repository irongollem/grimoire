import { nextTick, reactive } from "vue";
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
import DashboardCustomizeFrame from "@/components/dashboard/DashboardCustomizeFrame.vue";
import DashboardShelf from "@/components/dashboard/DashboardShelf.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { DEFAULT_LAYOUTS } from "@/lib/dashboard/defaultLayouts";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import type { DashboardSurface } from "@/lib/dashboard/widgetCatalog";

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  replace: vi.fn(),
  widgetsFor: (_surface: string): DashboardLayoutEntry[] => [],
  newWidgetIds: [] as string[],
  saveLayout: vi.fn(),
  resetLayout: vi.fn(),
  toastInfo: vi.fn(),
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
      newWidgetIds: computed(() => mocks.newWidgetIds),
      // #768: the view binds packing off this, so a mock without it throws
      // before a single assertion runs.
      dense: computed(() => false),
      isCustomized: computed(() => false),
      isSaving: computed(() => false),
      saveLayout: mocks.saveLayout,
      resetLayout: mocks.resetLayout,
    }),
  };
});

// The undo toast is the reset's only safety net, so the test asserts the view
// hands one over — not that the toast system works, which useToast covers.
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    info: mocks.toastInfo,
    error: vi.fn(),
    success: vi.fn(),
    fromError: (e: unknown) => String(e),
  }),
}));

let ui: ReturnType<typeof useUiStore>;

/** The Customize / Done toggle in the header's action slot. */
const customizeButton = (wrapper: ReturnType<typeof mountView>) =>
  wrapper.findAllComponents({ name: "AppButton" })[0];

const mountView = () =>
  shallowMount(DashboardView, {
    global: {
      stubs: {
        PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
        // shallowMount stubs VueDraggable too, and a stub renders no slot — so
        // without this the customize grid mounts zero widgets and every customize
        // test passes against an empty page.
        VueDraggable: { template: "<div><slot /></div>" },
      },
    },
  });

describe("DashboardView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    ui = useUiStore();
    mocks.route.query = {};
    mocks.replace.mockReset();
    mocks.widgetsFor = (surface) => DEFAULT_LAYOUTS[surface as DashboardSurface].widgets;
    mocks.saveLayout.mockReset();
    mocks.resetLayout.mockReset();
    mocks.toastInfo.mockReset();
    mocks.newWidgetIds = [];
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

  // #763's headline acceptance: enter arrange → move → exit → the new order is
  // what renders. If the draft did not survive leaving the mode, a DM would
  // watch their rearrangement snap back the moment they pressed Done.
  it("enters customize mode, moves a widget, and keeps the new order on exit", async () => {
    const wrapper = mountView();
    const frames = () => wrapper.findAllComponents(DashboardCustomizeFrame);
    expect(frames()).toHaveLength(0);

    await customizeButton(wrapper).trigger("click");
    expect(frames()).toHaveLength(DEFAULT_LAYOUTS.prep.widgets.length);

    const first = frames()[0];
    expect(first).toBeDefined();
    first?.vm.$emit("move", "prep-gaps", 1);
    await nextTick();

    const keys = frames().map((frame) => frame.props("entry").key);
    expect(keys.slice(0, 2)).toEqual(["quests", "prep-gaps"]);

    await customizeButton(wrapper).trigger("click");
    expect(frames()).toHaveLength(0);
    // Saved on the way out rather than lost with the pending debounce.
    expect(mocks.saveLayout).toHaveBeenCalled();
    const saved = mocks.saveLayout.mock.calls.at(-1)?.[0] as DashboardLayoutEntry[];
    expect(saved.map((entry) => entry.key).slice(0, 2)).toEqual(["quests", "prep-gaps"]);
  });

  // The aria-live region is the only feedback a screen-reader user gets, and
  // the wording comes from arrangeOps so the pointer and keyboard paths cannot
  // describe the same change differently.
  it("announces a move through the live region", async () => {
    const wrapper = mountView();
    await customizeButton(wrapper).trigger("click");
    wrapper.findAllComponents(DashboardCustomizeFrame)[0]?.vm.$emit("move", "prep-gaps", 1);
    await nextTick();
    expect(wrapper.find("[aria-live]").text()).toBe("Needs prep moved to position 2 of 7.");
  });

  // Removing takes the widget off the grid; nothing is deleted, so it has to
  // come back on the shelf or the DM cannot undo their own click.
  it("removes a widget to the shelf", async () => {
    const wrapper = mountView();
    await customizeButton(wrapper).trigger("click");
    wrapper.findAllComponents(DashboardCustomizeFrame)[0]?.vm.$emit("remove", "prep-gaps");
    await nextTick();

    const keys = wrapper.findAllComponents(DashboardCustomizeFrame).map((f) => f.props("entry").key);
    expect(keys).not.toContain("prep-gaps");
    const shelf = wrapper.findComponent(DashboardShelf);
    expect(shelf.props("entries").map((e: DashboardLayoutEntry) => e.key)).toEqual(keys);
  });

  // Reset is destructive and answers with an undo toast rather than a confirm
  // dialog — and the undo can only work from a snapshot the view took first,
  // because resetLayout deletes the row outright.
  it("resets with an undo that restores the previous arrangement", async () => {
    const wrapper = mountView();
    await customizeButton(wrapper).trigger("click");
    wrapper.findAllComponents(DashboardCustomizeFrame)[0]?.vm.$emit("remove", "prep-gaps");
    await nextTick();

    wrapper.findComponent(DashboardShelf).vm.$emit("reset");
    await nextTick();
    expect(mocks.resetLayout).toHaveBeenCalled();

    // The grid must visibly return to the defaults straight away. Re-seeding it
    // from `widgets` instead read the layout being reset away from, because the
    // optimistic cache write lands a microtask later — the grid did not change
    // at all until a live check caught it.
    const afterReset = wrapper
      .findAllComponents(DashboardCustomizeFrame)
      .map((frame) => frame.props("entry").key);
    expect(afterReset).toEqual(DEFAULT_LAYOUTS.prep.widgets.map((entry) => entry.key));

    const [, , options] = mocks.toastInfo.mock.calls.at(-1) ?? [];
    const action = (options as { action?: { label: string; run: () => void } } | undefined)?.action;
    expect(action?.label).toBe("Undo");

    action?.run();
    await nextTick();
    const restored = mocks.saveLayout.mock.calls.at(-1)?.[0] as DashboardLayoutEntry[];
    expect(restored.map((entry) => entry.key)).not.toContain("prep-gaps");
    expect(restored).toHaveLength(DEFAULT_LAYOUTS.prep.widgets.length - 1);
  });

  // A widget the surface's defaults leave off never reaches the board on its
  // own, so without this dot it waits inside a mode the DM had no reason to
  // open — and #762's promise that a new widget is discoverable goes unmet.
  it("marks the Customize button when the picker holds an unseen widget", async () => {
    expect(mountView().findComponent(EntityNewDot).props("isNew")).toBe(false);

    mocks.newWidgetIds = ["session"];
    const wrapper = mountView();
    expect(wrapper.findComponent(EntityNewDot).props("isNew")).toBe(true);

    // Inside the mode the options carry their own "New" badges, so a dot on
    // the Done button would be pointing at nothing.
    await customizeButton(wrapper).trigger("click");
    expect(wrapper.findComponent(EntityNewDot).props("isNew")).toBe(false);
  });
});
