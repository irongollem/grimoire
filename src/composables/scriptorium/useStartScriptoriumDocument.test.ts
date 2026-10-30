import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStartScriptoriumDocument } from "./useStartScriptoriumDocument";
import type { ScriptoriumTemplate } from "@/data/scriptoriumTemplates";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useCreateScriptoriumBook: () => ({ mutateAsync: mocks.mutateAsync, isPending: { value: false } }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
vi.mock("pinia", async (importOriginal) => ({ ...(await importOriginal<typeof import("pinia")>()), storeToRefs: (s: object) => ({ activeCampaignId: { value: (s as { activeCampaignId: string }).activeCampaignId } }) }));

describe("useStartScriptoriumDocument", () => {
  beforeEach(() => mocks.mutateAsync.mockReset().mockResolvedValue({ id: "new-id" }));

  it("starts a handout on the chosen paper, in the active campaign, as one A5 column", async () => {
    expect(await useStartScriptoriumDocument().startHandout("journal")).toBe("new-id");
    const { book, chapters } = mocks.mutateAsync.mock.calls[0][0];
    expect(book).toMatchObject({
      kind: "handout",
      theme: "journal",
      campaign_id: "camp-1",
      title: "Untitled journal page",
      page_size: "A5",
      is_two_column: false,
      show_page_numbers: false,
    });
    expect(chapters).toBeUndefined();
  });

  it("starts a book from a template with a chapter per top-level heading and the template's look", async () => {
    const heading = (t: string) => ({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: t }] });
    const template: ScriptoriumTemplate = {
      id: "t",
      name: "Adventure Module",
      description: "d",
      docType: "adventure",
      settings: { theme: "phb2014", pageSize: "Letter", isTwoColumn: true, inkFriendly: false, showPageNumbers: true, footerText: "F", pageNumberStart: 1, tags: ["x"] },
      build: () => ({ type: "doc", content: [heading("One"), heading("Two")] }),
    };
    await useStartScriptoriumDocument().startBook(template);
    const { book, chapters } = mocks.mutateAsync.mock.calls[0][0];
    expect(book).toMatchObject({ kind: "book", theme: "phb2014", doc_type: "adventure", page_size: "Letter", is_two_column: true, title: "Adventure Module", campaign_id: "camp-1" });
    expect(chapters).toHaveLength(2);
  });
});
