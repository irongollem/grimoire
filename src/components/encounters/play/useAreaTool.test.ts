import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AreaShape } from "@/lib/battlemap/areaTemplates";
import { useAreaTool } from "./useAreaTool";

function setup(shape: AreaShape, token: { position: { x: number; y: number }; footprint: number } | null = null) {
  const pick = vi.fn();
  const tool = useAreaTool({
    shape: ref(shape),
    feet: ref(shape === "cube" ? 10 : 20),
    token: () => token,
    creatures: () => [
      { id: "near", position: { x: 5, y: 5 }, footprint: 1 },
      { id: "far", position: { x: 20, y: 20 }, footprint: 1 },
    ],
    pick,
  });
  return { tool, pick };
}

describe("useAreaTool", () => {
  it("a sphere follows the pointer, and a click sets it down and picks the creatures inside, not the ones beyond it", () => {
    const { tool, pick } = setup("sphere");
    tool.hover({ x: 5.4, y: 5.4 });
    expect(tool.shown.value?.origin).toEqual({ x: 5, y: 5 });
    expect(tool.placed.value).toBeNull();
    tool.click({ x: 5.4, y: 5.4 });
    expect(tool.placed.value).not.toBeNull();
    expect(pick).toHaveBeenCalledWith(["near"]);
  });

  it("a set-down area stays put when the pointer wanders", () => {
    const { tool } = setup("sphere");
    tool.click({ x: 5, y: 5 });
    tool.hover({ x: 15, y: 15 });
    expect(tool.shown.value?.origin).toEqual({ x: 5, y: 5 });
  });

  it("a click on a set-down area moves it to the new spot", () => {
    const { tool, pick } = setup("sphere");
    tool.click({ x: 5, y: 5 });
    tool.click({ x: 20.5, y: 20.5 });
    expect(pick).toHaveBeenLastCalledWith(["far"]);
  });

  it("a cone from the selected token starts at the token's edge and aims at the pointer", () => {
    const { tool, pick } = setup("cone", { position: { x: 2, y: 5 }, footprint: 1 });
    tool.click({ x: 12.5, y: 5.5 });
    expect(tool.placed.value?.origin).toEqual({ x: 3, y: 5.5 });
    expect(pick).toHaveBeenCalledWith(["near"]);
  });

  it("with no token selected, the first click sets a cone's origin and the second aims it", () => {
    const { tool, pick } = setup("cone");
    tool.click({ x: 3.2, y: 5.9 });
    expect(tool.placed.value).toBeNull();
    expect(pick).not.toHaveBeenCalled();
    tool.hover({ x: 12, y: 6 });
    expect(tool.shown.value?.origin).toEqual({ x: 3, y: 6 });
    tool.click({ x: 12, y: 6 });
    expect(tool.placed.value?.shape).toBe("cone");
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("after a cone is set down, the next click starts another from scratch rather than keeping the old one", () => {
    const { tool } = setup("cone");
    tool.click({ x: 3, y: 5 });
    tool.hover({ x: 12, y: 5 });
    tool.click({ x: 12, y: 5 });
    expect(tool.placed.value).not.toBeNull();
    tool.click({ x: 8, y: 8 });
    expect(tool.placed.value).toBeNull();
  });

  it("clear drops the template and the half-set origin", () => {
    const { tool } = setup("line");
    tool.click({ x: 3, y: 3 });
    tool.hover({ x: 9, y: 3 });
    expect(tool.shown.value).not.toBeNull();
    tool.clear();
    expect(tool.shown.value).toBeNull();
    tool.hover({ x: 9, y: 3 });
    expect(tool.shown.value).toBeNull();
  });

  it("an area that catches nobody picks an empty list, so Damage all has nobody to hit", () => {
    const { tool, pick } = setup("cube");
    tool.click({ x: 30, y: 30 });
    expect(pick).toHaveBeenCalledWith([]);
  });
});
