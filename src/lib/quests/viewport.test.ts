import { describe, expect, it } from "vitest";
import { openingBeatId, readQuestViewport, viewportShowsAnyNode, writeQuestViewport } from "./viewport";

describe("quest viewport preferences", () => {
  it("round-trips a viewport per quest and rejects malformed state", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    writeQuestViewport("q", { x: 10, y: -5, zoom: 1.25 }, storage);
    expect(readQuestViewport("q", storage)).toEqual({ x: 10, y: -5, zoom: 1.25 });
    values.set("grimoire:quest-flow-viewport:bad", "{broken");
    expect(readQuestViewport("bad", storage)).toBeNull();
    // A zoom of zero would collapse the canvas to a point; a missing field is no viewport at all.
    values.set("grimoire:quest-flow-viewport:flat", JSON.stringify({ x: 1, y: 2, zoom: 0 }));
    values.set("grimoire:quest-flow-viewport:partial", JSON.stringify({ x: 1, zoom: 1 }));
    expect(readQuestViewport("flat", storage)).toBeNull();
    expect(readQuestViewport("partial", storage)).toBeNull();
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

  it("counts a beat as on screen only while some of it overlaps the canvas, edge by edge", () => {
    const size = { width: 800, height: 600 };
    const one = [{ position: { x: 0, y: 0 } }]; // a 240 x 120 beat at the origin
    const shows = (x: number, y: number) => viewportShowsAnyNode({ x, y, zoom: 1 }, one, size);
    expect(shows(-239, 0)).toBe(true);
    expect(shows(-240, 0)).toBe(false); // its right edge only touches the canvas's left edge
    expect(shows(799, 0)).toBe(true);
    expect(shows(800, 0)).toBe(false);
    expect(shows(0, -119)).toBe(true);
    expect(shows(0, -120)).toBe(false);
    expect(shows(0, 599)).toBe(true);
    expect(shows(0, 600)).toBe(false);
  });

  it("scales a beat's position by the zoom before comparing it with the canvas", () => {
    const far = [{ position: { x: 1000, y: 0 } }];
    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 1 }, far, { width: 800, height: 600 })).toBe(false);
    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 0.5 }, far, { width: 800, height: 600 })).toBe(true);
  });

  it("treats an unmeasured canvas as unusable rather than as a fit failure", () => {
    // A canvas that has not been laid out yet reports zero, and fitting against
    // zero is what produces the off-screen transform in the first place.
    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 1 }, [{ position: { x: 0, y: 0 } }], { width: 0, height: 0 })).toBe(false);
    // Zero in one dimension is as unmeasured as zero in both, even for a beat that straddles the origin.
    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 1 }, [{ position: { x: -100, y: 0 } }], { width: 0, height: 600 })).toBe(false);
    expect(viewportShowsAnyNode({ x: 0, y: 0, zoom: 1 }, [{ position: { x: 0, y: -50 } }], { width: 800, height: 0 })).toBe(false);
    // An empty flow has nothing to miss.
    expect(viewportShowsAnyNode({ x: -9999, y: 0, zoom: 1 }, [], { width: 800, height: 600 })).toBe(true);
  });
});

describe("openingBeatId (#944)", () => {
  const nodes = [
    { id: "middle", position: { x: 400, y: 0 } },
    { id: "start", position: { x: 0, y: 200 } },
    { id: "start-top", position: { x: 0, y: 0 } },
  ];

  it("opens where the party is", () => {
    expect(openingBeatId(nodes, "middle", "start")).toBe("middle");
  });

  it("falls back to the entry beat, then the leftmost beat", () => {
    expect(openingBeatId(nodes, null, "start")).toBe("start");
    expect(openingBeatId(nodes, "gone", null)).toBe("start-top");
  });

  it("returns null for an empty graph", () => {
    expect(openingBeatId([], null, null)).toBeNull();
  });
});
