import { describe, expect, it } from "vitest";
import { previewSections } from "./archivePreview";
import type { ArchivePage, TiptapNode } from "./types";

const p = (...content: TiptapNode[]): ArchivePage => ({
  ref: "x.md",
  path: "x.md",
  title: "X",
  folders: [],
  parentRef: null,
  kind: "npc",
  kindReason: "",
  tags: [],
  aliases: [],
  frontmatter: {},
  body: { type: "doc", content },
  links: [],
  notes: [],
  format: "markdown",
});
const para = (t: string): TiptapNode => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const heading = (t: string): TiptapNode => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: t }] });

describe("previewSections", () => {
  it("labels an NPC's sections by the column they land in", () => {
    const sections = previewSections(p(heading("Appearance"), para("Tall."), heading("Backstory"), para("Born."), heading("Secrets"), para("Hush.")), "npc");
    expect(sections.map((s) => s.label)).toEqual(["Appearance", "Backstory", "DM notes"]);
  });

  it("shows a quest's one-line summary and the prose that goes on its opening beat", () => {
    const sections = previewSections(p(para("A bell rings."), para("More prose.")), "quest");
    expect(sections[0]).toEqual({ label: "Summary", text: "A bell rings." });
    expect(sections[1].label).toBe("Opening beat (DM notes)");
  });

  it("flattens link placeholders to their label", () => {
    const sections = previewSections(p({ type: "paragraph", content: [{ type: "archiveLink", attrs: { target: "T", label: "Dunmere" } }] }), "location");
    expect(JSON.stringify(sections[0].doc)).toContain("Dunmere");
    expect(JSON.stringify(sections[0].doc)).not.toContain("archiveLink");
  });
});
