import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetImagePath,
  chapterFileNames,
  countNodes,
  countWords,
  expandHome,
  joinChapters,
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

describe("joinChapters", () => {
  it("puts one page break between chapters and drops empty ones", () => {
    expect(joinChapters(["# A\n", "", "# B"])).toBe("# A\n\n\\page\n\n# B");
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

describe("countWords / countNodes / assetImagePath", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "one two" }] },
      { type: "noteBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "three" }] }] },
    ],
  };
  it("counts words across blocks", () => expect(countWords(doc)).toBe(3));
  it("counts neighbouring blocks as separate words and an empty document as none", () => {
    const touching = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }, { type: "paragraph", content: [{ type: "text", text: "two" }] }] };
    expect(countWords(touching)).toBe(2);
    expect(countWords({ type: "doc", content: [{ type: "paragraph" }] })).toBe(0);
  });
  it("counts nodes by type", () => {
    expect(countNodes(doc, "paragraph")).toBe(2);
    expect(countNodes(doc, "image")).toBe(0);
  });
  it("keys an asset by owner and hash", () => expect(assetImagePath("u1", "abc")).toBe("u1/abc.webp"));
});
