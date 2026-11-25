import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CanonOpenAsBook from "./CanonOpenAsBook.vue";

const mocks = vi.hoisted(() => ({ start: vi.fn(), push: vi.fn(), error: vi.fn(), docs: [] as unknown[] }));
vi.mock("@/scriptorium/composables/useStartScriptoriumDocument", () => ({
  useStartScriptoriumDocument: () => ({ startBookFromCampaign: mocks.start, isStarting: ref(false) }),
}));
vi.mock("@/scriptorium/composables/useScriptorium", () => ({
  useScriptoriumDocuments: () => ({ data: ref(mocks.docs), refetch: vi.fn() }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { name: "Kind Country" } }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.error, fromError: (e: Error) => e.message }),
}));

const book = (over: Record<string, unknown>) => ({
  id: "d",
  campaign_id: "c1",
  kind: "book",
  doc_type: "custom",
  audience: "dm",
  drawn_from: "canon",
  title: "Kind Country: the DM's book",
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

async function click() {
  const w = mount(CanonOpenAsBook);
  await w.find("button").trigger("click");
  await flushPromises();
}

describe("CanonOpenAsBook", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.push.mockReset();
    mocks.error.mockReset();
    mocks.docs = [];
  });

  // Bug caught: every click drawing a new document instead of reopening the book already drawn.
  it("opens the newest DM's book this campaign already drew, drawing nothing", async () => {
    mocks.docs = [
      book({ id: "old" }),
      book({ id: "new", created_at: "2026-11-20T00:00:00Z" }),
      book({ id: "other-campaign", campaign_id: "c2", created_at: "2026-11-23T00:00:00Z" }),
      book({ id: "players", title: "Kind Country: the players' book", audience: "players", created_at: "2026-11-23T00:00:00Z" }),
    ];
    await click();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/new");
  });

  // Bug caught (#1279 item 23): a book the DM renamed was not recognised, so "Open as a book" drew a second copy of the
  // canon; or a book the DM wrote by hand under the same title was taken for the drawn one.
  it("opens a renamed book by where it was drawn from, never a book the DM made", async () => {
    mocks.docs = [
      book({ id: "renamed", title: "Our campaign bible" }),
      book({ id: "hand-made", title: "Kind Country: the DM's book", drawn_from: null, created_at: "2026-11-24T00:00:00Z" }),
    ];
    await click();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/renamed");
  });

  // Bug caught: drawing the players' book (or none) from the DM's Canon, or not opening what was drawn.
  it("draws the DM's book and opens it when none exists", async () => {
    mocks.start.mockResolvedValue("doc-9");
    await click();
    expect(mocks.start).toHaveBeenCalledWith("dm");
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/doc-9");
  });

  // Bug caught: a failed draw navigating anyway, or failing silently.
  it("toasts the reason and stays put when drawing fails", async () => {
    mocks.start.mockRejectedValue(new Error("The campaign has nothing to draw a book from yet."));
    await click();
    expect(mocks.error).toHaveBeenCalledWith("The campaign has nothing to draw a book from yet.");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
