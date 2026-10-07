import { describe, expect, it } from "vitest";
import {
  buildArchiveManifest,
  importablePageCount,
  kindsFromManifest,
  parseArchiveManifest,
} from "./archiveManifest";
import type { ArchivePage } from "./types";

function page(ref: string, kind: ArchivePage["kind"]): ArchivePage {
  return {
    ref,
    path: ref,
    title: ref.replace(/\.md$/, ""),
    folders: [],
    parentRef: null,
    kind,
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A very long body that must not travel" }] }] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

describe("archive manifest", () => {
  it("records the settled kind per page and none of the body", () => {
    const pages = [page("a.md", "npc"), page("b.md", "note")];
    const manifest = buildArchiveManifest("obsidian", pages, new Map([["b.md", "skip"]]));
    expect(manifest.archive.pages).toEqual([
      { ref: "a.md", title: "a", kind: "npc" },
      { ref: "b.md", title: "b", kind: "skip" },
    ]);
    expect(JSON.stringify(manifest)).not.toContain("very long body");
    expect(importablePageCount(manifest)).toBe(1);
  });

  it("round-trips through parse and restores kinds by ref", () => {
    const manifest = buildArchiveManifest("legendkeeper", [page("a.md", "location")], new Map());
    const parsed = parseArchiveManifest(JSON.parse(JSON.stringify(manifest)));
    expect(parsed).toEqual(manifest);
    expect(kindsFromManifest(parsed!).get("a.md")).toBe("location");
  });

  it("refuses what is not a manifest and drops malformed entries", () => {
    expect(parseArchiveManifest(null)).toBeNull();
    expect(parseArchiveManifest({})).toBeNull();
    expect(parseArchiveManifest({ archive: { version: 2, source: "obsidian", pages: [] } })).toBeNull();
    expect(parseArchiveManifest({ archive: { version: 1, source: "nope", pages: [] } })).toBeNull();
    const parsed = parseArchiveManifest({
      archive: {
        version: 1,
        source: "obsidian",
        pages: [{ ref: "a", title: "A", kind: "npc" }, { ref: "b", title: "B", kind: "dragon" }, 7, { ref: 3 }],
      },
    });
    expect(parsed?.archive.pages).toEqual([{ ref: "a", title: "A", kind: "npc" }]);
  });
});
