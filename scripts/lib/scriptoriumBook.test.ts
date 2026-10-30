import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetImagePath,
  chapterFileNames,
  countNodes,
  expandHome,
  chapterSources,
  planChapterSync,
  parseArtReference,
  resolveArtSlot,
  type ArtLookups,
} from "./scriptoriumBook.ts";
import type { ArtSlot } from "../../src/lib/scriptorium/markdownImport.ts";

const slot = (over: Partial<ArtSlot>): ArtSlot => ({ slug: "s", size: "full", ...over });

function lookups(files: string[], portraits: Record<string, string> = {}): ArtLookups {
  return {
    npcPortraits: new Map(Object.entries(portraits)),
    fileExists: (p) => files.includes(p),
    desktopDir: "/desk",
    sourceDir: "/src",
  };
}

describe("chapterSources", () => {
  it("keeps one source per chapter, trimmed, and drops empty ones", () => {
    expect(chapterSources(["# A\n", "  ", "# B"])).toEqual(["# A", "# B"]);
  });
});

describe("planChapterSync", () => {
  const ch = (id: string, position: number) => ({ id, position });

  it("a re-import keeps the id of an unchanged chapter so its notes survive", () => {
    const plan = planChapterSync([ch("b", 1), ch("a", 0)], 2);
    expect(plan.updates).toEqual([
      { id: "a", position: 0, index: 0 },
      { id: "b", position: 1, index: 1 },
    ]);
    expect(plan.inserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("a surplus chapter is deleted on re-import", () => {
    const plan = planChapterSync([ch("a", 0), ch("b", 1), ch("c", 2)], 1);
    expect(plan.updates.map((u) => u.id)).toEqual(["a"]);
    expect(plan.deletes).toEqual(["b", "c"]);
  });

  it("chapters the book did not have are inserted after the existing ones", () => {
    const plan = planChapterSync([ch("a", 0)], 3);
    expect(plan.updates.map((u) => u.id)).toEqual(["a"]);
    expect(plan.inserts).toEqual([{ position: 1, index: 1 }, { position: 2, index: 2 }]);
  });

  it("closes gaps in the existing positions", () => {
    expect(planChapterSync([ch("a", 0), ch("b", 5)], 2).updates.map((u) => u.position)).toEqual([0, 1]);
  });
});

describe("chapterFileNames", () => {
  it("sorts by filename and keeps only markdown", () => {
    expect(chapterFileNames(["11-appendices.md", "03b-x.md", "notes.txt", "00-front.md", "03a-y.md"])).toEqual([
      "00-front.md",
      "03a-y.md",
      "03b-x.md",
      "11-appendices.md",
    ]);
  });
});

describe("chapterFileNames, upper-case extensions", () => {
  it("keeps a chapter saved as .MD", () => {
    expect(chapterFileNames(["01-b.MD", "00-a.md"])).toEqual(["00-a.md", "01-b.MD"]);
  });
});

describe("expandHome", () => {
  it("expands a leading ~ to the home folder and leaves other paths alone", () => {
    expect(expandHome("~/Desktop/book")).toBe(join(homedir(), "/Desktop/book"));
    expect(expandHome("/srv/book")).toBe("/srv/book");
  });
});

describe("parseArtReference", () => {
  it("reads the three forms", () => {
    expect(parseArtReference("campaign-npc: Vellum Brink")).toEqual({ kind: "campaign-npc", name: "Vellum Brink" });
    expect(parseArtReference("art-955/kind-country/out/x.png")).toEqual({
      kind: "file",
      root: "desktop",
      relativePath: "art-955/kind-country/out/x.png",
    });
    expect(parseArtReference("Sothery_Map.png")).toEqual({ kind: "file", root: "source", relativePath: "Sothery_Map.png" });
    expect(parseArtReference("illustrations/pets/a.png")).toMatchObject({ root: "source" });
    expect(parseArtReference("CAMPAIGN-NPC:Vellum Brink")).toEqual({ kind: "campaign-npc", name: "Vellum Brink" });
    expect(parseArtReference("  ")).toBeNull();
    expect(parseArtReference(undefined)).toBeNull();
  });
});

describe("resolveArtSlot", () => {
  it("resolves a campaign NPC by normalised name", () => {
    const r = resolveArtSlot(slot({ existing: "campaign-npc: Vellum  Brink" }), lookups([], { "vellum brink": "https://x/p.webp" }));
    expect(r).toMatchObject({ kind: "url", url: "https://x/p.webp" });
  });

  it("resolves a Desktop file, then a source-folder file", () => {
    expect(
      resolveArtSlot(slot({ existing: "art-955/kind-country/out/a.png" }), lookups(["/desk/art-955/kind-country/out/a.png"])),
    ).toMatchObject({ kind: "file", path: "/desk/art-955/kind-country/out/a.png" });
    expect(resolveArtSlot(slot({ existing: "Sothery_Map.png" }), lookups(["/src/Sothery_Map.png"]))).toMatchObject({
      kind: "file",
      path: "/src/Sothery_Map.png",
    });
  });

  it("falls back to alt when existing does not resolve, and keeps existing first when both do", () => {
    const l = lookups(["/src/illustrations/b.png", "/src/illustrations/a.png"]);
    expect(resolveArtSlot(slot({ existing: "illustrations/missing.png", alt: "illustrations/b.png" }), l)).toMatchObject({
      path: "/src/illustrations/b.png",
    });
    expect(resolveArtSlot(slot({ existing: "illustrations/a.png", alt: "illustrations/b.png" }), l)).toMatchObject({
      path: "/src/illustrations/a.png",
    });
  });

  it("goes on to alt when the existing NPC has no portrait", () => {
    const l = lookups(["/src/illustrations/b.png"]);
    expect(resolveArtSlot(slot({ existing: "campaign-npc: Nobody", alt: "illustrations/b.png" }), l)).toMatchObject({ path: "/src/illustrations/b.png" });
  });

  it("returns null when nothing resolves or the slot names nothing", () => {
    expect(resolveArtSlot(slot({ existing: "campaign-npc: Nobody" }), lookups([]))).toBeNull();
    expect(resolveArtSlot(slot({}), lookups([]))).toBeNull();
  });
});

describe("countNodes / assetImagePath", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "one two" }] },
      { type: "noteBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "three" }] }] },
    ],
  };
  it("counts nodes by type", () => {
    expect(countNodes(doc, "paragraph")).toBe(2);
    expect(countNodes(doc, "image")).toBe(0);
  });
  it("keys an asset by owner and hash", () => expect(assetImagePath("u1", "abc")).toBe("u1/abc.webp"));
});
