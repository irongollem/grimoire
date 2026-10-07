import { describe, expect, it } from "vitest";
import { fieldsForKind } from "./fields";
import { markdownToTiptapDoc } from "@/lib/tiptap/markdownDocument";
import type { ArchivePage } from "./types";

function pageOf(markdown: string, over: Partial<ArchivePage> = {}): ArchivePage {
  return {
    ref: "p.md", path: "p.md", title: "P", folders: [], parentRef: null, kind: "note", kindReason: "", tags: ["t"], aliases: [],
    frontmatter: {}, body: markdownToTiptapDoc(markdown), links: [], notes: [], format: "markdown", ...over,
  };
}

const text = (doc: unknown) => JSON.stringify(doc);

describe("fieldsForKind", () => {
  it("splits an NPC by section headings and sends the rest to backstory", () => {
    const f = fieldsForKind(
      pageOf("Intro line.\n\n## Appearance\n\nTall.\n\n## Personality\n\nWry.\n\n## DM Notes\n\nSecret.\n\n## Family\n\nA sister.\n\n### Deeper\n\nx"),
      "npc",
    );
    if (f.kind !== "npc") throw new Error("kind");
    expect(text(f.appearance)).toContain("Tall.");
    expect(text(f.appearance)).not.toContain("Appearance");
    expect(text(f.personality)).toContain("Wry.");
    expect(text(f.notes)).toContain("Secret.");
    expect(text(f.backstory)).toContain("Intro line.");
    expect(text(f.backstory)).toContain("Family");
    expect(text(f.backstory)).toContain("Deeper");
    expect(text(f.backstory)).not.toContain("Secret.");
  });

  it("puts a body with no recognised sections wholly in backstory, and omits empty columns", () => {
    const f = fieldsForKind(pageOf("Just prose."), "npc");
    expect(Object.keys(f).sort()).toEqual(["backstory", "kind"]);
  });

  it("gives location, faction and item a description, dropping our own Description wrapper heading", () => {
    for (const kind of ["location", "faction", "item"] as const) {
      const f = fieldsForKind(pageOf("## Description\n\nA damp cave."), kind);
      expect(f.kind).toBe(kind);
      expect(text("description" in f ? f.description : null)).toBe(text(markdownToTiptapDoc("A damp cave.")));
    }
  });

  it("makes a quest summary plain, one line and capped, with the rest on the beat", () => {
    const f = fieldsForKind(pageOf("## Summary\n\nA rumour at the mill. It grows.\n\n## Objectives\n\n- **Pending:** Find it"), "quest");
    if (f.kind !== "quest") throw new Error("kind");
    expect(f.summary).toBe("A rumour at the mill.");
    expect(typeof f.summary).toBe("string");
    expect(text(f.beatContent)).toContain("It grows.");
    expect(text(f.beatContent)).toContain("Objectives");
    expect(text(f.beatContent)).not.toContain("A rumour at the mill");

    const long = fieldsForKind(pageOf(`${"word ".repeat(80)}ends.`), "quest");
    if (long.kind !== "quest") throw new Error("kind");
    expect(long.summary).toBeNull();
    expect(long.beatContent).toBeDefined();
  });

  it("keeps a note whole with its category and tags", () => {
    const f = fieldsForKind(pageOf("Body.", { frontmatter: { category: "lore" } }), "note");
    expect(f).toMatchObject({ kind: "note", title: "P", category: "lore", tags: ["t"] });
  });
});
