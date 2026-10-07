import { describe, expect, it } from "vitest";
import { countByKind, groupPagesByFolder, initiallyOpenGroups } from "./sortGroups";
import type { ArchivePage } from "./types";

function page(ref: string, folders: string[], kind: ArchivePage["kind"] = "note"): ArchivePage {
  return {
    ref,
    path: ref,
    title: ref,
    folders,
    parentRef: null,
    kind,
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

describe("groupPagesByFolder", () => {
  it("groups by folder path in first-seen order, naming the root", () => {
    const groups = groupPagesByFolder([page("a", ["NPCs"]), page("b", []), page("c", ["NPCs"]), page("d", ["Places", "Towns"])]);
    expect(groups.map((g) => [g.label, g.pages.length])).toEqual([
      ["NPCs", 2],
      ["Top level", 1],
      ["Places / Towns", 1],
    ]);
  });
});

describe("countByKind", () => {
  it("counts the DM's settled kind, falling back to the guess", () => {
    const pages = [page("a", [], "npc"), page("b", [], "npc"), page("c", [], "note")];
    expect(countByKind(pages, new Map([["b", "skip"]]))).toMatchObject({ npc: 1, skip: 1, note: 1 });
  });
});

describe("initiallyOpenGroups", () => {
  it("opens small groups until the budget, and never a big one", () => {
    const big = groupPagesByFolder(Array.from({ length: 50 }, (_, i) => page(`b${i}`, ["Big"])));
    const smalls = Array.from({ length: 10 }, (_, g) => groupPagesByFolder(Array.from({ length: 15 }, (_, i) => page(`s${g}-${i}`, [`S${g}`])))[0]);
    const open = initiallyOpenGroups([...big, ...smalls]);
    expect(open.has("Big")).toBe(false);
    expect(open.size).toBe(8); // 8 x 15 = 120 pages
  });
});
