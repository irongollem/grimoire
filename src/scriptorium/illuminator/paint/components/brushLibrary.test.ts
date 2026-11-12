import { describe, expect, it } from "vitest";
import type { BrushGroup, BrushPreset } from "../engine/types";
import { brushMatches, groupBrushes } from "./brushLibrary";

const make = (id: string, name: string, group: BrushGroup) => ({ id, name, group }) as BrushPreset;
const brushes = [
  make("a", "Round wash", "watercolour"),
  make("b", "Hard round", "basic"),
  make("c", "Flat bristle", "bristle"),
  make("d", "Soft round", "basic"),
];

describe("groupBrushes", () => {
  // Fails if groups follow input order instead of the library's: Basic must come before Watercolour.
  it("lists groups in library order, brushes in the order given", () => {
    const sections = groupBrushes(brushes, "");
    expect(sections.map((s) => s.group)).toEqual(["basic", "watercolour", "bristle", "yours"]);
    expect(sections[0]!.brushes.map((b) => b.id)).toEqual(["b", "d"]);
  });

  // Fails if the empty Yours group is dropped: the hint about making a brush hangs off it.
  it("keeps an empty Yours group when not searching", () => {
    expect(groupBrushes(brushes, "").at(-1)).toMatchObject({ group: "yours", brushes: [] });
  });

  // Fails if a search leaves empty group headings behind or matches on case.
  it("a search keeps only groups with a match, ignoring case", () => {
    const sections = groupBrushes(brushes, "ROUND");
    expect(sections.map((s) => s.group)).toEqual(["basic", "watercolour"]);
    expect(sections.flatMap((s) => s.brushes.map((b) => b.id))).toEqual(["b", "d", "a"]);
  });

  // Fails if whitespace counts as a search: padding would hide the whole library.
  it("blank or padded queries behave sensibly", () => {
    expect(groupBrushes(brushes, "   ")).toHaveLength(4);
    expect(brushMatches(brushes[1]!, "  hard ")).toBe(true);
  });

  // Fails if only the first word is checked.
  it("every word of the query must match", () => {
    expect(brushMatches(brushes[1]!, "hard soft")).toBe(false);
    expect(brushMatches(brushes[1]!, "round hard")).toBe(true);
  });
});
