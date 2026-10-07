import { describe, expect, it } from "vitest";
import { archiveAiText, archivePageMarkdown } from "./archiveAiText";
import type { ArchivePage } from "./types";

function page(title: string, content: Record<string, unknown>[]): ArchivePage {
  return {
    ref: title,
    path: title,
    title,
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
  };
}

describe("archiveAiText", () => {
  it("writes a page as a heading plus its body, links flattened to their labels", () => {
    const md = archivePageMarkdown(
      page("Mara", [{ type: "paragraph", content: [{ type: "text", text: "Lives in " }, { type: "archiveLink", attrs: { target: "Dunmere", label: "Dunmere" } }] }]),
    );
    expect(md).toBe("# Mara\n\nLives in Dunmere");
  });

  it("joins pages and counts them the way a pasted import is counted", () => {
    const long = "word ".repeat(1000);
    const out = archiveAiText([
      page("A", [{ type: "paragraph", content: [{ type: "text", text: long }] }]),
      page("B", [{ type: "paragraph", content: [{ type: "text", text: "short" }] }]),
    ]);
    expect(out.text).toContain("# A");
    expect(out.text).toContain("# B");
    expect(out.pages).toBe(Math.ceil(out.chars / 3500));
  });

  it("keeps a page with no body as just its heading", () => {
    expect(archivePageMarkdown(page("Empty", []))).toBe("# Empty");
  });
});
