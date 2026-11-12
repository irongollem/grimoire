// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAINT_SECTIONS, PAINT_SECTIONS_KEY, usePaintSections } from "./usePaintSections";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the painting panel's blades", () => {
  // Fails on: the first opening not showing the brushes and layers, or the colour blade starting open.
  it("opens Brushes and Layers the first time", () => {
    expect(usePaintSections().open.value).toEqual(["brushes", "layers"]);
  });

  // Fails on: Versions missing from the blades (it could never be opened) or starting open (a long list over the brushes the first time).
  it("offers Versions, closed the first time, and remembers it open", () => {
    expect(PAINT_SECTIONS.map((x) => x.id)).toContain("versions");
    const s = usePaintSections();
    expect(s.isOpen("versions")).toBe(false);
    s.set("versions", true);
    expect(usePaintSections().isOpen("versions")).toBe(true);
  });

  // Fails on: opening one blade closing another (the tabs it replaced).
  it("holds several open at once", () => {
    const s = usePaintSections();
    s.set("colour", true);
    expect(s.isOpen("brushes") && s.isOpen("layers") && s.isOpen("colour")).toBe(true);
    s.toggle("layers");
    expect(s.open.value).toEqual(["brushes", "colour"]);
  });

  // Fails on: the open set not being kept per device.
  it("survives a remount", () => {
    const first = usePaintSections();
    first.set("colour", true);
    first.set("brushes", false);
    expect(usePaintSections().open.value).toEqual(["layers", "colour"]);
  });

  // Fails on: a garbled stored value breaking the panel instead of falling back.
  it("falls back to the first-time set on a garbled value", () => {
    localStorage.setItem(PAINT_SECTIONS_KEY, "{nope");
    expect(usePaintSections().open.value).toEqual(["brushes", "layers"]);
  });

  // Fails on: blocked storage stopping a blade from opening.
  it("still opens and closes when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const s = usePaintSections();
    s.set("colour", true);
    expect(s.isOpen("colour")).toBe(true);
  });
});
