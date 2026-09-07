import { reactive, ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import QuestDetailView from "./QuestDetailView.vue";
import QuestDetailModal from "@/components/quests/QuestDetailModal.vue";
import QuestGraphDesigner from "@/components/quests/QuestGraphDesigner.vue";
import QuestRunCockpit from "@/components/quests/QuestRunCockpit.vue";
import QuestOverviewPanel from "@/components/quests/QuestOverviewPanel.vue";
import { useUiStore } from "@/stores/ui";

const mocks = vi.hoisted(() => ({
  route: {
    name: "quest-detail",
    params: { id: "quest-1" },
    query: {} as Record<string, string>,
    // Two matched records — `/quests` and its `:id` child — mirrors real
    // navigation now that the detail route nests under the list (#844).
    matched: [{}, {}] as unknown[],
  },
  replace: vi.fn(),
  // A plain box, not a `ref`: each mount reads it once via `useDetailModal`,
  // so nothing here needs to be reactive within a single mounted instance —
  // only across the separate `mountView()` calls a test makes.
  narrow: { value: false },
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));
// Partial mock, not a full replacement: `useUiStore` (constructed for real
// below, via pinia) reaches into `@vueuse/core` for `useLocalStorage` too, and
// a full replacement here would take that down with it.
vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useMediaQuery: () => mocks.narrow,
}));
vi.mock("@/composables/quests/useQuests", () => ({
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
    mocks.route.matched = [{}, {}];
    mocks.narrow.value = false;
    ui.sessionRunning = false;
    mocks.replace.mockReset();
  });

  // The overview is a glance, so on tablet and up it is `useDetailModal`'s
  // popover over the quest log — the same treatment an NPC sheet gets nested
  // under its grid (#844). The cockpit is a live session, never a popover, so
  // it takes the whole screen regardless of how the surface was reached.
  it("opens Prep as a modal over the log, and Play across the whole screen", async () => {
    const wrapper = mountView();
    expect(wrapper.findComponent(QuestDetailModal).exists()).toBe(true);
    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(false);

    ui.sessionRunning = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(true);
    expect(wrapper.findComponent(QuestDetailModal).exists()).toBe(false);
  });

  it("switches surfaces through the view query, per mode", async () => {
    mocks.route.query = { view: "work" };
    const prep = mountView();
    expect(prep.findComponent(QuestGraphDesigner).exists()).toBe(true);

    ui.sessionRunning = true;
    await prep.vm.$nextTick();
    expect(prep.findComponent(QuestRunCockpit).exists()).toBe(true);

    mocks.route.query = { view: "overview" };
    const overview = mountView();
    // Overview is the glance, so it renders as the modal rather than as an
    // inline panel — the working surfaces above never do, which is the point.
    expect(overview.findComponent(QuestDetailModal).exists()).toBe(true);
  });

  // The toggle still matters on a phone, where there is no modal to retreat
  // into — both surfaces render full-screen there, and this control is how a
  // DM moves between them. Forcing narrow here isolates that path from the
  // desktop modal wiring the previous two cases already cover.
  it("records the chosen surface without disturbing the rest of the query", async () => {
    mocks.narrow.value = true;
    mocks.route.query = { beat: "beat-1" };
    const wrapper = mountView();

    // Looked up by name rather than by component: `SegmentedControl` is a
    // generic component, and `findComponent(Component)` cannot type one.
    wrapper.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "work");
    await wrapper.vm.$nextTick();

    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1", view: "work" } });
  });

  // `?mode=run` is live, not a leftover: QuestChainRow and QuestRunOpenChains
  // emit it on every "open this chain" link. It used to be honoured by writing
  // `dmMode = "play"`, so opening a chain from the dashboard silently started
  // broadcasting every NPC reveal to the players. See #758.
  it("opens the cockpit from a run link without starting a broadcast", () => {
    mocks.route.query = { mode: "run", beat: "beat-1" };
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestRunCockpit).exists()).toBe(true);
    expect(ui.sessionRunning).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  // `?mode=build` predates the story-flow rescope and nothing emits it now. It
  // used to land on the *overview*, because it wrote `dmMode = "prep"` and let
  // prep's default decide — so a link labelled Build never reached the builder.
  it("carries a legacy build link onto the working surface", () => {
    mocks.route.query = { mode: "build", beat: "beat-1" };
    mountView();

    expect(ui.sessionRunning).toBe(false);
    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "beat-1", view: "work" } });
  });

  // The fix this file exists for: switching the SegmentedControl on a
  // full-screen surface (Story flow / Run session) back to Overview must keep
  // the whole screen rather than dropping the DM onto the quest log with a
  // modal open over it — "no weird navigation to a screen with a modal open."
  it("keeps the whole screen when the segmented control switches away from a full-screen surface", () => {
    mocks.route.query = { view: "work" };
    const cockpit = mountView();

    cockpit.findComponent({ name: "SegmentedControl" }).vm.$emit("update:modelValue", "overview");
    expect(ui.questFullScreenId).toBe("quest-1");

    // Simulate the navigation `router.replace` (mocked, so a no-op) would have
    // landed: a fresh mount with the same quest id, now on `view=overview`.
    mocks.route.query = { view: "overview" };
    const overview = mountView();
    expect(overview.findComponent(QuestDetailModal).exists()).toBe(false);
    expect(overview.findComponent(QuestOverviewPanel).exists()).toBe(true);
  });

  // Opening a quest fresh from the list must be unaffected by the mechanism
  // above — the flag starts at `null`, so the overview is the ordinary modal.
  it("still opens fresh from the list as a modal on desktop", () => {
    const wrapper = mountView();

    expect(wrapper.findComponent(QuestDetailModal).exists()).toBe(true);
    expect(ui.questFullScreenId).toBe(null);
  });

  it("forgets the full-screen quest when the route moves to a different one", async () => {
    const wrapper = mountView();
    ui.questFullScreenId = "quest-1";

    // Mutating `mocks.route` directly would bypass the proxy the mounted
    // instance actually depends on and never notify it (`reactive()` caches
    // one proxy per target, so this is the same object `useRoute()` returned).
    reactive(mocks.route).params = { id: "quest-2" };
    await wrapper.vm.$nextTick();

    expect(ui.questFullScreenId).toBe(null);
  });

  // Leaving the quest by any route — not just to a sibling quest id — must
  // forget it too, or the next quest opened from the log would wrongly skip
  // its modal.
  it("forgets the full-screen quest on unmount", () => {
    const wrapper = mountView();
    ui.questFullScreenId = "quest-1";

    wrapper.unmount();

    expect(ui.questFullScreenId).toBe(null);
  });

  // `?overview=true` and `?mode=details` are what the drawer left behind, in
  // bookmarks, attachment adapters and return-to paths. They still land on the
  // overview surface. Narrow throughout: the point under test is the query
  // translation, which the desktop modal-wiring cases above already cover.
  it("carries legacy Details, edit and overview links onto the overview surface", async () => {
    mocks.narrow.value = true;
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
    ui.sessionRunning = true;
    const bookmarked = mountView();
    expect(bookmarked.findComponent(QuestOverviewPanel).exists()).toBe(true);
    expect(bookmarked.findComponent(QuestRunCockpit).exists()).toBe(false);
  });
});
