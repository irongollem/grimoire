import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStartScriptoriumDocument } from "./useStartScriptoriumDocument";
import type { ScriptoriumTemplate } from "@/scriptorium/data/templates";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), dmSource: vi.fn(), playersSource: vi.fn() }));
vi.mock("@/scriptorium/lib/campaignBookSource", () => ({ fetchDmBookSource: mocks.dmSource, fetchPlayersBookSource: mocks.playersSource }));
vi.mock("@/scriptorium/composables/useScriptorium", () => ({
  useCreateScriptoriumBook: () => ({ mutateAsync: mocks.mutateAsync, isPending: { value: false } }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1", activeCampaign: { id: "camp-1", name: "Saltmere" } }) }));
vi.mock("pinia", async (importOriginal) => ({ ...(await importOriginal<typeof import("pinia")>()), storeToRefs: (s: object) => ({ activeCampaignId: { value: (s as { activeCampaignId: string }).activeCampaignId } }) }));

describe("useStartScriptoriumDocument", () => {
  const source = { premise: [], truths: [{ id: "t1", title: "x" }], lore: [], forces: [{ id: "f1", title: "f" }], secrets: [], questions: [], places: [], folk: [], factions: [], pantheons: [], deities: [], quests: [], monsters: [], items: [], spells: [] };
  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue({ id: "new-id" });
    mocks.dmSource.mockReset().mockResolvedValue(source);
    mocks.playersSource.mockReset().mockResolvedValue(source);
  });

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

  it("draws a DM's book from the DM's reads, titled for the campaign, and leaves the audience to its default", async () => {
    expect(await useStartScriptoriumDocument().startBookFromCampaign("dm")).toBe("new-id");
    const { book, chapters } = mocks.mutateAsync.mock.calls[0][0];
    expect(mocks.dmSource).toHaveBeenCalledWith("camp-1");
    expect(mocks.playersSource).not.toHaveBeenCalled();
    expect(book).toMatchObject({ kind: "book", campaign_id: "camp-1", title: "Saltmere: the DM's book" });
    expect(book).not.toHaveProperty("audience");
    expect(chapters.length).toBeGreaterThan(0);
  });

  it("marks a players' book for its audience and draws it from the whole party's view alone, with no chapter of the DM's", async () => {
    await useStartScriptoriumDocument().startBookFromCampaign("players");
    const { book, chapters } = mocks.mutateAsync.mock.calls[0][0];
    expect(mocks.playersSource).toHaveBeenCalledWith("camp-1");
    expect(mocks.dmSource).not.toHaveBeenCalled();
    expect(book.audience).toBe("players");
    // The source held a force; a players' book has no chapter for it.
    expect(JSON.stringify(chapters)).not.toContain("f1");
  });

  it("creates nothing when the campaign has nothing to draw from", async () => {
    mocks.dmSource.mockResolvedValue({ ...source, truths: [], forces: [] });
    await expect(useStartScriptoriumDocument().startBookFromCampaign("dm")).rejects.toThrow(/nothing to draw/);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
