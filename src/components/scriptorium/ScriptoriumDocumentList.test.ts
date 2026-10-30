import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import ScriptoriumDocumentList from "./ScriptoriumDocumentList.vue";
import { useScriptoriumUiStore } from "@/stores/ui/scriptorium";

useVirtualGridViewport({ viewportPx: 1000000, itemPx: 147 });

const base = {
  doc_type: "custom",
  campaign_id: null,
  tags: [],
  is_published: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  word_count: 212,
  scriptorium_chapters: [{ count: 1 }],
};
const docs = [
  { ...base, id: "h1", title: "A Letter from the Bell-Mother", kind: "handout", theme: "letter", player_visible_to: ["p1", "p2"] },
  { ...base, id: "b1", title: "Sothery", kind: "book", theme: "onednd2024", player_visible_to: [], word_count: 185103, scriptorium_chapters: [{ count: 15 }] },
  { ...base, id: "h2", title: "Wanted: the Smudge Eel", kind: "handout", theme: "notice", player_visible_to: [] },
];

const mocks = vi.hoisted(() => ({ docs: { value: [] as unknown[] } }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useScriptoriumDocuments: () => ({ data: ref(mocks.docs.value), isLoading: ref(false) }),
  useDeleteScriptoriumDocument: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([
      { id: "p1", name: "Pip" },
      { id: "p2", name: "Wren" },
      { id: "p3", name: "Bramble" },
    ]),
  }),
}));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useAllDmCampaigns: () => ({ data: ref([]) }) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ quota: ref(null) }) }));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()), useAbove: () => ref(true) }));

async function mountList() {
  const w = mount(ScriptoriumDocumentList, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return w;
}
const kindButton = (w: Awaited<ReturnType<typeof mountList>>, label: string) =>
  w.findAll("button").find((b) => b.text() === label)!;

describe("ScriptoriumDocumentList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.docs.value = docs;
  });

  it("says on every card what it is: a handout by its paper and holders, a book by its size", async () => {
    const text = (await mountList()).text();
    expect(text).toContain("Letter · with Pip and Wren");
    expect(text).toContain("Notice · not given yet");
    expect(text).toContain("15 chapters · 185,103 words");
  });

  it("Handouts shows only handouts, and Clear brings the books back", async () => {
    const w = await mountList();
    await kindButton(w, "Handouts").trigger("click");
    expect(w.text()).toContain("A Letter from the Bell-Mother");
    expect(w.text()).not.toContain("Sothery");
    await w.findAll("button").find((b) => b.text().includes("Clear filters"))!.trigger("click");
    expect(useScriptoriumUiStore().scriptoriumFilterKind).toBe("all");
    expect(w.text()).toContain("Sothery");
  });

  it("Books shows only books", async () => {
    const w = await mountList();
    await kindButton(w, "Books").trigger("click");
    expect(w.text()).toContain("Sothery");
    expect(w.text()).not.toContain("A Letter from the Bell-Mother");
    expect(w.text()).not.toContain("Wanted: the Smudge Eel");
  });

  it("keeps the kind across leaving and coming back, because it lives in the store", async () => {
    const first = await mountList();
    await kindButton(first, "Books").trigger("click");
    first.unmount();
    const again = await mountList();
    expect(again.text()).not.toContain("A Letter from the Bell-Mother");
  });

  it("tells a writer where to start when there is nothing yet", async () => {
    mocks.docs.value = [];
    expect((await mountList()).text()).toContain("Start with New handout or New book");
  });
});
