import { describe, expect, it, vi } from "vitest";

vi.mock("@/scriptorium/composables/useScriptorium", () => ({ useCreateScriptoriumBook: () => ({ mutateAsync: vi.fn() }) }));

const { draftToBook } = await import("./useGenerateScriptoriumDraft");

const draft = { title: "A letter", html: "<h2>Dear</h2><p>Hurry.</p>", ai_provenance: {
  generatorType: "scriptorium_draft", provider: "openai", model: "m", generatedAt: "t", edited: false } };

describe("draftToBook", () => {
  it("files a handout as one sheet of plain paper and everything else as a book", () => {
    expect(draftToBook({ ...draft, kind: "handout" }, "c1").book).toMatchObject({ kind: "handout", theme: "plain" });
    for (const kind of ["faction_dossier", "session_recap"] as const) {
      expect(draftToBook({ ...draft, kind }, "c1").book).toMatchObject({ kind: "book", theme: "grimoire", page_size: "A4" });
    }
  });

  it("files it unpublished in the campaign, with the AI's provenance and one chapter of its body", () => {
    const { book, chapters } = draftToBook({ ...draft, kind: "handout" }, "c1");
    expect(book).toMatchObject({ campaign_id: "c1", is_published: false, title: "A letter", ai_provenance: draft.ai_provenance });
    expect(chapters).toHaveLength(1);
  });
});
