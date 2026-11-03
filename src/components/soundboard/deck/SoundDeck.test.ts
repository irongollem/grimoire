import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import type { DeckAction } from "@/lib/audio/deck/deckSurface";

const dispatch = vi.fn<(action: DeckAction) => void>();
const clearEditRequest = vi.fn();
const editRequest = ref<{ padId: string } | null>(null);
const midi = vi.fn();
let hotkeyTarget: { dispatch(action: DeckAction): void } | null = null;
let hotkeyEnabled: (() => boolean) | null = null;
const push = vi.fn();
const route = reactive<{ path: string; meta: Record<string, unknown> }>({ path: "/npcs", meta: {} });
const isBarNav = ref(false);

const ui = reactive({
  deckSize: "row" as "tucked" | "row" | "deck" | "full",
  settleDeckControls: vi.fn(),
  requestDeckPeek: vi.fn(),
});
const app = reactive({ editorFocus: false });
const sounds = ref<unknown[] | undefined>(undefined);
const pads = ref<unknown[] | undefined>([{}]);

vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => ({ dispatch, editRequest, clearEditRequest }) }));
vi.mock("@/composables/soundboard/useDeckHotkeys", () => ({
  useDeckHotkeys: (target: { dispatch(action: DeckAction): void }, options: { enabled: () => boolean }) => {
    hotkeyTarget = target;
    hotkeyEnabled = options.enabled;
  },
}));
vi.mock("@/composables/soundboard/useDeckMidiShared", () => ({ useDeckMidiShared: () => midi() }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));
vi.mock("@/composables/soundboard/useDeckPads", () => ({ useDeckPads: () => ({ data: pads }) }));
vi.mock("@/composables/useBreakpoint", () => ({ useIsBarNav: () => isBarNav }));
vi.mock("@/stores/ui/soundboard", () => ({ useSoundboardUiStore: () => ui }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => app }));
vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => ({ push }) }));

const { default: SoundDeck } = await import("./SoundDeck.vue");

function host() {
  return mount(SoundDeck, {
    global: { stubs: { DeckDock: { template: "<div data-testid='dock' />" }, DeckPhoneSheet: { template: "<div data-testid='phone' />" } } },
  });
}

function pressD(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "d", code: "KeyD", bubbles: true, cancelable: true }));
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "d", code: "KeyD", bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  route.path = "/npcs";
  route.meta = {};
  isBarNav.value = false;
  ui.deckSize = "row";
  app.editorFocus = false;
  sounds.value = undefined;
  pads.value = [{}];
  editRequest.value = null;
});

afterEach(() => (document.activeElement as HTMLElement | null)?.blur());

describe("SoundDeck host", () => {
  it("cycles tucked, row, deck, full and round with D (fails if the cycle skipped or stalled)", () => {
    const w = host();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      pressD();
      seen.push(ui.deckSize);
    }
    expect(seen).toEqual(["deck", "full", "tucked", "row"]);
    w.unmount();
  });

  it("draws no dock on /soundboard but keeps the keyboard and MIDI mounted there", () => {
    route.path = "/soundboard";
    const w = host();
    expect(w.find("[data-testid='dock']").exists()).toBe(false);
    expect(w.find("[data-testid='phone']").exists()).toBe(false);
    expect(hotkeyTarget).not.toBeNull();
    expect(midi).toHaveBeenCalledOnce();
    w.unmount();
  });

  it("does not let D resize a dock that is not on screen", () => {
    route.path = "/soundboard";
    const w = host();
    pressD();
    expect(ui.deckSize).toBe("row");
    w.unmount();
  });

  it("draws the dock on a desktop and the sheet on a phone, and neither while an editor owns the screen", async () => {
    const w = host();
    expect(w.find("[data-testid='dock']").exists()).toBe(true);
    isBarNav.value = true;
    await nextTick();
    expect(w.find("[data-testid='phone']").exists()).toBe(true);
    app.editorFocus = true;
    await nextTick();
    expect(w.find("[data-testid='phone']").exists()).toBe(false);
    w.unmount();
  });

  // Fails if the deck's keys stay live in the Cartographer or on the Play
  // screen, where X, E, O and V already mean something: one key, two actions.
  it("turns the deck's keys and D off while an editor owns the screen", () => {
    const w = host();
    expect(hotkeyEnabled?.()).toBe(true);
    app.editorFocus = true;
    expect(hotkeyEnabled?.()).toBe(false);
    pressD();
    expect(ui.deckSize).toBe("row");
    w.unmount();
  });

  it("sends an Edit request to the builder's pad and clears it so it fires once", async () => {
    const w = host();
    editRequest.value = { padId: "pad-9" };
    await nextTick();
    expect(push).toHaveBeenCalledWith({ path: "/soundboard", query: { pad: "pad-9" } });
    expect(clearEditRequest).toHaveBeenCalledOnce();
    w.unmount();
  });

  // Fails if the dock also answers on /soundboard: it would clear the request
  // before the builder, which is on screen there, could open the pad.
  it("leaves an Edit request on /soundboard to the builder", async () => {
    route.path = "/soundboard";
    const w = host();
    editRequest.value = { padId: "pad-9" };
    await nextTick();
    expect(push).not.toHaveBeenCalled();
    expect(clearEditRequest).not.toHaveBeenCalled();
    w.unmount();
  });

  it("settles Simple or Full once, from the first sounds result, and not again when they change", async () => {
    const w = host();
    expect(ui.settleDeckControls).not.toHaveBeenCalled();
    sounds.value = [{ id: "a" }];
    await nextTick();
    sounds.value = [];
    await nextTick();
    expect(ui.settleDeckControls).toHaveBeenCalledExactlyOnceWith(true);
    w.unmount();
  });

  it("shows the empty handle only once the pads have loaded and there are none", async () => {
    pads.value = undefined;
    const w = mount(SoundDeck, { global: { stubs: { DeckDock: { props: ["empty"], template: "<div data-testid='dock' :data-empty='empty' />" }, DeckPhoneSheet: true } } });
    expect(w.get("[data-testid='dock']").attributes("data-empty")).toBe("false");
    pads.value = [];
    await nextTick();
    expect(w.get("[data-testid='dock']").attributes("data-empty")).toBe("true");
    w.unmount();
  });

  it("reaches for the deck when a key 1 to 8 fires a top-row pad, and still sends the press", () => {
    const w = host();
    hotkeyTarget?.dispatch({ type: "press", lane: 2, row: 0 });
    expect(ui.requestDeckPeek).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "press", lane: 2, row: 0 });
    hotkeyTarget?.dispatch({ type: "hush", phase: "toggle" });
    expect(ui.requestDeckPeek).toHaveBeenCalledOnce();
    w.unmount();
  });
});
