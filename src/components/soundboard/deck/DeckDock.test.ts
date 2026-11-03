import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { nextTick, reactive, ref } from "vue";

const snapshot = ref({ pages: [{ id: "p", name: "Mill" }], pageIndex: 0, lanes: [], rows: 1, cells: [], tool: "play", lockedTool: "play", hush: false, paused: false, audibleCount: 2, masterVolume: 1 });
// Refs inside a reactive object, as a Pinia store holds its state, so storeToRefs sees them.
const ui = reactive({
  deckSize: ref<"tucked" | "row" | "deck" | "full">("tucked"),
  deckPeekEnabled: ref(true),
  deckPeekSignal: ref(0),
  deckControls: ref("simple"),
});

vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => ({ snapshot, dispatch: vi.fn() }) }));
vi.mock("@/stores/ui/soundboard", () => ({ useSoundboardUiStore: () => ui }));

const { default: DeckDock } = await import("./DeckDock.vue");

const stubs = {
  RouterLink: { template: "<a><slot /></a>" },
  DeckDockBody: { template: "<div data-testid='body' />" },
  DeckHeader: true,
  DeckGrid: true,
  DeckTransport: true,
  DeckSizeControl: true,
  DeckSettingsPopover: true,
  AppButton: true,
};

function dock(props: { empty?: boolean } = {}) {
  return mount(DeckDock, { props, global: { stubs } });
}

beforeEach(() => {
  snapshot.value = { ...snapshot.value, pageIndex: 0, rows: 1 };
  ui.deckSize = "tucked";
  ui.deckPeekEnabled = true;
  ui.deckPeekSignal = 0;
});

describe("DeckDock", () => {
  it("opens the tucked handle to the row on click, and says how many are playing", async () => {
    const w = dock();
    expect(w.get("[data-testid='deck-handle']").text()).toContain("2 playing");
    await w.get("[data-testid='deck-handle']").trigger("click");
    expect(ui.deckSize).toBe("row");
  });

  it("peeks over the page on a signal from the row, without changing the size", async () => {
    ui.deckSize = "row";
    const w = dock();
    expect(w.find("[data-testid='deck-peek']").exists()).toBe(false);
    ui.deckPeekSignal += 1;
    await nextTick();
    expect(w.find("[data-testid='deck-peek']").exists()).toBe(true);
    expect(ui.deckSize).toBe("row");
  });

  it("does not peek on a signal when the setting is off", async () => {
    ui.deckPeekEnabled = false;
    const w = dock();
    ui.deckPeekSignal += 1;
    await nextTick();
    expect(w.find("[data-testid='deck-peek']").exists()).toBe(false);
  });

  it("does not peek when the deck is already at Deck size", async () => {
    ui.deckSize = "deck";
    const w = dock();
    ui.deckPeekSignal += 1;
    await nextTick();
    expect(w.find("[data-testid='deck-peek']").exists()).toBe(false);
  });

  it("with no pads shows a single link to build the deck, whatever the size", () => {
    ui.deckSize = "deck";
    const w = dock({ empty: true });
    expect(w.text()).toContain("Build your deck");
    expect(w.find("[data-testid='body']").exists()).toBe(false);
  });

  describe("the one-row bar steps through the rows", () => {
    function rowBar(rows: number) {
      snapshot.value = { ...snapshot.value, rows };
      ui.deckSize = "row";
      return dock();
    }
    const shownRow = (w: ReturnType<typeof dock>) => w.get("deck-grid-stub").attributes("rowstart");

    it("moves to the next row and back with the buttons, and cannot go past either end", async () => {
      const w = rowBar(3);
      expect(shownRow(w)).toBe("0");
      expect(w.get("[data-testid='deck-row-up']").attributes("disabled")).toBe("true");
      await w.get("[data-testid='deck-row-down']").trigger("click");
      await w.get("[data-testid='deck-row-down']").trigger("click");
      expect(shownRow(w)).toBe("2");
      expect(w.get("[data-testid='deck-row-down']").attributes("disabled")).toBe("true");
      await w.get("[data-testid='deck-row-up']").trigger("click");
      expect(shownRow(w)).toBe("1");
    });

    it("steps one row on a scroll and keeps the scroll from moving the page", async () => {
      const w = rowBar(3);
      const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
      w.get("[data-testid='deck-dock'] > div.h-19").element.dispatchEvent(event);
      await nextTick();
      expect(shownRow(w)).toBe("1");
      expect(event.defaultPrevented).toBe(true);
    });

    it("leaves the scroll to the page when there is only one row", async () => {
      const w = rowBar(1);
      expect(w.find("[data-testid='deck-row-steps']").exists()).toBe(false);
      const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
      w.get("[data-testid='deck-dock'] > div.h-19").element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it("goes back to the top row on another page", async () => {
      const w = rowBar(3);
      await w.get("[data-testid='deck-row-down']").trigger("click");
      expect(shownRow(w)).toBe("1");
      snapshot.value = { ...snapshot.value, pageIndex: 1 };
      await nextTick();
      expect(shownRow(w)).toBe("0");
    });

    it("shows the last row when the page has fewer rows than where the bar was", async () => {
      const w = rowBar(3);
      await w.get("[data-testid='deck-row-down']").trigger("click");
      await w.get("[data-testid='deck-row-down']").trigger("click");
      snapshot.value = { ...snapshot.value, rows: 2 };
      await nextTick();
      expect(shownRow(w)).toBe("1");
    });
  });
});
