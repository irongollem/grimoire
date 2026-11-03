import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";

const snapshot = ref({ rows: 4, keyRow: 0, lanes: [], cells: [], tool: "play", lockedTool: "play" });
const dispatch = vi.fn();
vi.mock("@/composables/soundboard/useDeck", () => ({ useDeck: () => ({ snapshot, dispatch }) }));
vi.mock("@/stores/ui/soundboard", () => ({ useSoundboardUiStore: () => reactive({ deckControls: "full" }) }));

const { default: DeckDockBody } = await import("./DeckDockBody.vue");

// Four rows of lane-0 cells, 50px tall on a 60px pitch, laid out against the scroller's own scrollTop.
const GridStub = {
  template: `<div><div v-for="row in 4" :key="row" :data-cell="'0:' + (row - 1)" /></div>`,
};

function body() {
  const w = mount(DeckDockBody, { global: { stubs: { DeckGrid: GridStub, DeckToolStrip: true } } });
  const scroller = w.get("[data-testid='deck-scroll']").element as HTMLElement;
  // Shows two and a half rows of a 230px column.
  Object.defineProperty(scroller, "clientHeight", { value: 140, configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: 230, configurable: true });
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 140));
  scroller.querySelectorAll<HTMLElement>("[data-cell]").forEach((cell, row) => {
    vi.spyOn(cell, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, row * 60 - scroller.scrollTop, 40, 50));
  });
  return { w, scroller };
}

beforeEach(() => {
  snapshot.value = { ...snapshot.value, keyRow: 0 };
  dispatch.mockClear();
});

describe("DeckDockBody and the row in view", () => {
  it("makes the top row showing the row in view when the DM scrolls", async () => {
    const { scroller } = body();
    scroller.scrollTop = 70;
    scroller.dispatchEvent(new Event("scroll"));
    expect(dispatch).toHaveBeenCalledWith({ type: "showRow", row: 1 });
  });

  it("says nothing while the row in view is still the top row", () => {
    const { scroller } = body();
    scroller.scrollTop = 10;
    scroller.dispatchEvent(new Event("scroll"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("counts from under the sticky lane headers, which cover the top of the scroller", () => {
    // 30px of headers, then the rows: scrolled 40px, row 0 shows only 10px below the headers.
    const HeaderGridStub = {
      template: `<div><div role="row" /><div v-for="row in 4" :key="row" :data-cell="'0:' + (row - 1)" /></div>`,
    };
    const w = mount(DeckDockBody, { global: { stubs: { DeckGrid: HeaderGridStub, DeckToolStrip: true } } });
    const scroller = w.get("[data-testid='deck-scroll']").element as HTMLElement;
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 140));
    const header = scroller.querySelector<HTMLElement>("[role='row']");
    if (header === null) throw new Error("no header");
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 30));
    scroller.querySelectorAll<HTMLElement>("[data-cell]").forEach((cell, row) => {
      vi.spyOn(cell, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 30 + row * 60 - scroller.scrollTop, 40, 50));
    });
    scroller.scrollTop = 40;
    scroller.dispatchEvent(new Event("scroll"));
    expect(dispatch).toHaveBeenCalledWith({ type: "showRow", row: 1 });
  });

  it("opens on the row in view, so a peek from the Row bar shows the row its key just played", async () => {
    snapshot.value = { ...snapshot.value, keyRow: 1 };
    const { scroller } = body();
    await nextTick();
    await nextTick();
    expect(scroller.scrollTop).toBe(60);
  });

  it("does not take its own scroll for the DM's, so a row that cannot reach the top keeps the keys", async () => {
    // Row 3 can only scroll to 90 of the 180 it would need, which leaves row 2 the top row showing.
    snapshot.value = { ...snapshot.value, keyRow: 3 };
    const { scroller } = body();
    await nextTick();
    await nextTick();
    expect(scroller.scrollTop).toBe(90);
    scroller.dispatchEvent(new Event("scroll"));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
