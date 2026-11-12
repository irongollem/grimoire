import { mount, type VueWrapper } from "@vue/test-utils";
import { computed, reactive, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundboardPadWithTakes, SoundboardPage } from "@/types/sound.types";
import type { DeckPadInfo } from "@/composables/soundboard/useDeck";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import SoundboardView from "./SoundboardView.vue";

const PAD = "application/x-grimoire-pad";
const SOUND = "application/x-grimoire-sound";
const PLAYLIST = "application/x-grimoire-playlist";

function page(id: string, sort: number): SoundboardPage {
  return { id, campaign_id: "c1", user_id: "u1", name: id, sort_order: sort, lanes: [], created_at: "", updated_at: "" };
}
function pad(id: string, pageId: string, lane: number, row: number, over: Partial<SoundboardPadWithTakes> = {}): SoundboardPadWithTakes {
  return {
    id, campaign_id: "c1", user_id: "u1", page_id: pageId, lane, grid_row: row, playlist_id: null, name: null,
    launch_mode: null, loop: null, volume: 0.7, fade_in_ms: null, fade_out_ms: null, vary: false, velocity: false,
    repeat_ms: 500, created_at: "", updated_at: "", takes: [], ...over,
  };
}

const pages = ref<SoundboardPage[]>([]);
const pagesReady = ref(true);
const padRows = ref<SoundboardPadWithTakes[]>([]);
const kinds = ref<Record<string, "sound" | "scene" | "playlist">>({});
const dmMode = reactive({ dmMode: "prep" as "prep" | "play" });
const route = reactive<{ query: Record<string, string> }>({ query: {} });
const createPad = vi.fn();
const movePad = vi.fn();
const addTake = vi.fn();
const createPage = vi.fn();
const toastError = vi.fn();
const replace = vi.fn();

vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ replace }) }));
// Wide (lg and up) by default; a test sets it false for the phone and tablet sheets.
const screen = vi.hoisted(() => ({ wide: true }));
vi.mock("@/composables/useBreakpoint", () => ({ useAbove: () => ref(screen.wide), useBelow: () => ref(!screen.wide) }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: toastError, fromError: (_e: unknown, f: string) => f }) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: ref([{ id: "s1" }]), isPending: ref(false) }) }));
vi.mock("@/composables/soundboard/useSoundboardPages", () => ({
  useSoundboardPages: () => ({ data: pages, isSuccess: pagesReady }),
  useCreateSoundboardPage: () => ({ mutate: createPage }),
}));
vi.mock("@/composables/soundboard/useDeckPads", () => ({
  useDeckPads: () => ({ data: padRows, isPending: ref(false) }),
  useCreatePad: () => ({ mutate: createPad }),
  useMovePad: () => ({ mutate: movePad }),
  useAddTake: () => ({ mutate: addTake }),
}));
vi.mock("@/composables/soundboard/useDeck", async () => {
  const { useSoundboardUiStore: useUi } = await import("@/stores/ui/soundboard");
  return {
    useDeck: () => {
      const ui = useUi();
      const activePageId = computed(() => ui.soundboardActivePage ?? pages.value[0]?.id ?? null);
      return {
        snapshot: computed(() => ({
          pages: [], pageIndex: 0, lanes: [], rows: 1, cells: [], tool: "play", lockedTool: "play",
          hush: false, paused: false, audibleCount: 0, masterVolume: 1,
        })),
        dispatch: vi.fn(),
        editRequest: ref(null),
        clearEditRequest: vi.fn(),
        pagePads: computed<DeckPadInfo[]>(() =>
          padRows.value
            .filter((p) => p.page_id === activePageId.value)
            .map((p) => ({ pad: p, kind: kinds.value[p.id] ?? "sound", category: "effects", playlist: null, sounds: [] })),
        ),
        activePageId,
      };
    },
  };
});
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => dmMode }));
vi.mock("@/stores/spotify", () => ({ useSpotifyStore: () => ({ isEnabled: false, initSDK: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: true }) }));
vi.mock("@/stores/campaign", async () => {
  const { defineStore } = await import("pinia");
  return { useCampaignStore: defineStore("campaign-test", () => ({ activeCampaignId: ref<string | null>("c1") })) };
});

const STUB_NAMES = [
  "ManualHelpLink", "AppButton", "BrandIcon", "SkeletonBlock", "EmptyState", "StarterScenesCard", "AudioFormatNotice",
  "SpotifyErrorBanner", "DeckNowChips", "DeckGrid", "BuilderPlayDeck", "BuilderMixerDrawer", "MobileSheet",
  "SegmentedControl", "SoundboardPageTabs", "SoundboardPagePicker", "DeckLibraryPanel", "PadSettingsPanel", "LaneEditor",
];

// Every mount watches the same module-level refs, so one left alive would answer the next test's changes.
const mounted: VueWrapper[] = [];
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

function mountView(extraStubs: Record<string, unknown> = {}) {
  const wrapper = mount(SoundboardView, {
    global: {
      stubs: {
        ...Object.fromEntries(STUB_NAMES.map((n) => [n, true])),
        ListPageLayout: { template: '<div><slot name="actions" /><slot /></div>' },
        ...extraStubs,
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

const grid = (w: VueWrapper) => w.findComponent({ name: "DeckGrid" });
const drop = (w: VueWrapper, lane: number, row: number, data: Record<string, string>) =>
  grid(w).vm.$emit("drop", { lane, row, event: { dataTransfer: { getData: (t: string) => data[t] ?? "" } } });

beforeEach(() => {
  setActivePinia(createPinia());
  pages.value = [page("pg-a", 0), page("pg-b", 1)];
  pagesReady.value = true;
  padRows.value = [
    pad("sound-pad", "pg-a", 0, 0, { takes: [{ id: "t1", pad_id: "sound-pad", sound_id: "s-have", position: 0, created_at: "", updated_at: "" }] }),
    pad("scene-pad", "pg-a", 1, 0, { playlist_id: "pl-scene" }),
    pad("b-pad", "pg-b", 2, 0),
  ];
  kinds.value = { "scene-pad": "scene" };
  dmMode.dmMode = "prep";
  route.query = {};
  screen.wide = true;
  for (const m of [createPad, movePad, addTake, createPage, toastError, replace]) m.mockReset();
});

describe("dropping on a slot", () => {
  it("creates a sound pad with that take when the slot is empty", () => {
    const w = mountView();
    drop(w, 3, 0, { [SOUND]: "s-new" });
    expect(createPad).toHaveBeenCalledOnce();
    expect(createPad.mock.calls[0]?.[0]).toEqual({ pad: { page_id: "pg-a", lane: 3, grid_row: 0 }, soundIds: ["s-new"] });
  });

  it("adds a take, not a new pad, when the slot holds a sound pad", () => {
    const w = mountView();
    drop(w, 0, 0, { [SOUND]: "s-new" });
    expect(addTake.mock.calls[0]?.[0]).toEqual({ padId: "sound-pad", soundId: "s-new" });
    expect(createPad).not.toHaveBeenCalled();
  });

  it("ignores a sound that is already a take of that pad", () => {
    const w = mountView();
    drop(w, 0, 0, { [SOUND]: "s-have" });
    expect(addTake).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("refuses a sound dropped on a scene pad and writes nothing", () => {
    const w = mountView();
    drop(w, 1, 0, { [SOUND]: "s-new" });
    expect(toastError).toHaveBeenCalledWith("That slot holds a scene; drop on an empty slot");
    expect(createPad).not.toHaveBeenCalled();
    expect(addTake).not.toHaveBeenCalled();
  });

  it("creates a playlist pad on an empty slot and refuses an occupied one", () => {
    const w = mountView();
    drop(w, 4, 0, { [PLAYLIST]: "pl-1" });
    expect(createPad.mock.calls[0]?.[0]).toEqual({ pad: { page_id: "pg-a", lane: 4, grid_row: 0, playlist_id: "pl-1" } });
    createPad.mockReset();
    drop(w, 0, 0, { [PLAYLIST]: "pl-1" });
    expect(createPad).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("moves a dropped pad onto the slot (the RPC swaps), and ignores a drop on its own slot", () => {
    const w = mountView();
    drop(w, 5, 2, { [PAD]: "sound-pad" });
    expect(movePad.mock.calls[0]?.[0]).toEqual({ padId: "sound-pad", pageId: "pg-a", lane: 5, row: 2 });
    movePad.mockReset();
    drop(w, 0, 0, { [PAD]: "sound-pad" });
    expect(movePad).not.toHaveBeenCalled();
  });
});

describe("dropping a pad on a page tab", () => {
  it("lands in the first free row of the pad's own lane on that page", () => {
    padRows.value = [...padRows.value, pad("b-0", "pg-b", 1, 0), pad("b-1", "pg-b", 1, 1)];
    const w = mountView();
    w.findComponent({ name: "SoundboardPageTabs" }).vm.$emit("padDrop", { pageId: "pg-b", padId: "scene-pad" });
    expect(movePad.mock.calls[0]?.[0]).toEqual({ padId: "scene-pad", pageId: "pg-b", lane: 1, row: 2 });
  });

  it("does nothing for a pad dropped on its own page", () => {
    const w = mountView();
    w.findComponent({ name: "SoundboardPageTabs" }).vm.$emit("padDrop", { pageId: "pg-a", padId: "sound-pad" });
    expect(movePad).not.toHaveBeenCalled();
  });
});

describe("click to place", () => {
  it("offers placing only while an empty slot is selected, and places there", async () => {
    const w = mountView();
    const library = () => w.findComponent({ name: "DeckLibraryPanel" });
    expect(library().props("canPlace")).toBe(false);

    grid(w).vm.$emit("select", { lane: 6, row: 1, padId: null });
    await w.vm.$nextTick();
    expect(library().props("canPlace")).toBe(true);

    library().vm.$emit("place", { kind: "sound", id: "s-new" });
    expect(createPad.mock.calls[0]?.[0]).toEqual({ pad: { page_id: "pg-a", lane: 6, grid_row: 1 }, soundIds: ["s-new"] });
  });

  it("places nothing when no slot is selected", () => {
    const w = mountView();
    w.findComponent({ name: "DeckLibraryPanel" }).vm.$emit("place", { kind: "sound", id: "s-new" });
    expect(createPad).not.toHaveBeenCalled();
  });
});

describe("the side panel", () => {
  const sideSwitch = (w: VueWrapper) =>
    w.findAllComponents({ name: "SegmentedControl" }).find((c) => c.attributes("aria-label") === "Side panel");

  it("shows the library until a pad is picked, then that pad's settings in the same place", async () => {
    // Library and settings were two columns, and the library stepped aside below 2xl, so the page jumped on every pick.
    const w = mountView();
    expect(w.findComponent({ name: "DeckLibraryPanel" }).exists()).toBe(true);
    expect(w.findComponent({ name: "PadSettingsPanel" }).exists()).toBe(false);
    grid(w).vm.$emit("select", { lane: 0, row: 0, padId: "sound-pad" });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "PadSettingsPanel" }).props("padId")).toBe("sound-pad");
    expect(w.findComponent({ name: "DeckLibraryPanel" }).exists()).toBe(false);
    expect(sideSwitch(w)?.props("modelValue")).toBe("pad");
  });

  it("flips back to the library with the pad still picked, so another take can be dragged onto it", async () => {
    const w = mountView();
    grid(w).vm.$emit("select", { lane: 0, row: 0, padId: "sound-pad" });
    await w.vm.$nextTick();
    sideSwitch(w)?.vm.$emit("update:modelValue", "library");
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "DeckLibraryPanel" }).exists()).toBe(true);
    expect(grid(w).props("selectedPadId")).toBe("sound-pad");
  });

  it("goes back to the library when an empty slot is picked after a pad", async () => {
    const w = mountView();
    grid(w).vm.$emit("select", { lane: 0, row: 0, padId: "sound-pad" });
    await w.vm.$nextTick();
    grid(w).vm.$emit("select", { lane: 6, row: 1, padId: null });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "DeckLibraryPanel" }).props("canPlace")).toBe(true);
  });

  it("Done on the settings hands the panel back to the library, and the switch says so", async () => {
    // Otherwise the switch stays on a Pad option that has just been disabled.
    const w = mountView();
    grid(w).vm.$emit("select", { lane: 0, row: 0, padId: "sound-pad" });
    await w.vm.$nextTick();
    w.findComponent({ name: "PadSettingsPanel" }).vm.$emit("close");
    await w.vm.$nextTick();
    expect(sideSwitch(w)?.props("modelValue")).toBe("library");
    expect(w.findComponent({ name: "DeckLibraryPanel" }).exists()).toBe(true);
  });

  it("cannot switch to Pad with no pad picked", () => {
    const w = mountView();
    const control = sideSwitch(w);
    if (control === undefined) throw new Error("no side panel switch");
    const pad = (control.props("options") as Array<{ value: string; disabled?: boolean }>).find((o) => o.value === "pad");
    expect(pad?.disabled).toBe(true);
  });
});

describe("tap to place on a phone", () => {
  // A sheet that draws its contents, so the library inside it can be reached.
  const MobileSheet = { name: "MobileSheet", props: ["open", "title", "showUntil"], template: "<div><slot /></div>" };
  const librarySheet = (w: VueWrapper) =>
    w.findAllComponents({ name: "MobileSheet" }).find((sheet) => sheet.props("title") === "Library");

  it("opens the library on an empty slot tapped, and a row tapped there fills that slot", async () => {
    // Drag and drop is the only other way onto a slot, and a phone has no drag.
    screen.wide = false;
    const w = mountView({ MobileSheet });
    expect(librarySheet(w)?.props("open")).toBe(false);
    grid(w).vm.$emit("select", { lane: 3, row: 1, padId: null });
    await w.vm.$nextTick();
    expect(librarySheet(w)?.props("open")).toBe(true);
    librarySheet(w)?.findComponent({ name: "DeckLibraryPanel" }).vm.$emit("place", { kind: "sound", id: "s-new" });
    expect(createPad.mock.calls[0]?.[0]).toEqual({ pad: { page_id: "pg-a", lane: 3, grid_row: 1 }, soundIds: ["s-new"] });
  });

  it("does not open the library for a pad tapped: that opens its settings", async () => {
    screen.wide = false;
    const w = mountView({ MobileSheet });
    grid(w).vm.$emit("select", { lane: 0, row: 0, padId: "sound-pad" });
    await w.vm.$nextTick();
    expect(librarySheet(w)?.props("open")).toBe(false);
  });
});

describe("?pad=", () => {
  it("selects that pad and switches to its page", async () => {
    route.query = { pad: "b-pad" };
    const w = mountView();
    await w.vm.$nextTick();
    expect(useSoundboardUiStore().soundboardActivePage).toBe("pg-b");
    expect(w.findComponent({ name: "PadSettingsPanel" }).props("padId")).toBe("b-pad");
  });

  it("keeps the URL in sync with a selection made on the grid, without pushing history", async () => {
    const w = mountView();
    grid(w).vm.$emit("select", { lane: 0, row: 0, padId: "sound-pad" });
    await w.vm.$nextTick();
    expect(replace).toHaveBeenCalledWith({ query: { pad: "sound-pad" } });
  });
});

describe("build or play", () => {
  it("opens in Build when no session runs and Play when one does", () => {
    dmMode.dmMode = "prep";
    const modeSwitch = (w: VueWrapper) =>
      w.findAllComponents({ name: "SegmentedControl" }).find((c) => c.attributes("aria-label") === "Build or play");
    expect(modeSwitch(mountView())?.props("modelValue")).toBe("build");
    dmMode.dmMode = "play";
    const w = mountView();
    expect(modeSwitch(w)?.props("modelValue")).toBe("play");
    expect(w.findComponent({ name: "BuilderPlayDeck" }).exists()).toBe(true);
    expect(w.findComponent({ name: "DeckLibraryPanel" }).exists()).toBe(false);
  });
});

describe("a campaign with no pages", () => {
  it("gets exactly one Main page, however often the list re-reads", async () => {
    pages.value = [];
    const w = mountView();
    pages.value = [];
    await w.vm.$nextTick();
    pagesReady.value = false;
    pagesReady.value = true;
    await w.vm.$nextTick();
    expect(createPage).toHaveBeenCalledOnce();
    expect(createPage.mock.calls[0]?.[0]).toEqual({ name: "Main", sort_order: 0 });
  });

  it("creates nothing when pages exist", () => {
    mountView();
    expect(createPage).not.toHaveBeenCalled();
  });
});
