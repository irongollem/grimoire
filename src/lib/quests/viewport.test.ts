import { describe, expect, it } from "vitest";
import { readQuestViewport, writeQuestViewport } from "./viewport";

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
});
