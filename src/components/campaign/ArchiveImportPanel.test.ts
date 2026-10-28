import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { buildArchiveManifest } from "@/lib/archiveImport/archiveManifest";
import type { ArchiveDocumentImport } from "@/types/documentImport.types";

const mocks = vi.hoisted(() => ({ abandon: vi.fn(async () => undefined), confirm: vi.fn(async () => true), create: vi.fn() }));

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, fallback: string) => fallback, info: vi.fn() }) }));
vi.mock("@/composables/campaign/useDocumentImport", () => ({
  useAbandonDocumentImport: () => ({ mutateAsync: mocks.abandon, isPending: ref(false) }),
}));
vi.mock("@/composables/campaign/useArchiveImport", () => ({
  useCreateArchiveImport: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
}));
// The review step has its own concerns (matches, quota, the sweep); here only what the panel hands it matters.
vi.mock("@/components/campaign/ArchiveReviewStep.vue", () => ({
  default: {
    name: "ArchiveReviewStep",
    props: ["importRow", "pages", "kinds"],
    template: "<div class='review-stub' />",
  },
}));

import ArchiveImportPanel from "./ArchiveImportPanel.vue";
import ArchiveFilePicker from "./ArchiveFilePicker.vue";

const md = (name: string, text: string) => new File([text], name, { type: "text/markdown" });

function interruptedRow(): ArchiveDocumentImport {
  const manifest = buildArchiveManifest(
    "obsidian",
    [
      { ref: "Mara.md", title: "Mara", kind: "note" as const },
      { ref: "Dunmere.md", title: "Dunmere", kind: "note" as const },
    ].map((p) => ({ ...p, path: p.ref, folders: [], parentRef: null, kindReason: "", tags: [], aliases: [], frontmatter: {}, body: { type: "doc" as const, content: [] }, links: [], notes: [], format: "markdown" as const })),
    new Map([["Mara.md", "npc"], ["Dunmere.md", "location"]]),
  );
  return {
    id: "row-1",
    user_id: "u",
    campaign_id: "c",
    source_kind: "archive",
    source_paths: [],
    display_name: "My vault",
    page_count: 2,
    status: "review",
    extracted: manifest,
    imported_counts: {},
    rights_attested_at: "2026-10-07T00:00:00Z",
    ai_provenance: null,
    error: null,
    expires_at: "2026-11-07T00:00:00Z",
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
  };
}

describe("ArchiveImportPanel", () => {
  it("starts on the file picker, naming the apps it reads and saying nothing is sent to AI", () => {
    const wrapper = mount(ArchiveImportPanel);
    const text = wrapper.text();
    for (const app of ["LegendKeeper", "World Anvil", "Obsidian"]) expect(text).toContain(app);
    expect(text).toContain("No AI and no credits");
    expect(text).toContain("Nothing is shared with players");
  });

  it("offers a folder as well as files, and the file types it reads", () => {
    const wrapper = mount(ArchiveImportPanel);
    const inputs = wrapper.findAll("input[type=file]");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].attributes("accept")).toBe(".zip,.md,.markdown,.html,.htm,.json");
    expect(inputs[1].attributes("webkitdirectory")).toBeDefined();
  });

  it("reads picked files and moves to the sort step", async () => {
    const wrapper = mount(ArchiveImportPanel);
    wrapper.findComponent(ArchiveFilePicker).vm.$emit("picked", [md("Mara.md", "# Mara\n\nAn innkeeper."), md("Dunmere.md", "A town.")]);
    await flushPromises();
    expect(wrapper.text()).toContain("2 pages found");
  });

  it("says so when an export holds nothing it can read", async () => {
    const wrapper = mount(ArchiveImportPanel);
    wrapper.findComponent(ArchiveFilePicker).vm.$emit("picked", [new File(["x"], "photo.png")]);
    await flushPromises();
    expect(wrapper.text()).toContain("No pages Grimoire can read");
  });

  it("shows the interrupted state for a row in review with no pages in memory, and offers to abandon it", async () => {
    const wrapper = mount(ArchiveImportPanel, { props: { importRow: interruptedRow() } });
    expect(wrapper.text()).toContain("This wiki import was interrupted");
    expect(wrapper.text()).toContain("drop the same export again");
    await wrapper.findAll("button").find((b) => b.text() === "Abandon")?.trigger("click");
    await flushPromises();
    expect(mocks.abandon).toHaveBeenCalledWith({ id: "row-1", source_paths: [] });
  });

  it("restores each page's settled kind by ref when the same export is dropped again, and goes straight to review", async () => {
    const wrapper = mount(ArchiveImportPanel, { props: { importRow: interruptedRow() } });
    wrapper.findComponent(ArchiveFilePicker).vm.$emit("picked", [md("Mara.md", "An innkeeper."), md("Dunmere.md", "A town.")]);
    await flushPromises();
    const review = wrapper.findComponent({ name: "ArchiveReviewStep" });
    expect(review.exists()).toBe(true);
    const kinds = review.props("kinds") as Map<string, string>;
    expect(kinds.get("Mara.md")).toBe("npc");
    expect(kinds.get("Dunmere.md")).toBe("location");
  });

  it("refuses a different export for an interrupted row", async () => {
    const wrapper = mount(ArchiveImportPanel, { props: { importRow: interruptedRow() } });
    wrapper.findComponent(ArchiveFilePicker).vm.$emit("picked", [md("Other.md", "Something else.")]);
    await flushPromises();
    expect(wrapper.text()).toContain("does not look like the export");
    expect(wrapper.findComponent({ name: "ArchiveReviewStep" }).exists()).toBe(false);
  });

  describe("leaving the sort step", () => {
    async function sorted() {
      const wrapper = mount(ArchiveImportPanel);
      wrapper.findComponent(ArchiveFilePicker).vm.$emit("picked", [md("Mara.md", "# Mara\n\nAn innkeeper."), md("Dunmere.md", "A town.")]);
      await flushPromises();
      return wrapper;
    }
    const goOn = (w: Awaited<ReturnType<typeof sorted>>) => w.findAll("button").find((b) => b.text().startsWith("Continue"))!;

    it("will not continue until the DM has ticked that they hold the rights", async () => {
      const wrapper = await sorted();
      expect(goOn(wrapper).attributes("disabled")).toBeDefined();
      await wrapper.find("input[type=checkbox]").setValue(true);
      expect(goOn(wrapper).attributes("disabled")).toBeUndefined();
    });

    it("creates the import with the name trimmed and the rights attested, then hands the row to review", async () => {
      const created = { ...interruptedRow(), id: "new-row" };
      mocks.create.mockResolvedValue(created);
      const wrapper = await sorted();
      await wrapper.find("input[placeholder^='e.g.']").setValue("  My vault  ");
      await wrapper.find("input[type=checkbox]").setValue(true);
      await goOn(wrapper).trigger("click");
      await flushPromises();
      // Loose markdown files carry no vault marker, so the export is not recognised as any one app.
      const [payload] = mocks.create.mock.calls[0];
      expect(payload).toMatchObject({ displayName: "My vault", rightsAttested: true, source: "unknown" });
      expect(payload.pages.map((p: { ref: string }) => p.ref).sort()).toEqual(["Dunmere.md", "Mara.md"]);
      expect(wrapper.findComponent({ name: "ArchiveReviewStep" }).props("importRow")).toEqual(created);
    });

    it("stays on the sort step and says so when the import cannot be created", async () => {
      mocks.create.mockRejectedValue(new Error("nope"));
      const wrapper = await sorted();
      await wrapper.find("input[placeholder^='e.g.']").setValue("My vault");
      await wrapper.find("input[type=checkbox]").setValue(true);
      await goOn(wrapper).trigger("click");
      await flushPromises();
      expect(wrapper.text()).toContain("Could not start the import.");
      expect(wrapper.findComponent({ name: "ArchiveReviewStep" }).exists()).toBe(false);
    });
  });
});
