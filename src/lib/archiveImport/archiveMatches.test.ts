import { describe, expect, it } from "vitest";
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import { batchEntities, entitiesForMatching, IMPORT_MATCH_MAX_ENTITIES, mergeCandidates, type CandidatesByKind } from "./archiveMatches";
import type { ArchivePage, ArchivePageKind } from "./types";

function page(ref: string, text = "Some body."): ArchivePage {
  return {
    ref,
    path: ref,
    title: ref,
    folders: [],
    parentRef: null,
    kind: "note",
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

describe("entitiesForMatching", () => {
  it("sends a name and a short excerpt, keyed by import kind, and leaves notes and skips out", () => {
    const pages: { page: ArchivePage; kind: ArchivePageKind }[] = [
      { page: page("Mara", "x".repeat(2000)), kind: "npc" },
      { page: page("Bell"), kind: "quest" },
      { page: page("Diary"), kind: "note" },
      { page: page("Junk"), kind: "skip" },
    ];
    const out = entitiesForMatching(pages);
    expect(Object.keys(out).sort()).toEqual(["npcs", "quests"]);
    expect(out.npcs?.[0].data.name).toBe("Mara");
    expect(String(out.npcs?.[0].data.description)).toHaveLength(400);
    expect(out.quests?.[0].data.title).toBe("Bell");
  });
});

describe("batchEntities", () => {
  it("never puts more than the edge function's cap in one request, and loses nothing", () => {
    const pages = Array.from({ length: 2000 }, (_, i) => ({ page: page(`p${i}`), kind: (i % 2 ? "npc" : "location") as ArchivePageKind }));
    const batches = batchEntities(entitiesForMatching(pages));
    const sizes = batches.map((b) => Object.values(b).reduce((n, list) => n + (list?.length ?? 0), 0));
    expect(Math.max(...sizes)).toBe(IMPORT_MATCH_MAX_ENTITIES);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(2000);
    expect(batches).toHaveLength(7);
  });

  it("is empty for nothing to match", () => {
    expect(batchEntities({})).toEqual([]);
  });
});

describe("mergeCandidates", () => {
  it("folds batches into one map per kind", () => {
    const c = (name: string): EntityCandidate => ({ targetId: name, source: "campaign", name, matchKind: "exact", detail: null, distance: null });
    const into: CandidatesByKind = new Map([["npcs", new Map([["a", [c("A")]]])]]);
    mergeCandidates(into, new Map([["npcs", new Map([["b", [c("B")]]])], ["locations", new Map([["c", [c("C")]]])]]));
    expect([...(into.get("npcs")?.keys() ?? [])]).toEqual(["a", "b"]);
    expect(into.get("locations")?.get("c")?.[0].name).toBe("C");
  });
});
