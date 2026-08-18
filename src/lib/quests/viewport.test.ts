import { describe, expect, it } from "vitest";
import { readQuestViewport, viewportShowsAnyNode, writeQuestViewport } from "./viewport";

describe("quest viewport preferences", () => {
  it("round-trips a viewport per quest and rejects malformed state", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    writeQuestViewport("q", { x: 10, y: -5, zoom: 1.25 }, storage);
    expect(readQuestViewport("q", storage)).toEqual({ x: 10, y: -5, zoom: 1.25 });
    values.set("grimoire:quest-flow-viewport:bad", "{broken");
    expect(readQuestViewport("bad", storage)).toBeNull();
  });

  it("does not break graph interaction when browser storage rejects a write", () => {
    const storage = { setItem: () => { throw new Error("quota"); } };
    expect(() => writeQuestViewport("q", { x: 0, y: 0, zoom: 1 }, storage)).not.toThrow();
  });

  // A viewport saved in one window is restored into whatever window comes next.
  it("rejects a stored viewport that would open the flow on empty space", () => {
    const nodes = [{ position: { x: 0, y: 0 } }, { position: { x: 320, y: 0 } }];
    const size = { width: 800, height: 600 };

    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 1 }, nodes, size)).toBe(true);
    // Every beat parked off the left edge — the "empty quest until you press
    // Fit" case.
    expect(viewportShowsAnyNode({ x: -2000, y: 0, zoom: 1 }, nodes, size)).toBe(false);
    expect(viewportShowsAnyNode({ x: 0, y: -4000, zoom: 1 }, nodes, size)).toBe(false);
    // Partially on screen still counts: the DM panned there deliberately.
    expect(viewportShowsAnyNode({ x: -100, y: 0, zoom: 1 }, nodes, size)).toBe(true);
  });

  it("treats an unmeasured canvas as unusable rather than as a fit failure", () => {
    // A canvas that has not been laid out yet reports zero, and fitting against
    // zero is what produces the off-screen transform in the first place.
    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 1 }, [{ position: { x: 0, y: 0 } }], { width: 0, height: 0 })).toBe(false);
    // An empty flow has nothing to miss.
    expect(viewportShowsAnyNode({ x: -9999, y: 0, zoom: 1 }, [], { width: 800, height: 600 })).toBe(true);
  });
});
