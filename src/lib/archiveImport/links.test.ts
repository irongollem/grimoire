import { describe, expect, it } from "vitest";
import { archiveLinkNode, findPageForLink, internalTarget, resolveArchiveLinks } from "./links";
import type { ArchivePage, TiptapDoc } from "./types";

function page(path: string, title: string, aliases: string[] = []): ArchivePage {
  return {
    ref: path, path, title, folders: path.split("/").slice(0, -1), parentRef: null, kind: "note", kindReason: "", tags: [], aliases,
    frontmatter: {}, body: { type: "doc", content: [] }, links: [], notes: [], format: "markdown",
  };
}

describe("internalTarget", () => {
  it("resolves relative hrefs against the page and drops extension, anchor and escapes", () => {
    expect(internalTarget("../NPCs/Bob%20Smith.html#top", "Places/Town.html")).toBe("NPCs/Bob Smith");
    expect(internalTarget("Bob.md", "NPCs/Al.md")).toBe("NPCs/Bob");
    expect(internalTarget("/x/y.html", "a/b.html")).toBe("x/y");
  });
  it("rejects external, anchor-only and root-escaping links", () => {
    expect(internalTarget("https://example.com/x", "a.md")).toBeNull();
    expect(internalTarget("mailto:a@b.c", "a.md")).toBeNull();
    expect(internalTarget("#top", "a.md")).toBeNull();
    expect(internalTarget("../../x.md", "a/b.md")).toBeNull();
  });
});

describe("findPageForLink", () => {
  const pages = [
    page("NPCs/Bob.md", "Bob", ["Bobby"]),
    page("Locations/Bob's Hole.md", "Bob's Hole"),
    page("Notes/Plan.md", "Plan"),
    page("Other/Plan.md", "Plan"),
  ];
  it("resolves by path, including a vault-root prefix", () => {
    expect(findPageForLink("NPCs/Bob", pages)?.ref).toBe("NPCs/Bob.md");
    expect(findPageForLink("Notes/Plan", [page("Vault/Notes/Plan.md", "Plan")])?.ref).toBe("Vault/Notes/Plan.md");
  });
  it("then by title, then by normalised name and alias", () => {
    expect(findPageForLink("Bob", pages)?.ref).toBe("NPCs/Bob.md");
    expect(findPageForLink("bobs hole", pages)?.ref).toBe("Locations/Bob's Hole.md");
    expect(findPageForLink("Bobby", pages)?.ref).toBe("NPCs/Bob.md");
    expect(findPageForLink("the Bobs", pages)?.ref).toBe("NPCs/Bob.md");
  });
  it("returns null for an unknown or ambiguous name", () => {
    expect(findPageForLink("Nobody", pages)).toBeNull();
    expect(findPageForLink("Plan", pages)).toBeNull();
  });
});

describe("resolveArchiveLinks", () => {
  const doc: TiptapDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See " },
          archiveLinkNode("NPCs/Bob", "Bob"),
          { type: "text", text: " and " },
          { ...archiveLinkNode("Nowhere", "Nowhere"), marks: [{ type: "bold" }] },
        ],
      },
    ],
  };
  it("swaps resolvable links for mentions and the rest for their label", () => {
    const out = resolveArchiveLinks(doc, (t) => (t === "NPCs/Bob" ? { id: "n1", entityType: "npc" } : null));
    expect(out.content[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        { type: "entityMention", attrs: { id: "n1", entityType: "npc" } },
        { type: "text", text: " and " },
        { type: "text", text: "Nowhere", marks: [{ type: "bold" }] },
      ],
    });
  });
  it("does not mutate its input", () => {
    const before = JSON.stringify(doc);
    resolveArchiveLinks(doc, () => null);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
