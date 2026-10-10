import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import type { ArchivePage, ArchivePageKind } from "@/lib/archiveImport/types";
import type { ImportEntityKind } from "@/types/documentImport.types";
import type { ArchiveDocumentImport } from "@/types/documentImport.types";

const mocks = vi.hoisted(() => ({
  candidates: new Map() as Map<string, Map<string, unknown[]>>,
  loading: { value: false },
  runSweep: vi.fn(),
  room: { value: (_kind: string): number | null => null },
}));

vi.mock("@/composables/campaign/useArchiveImport", () => ({
  useArchiveEntityMatches: () => ({
    candidatesByKind: computed(() => mocks.candidates),
    isLoading: computed(() => mocks.loading.value),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useRunArchiveSweep: () => ({ runSweep: mocks.runSweep }),
}));
vi.mock("@/composables/campaign/useImportQuotaRoom", () => ({
  useImportQuotaRoom: () => ({ roomFor: computed(() => mocks.room.value), isLoading: ref(false) }),
}));
vi.mock("@/components/common/richtext/RichTextViewer.vue", () => ({ default: { template: "<div />" } }));

import ArchiveReviewStep from "./ArchiveReviewStep.vue";

function page(ref: string, kind: ArchivePageKind): ArchivePage {
  return {
    ref,
    path: ref,
    title: ref.replace(".md", ""),
    folders: [],
    parentRef: null,
    kind,
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

const importRow = { id: "row-1", campaign_id: "camp-1", source_paths: [] } as unknown as ArchiveDocumentImport;
const existing: EntityCandidate = { targetId: "npc-existing", source: "campaign", name: "Mara", matchKind: "exact", detail: null, distance: null };

function mountStep(pages: ArchivePage[], kinds = new Map<string, ArchivePageKind>()) {
  return mount(ArchiveReviewStep, { props: { importRow, pages, kinds } });
}
const importButton = (w: ReturnType<typeof mountStep>) => w.findAll("button").find((b) => b.text().startsWith("Import "))!;

beforeEach(() => {
  mocks.candidates = new Map();
  mocks.loading.value = false;
  mocks.runSweep.mockReset();
  mocks.room.value = () => null;
});

describe("ArchiveReviewStep", () => {
  it("lists one section per kind in import order and leaves skipped pages out", () => {
    const wrapper = mountStep(
      [page("A.md", "npc"), page("B.md", "location"), page("C.md", "note"), page("D.md", "faction")],
      new Map([["C.md", "skip"]]),
    );
    const headings = wrapper.findAll("h4").map((h) => h.text());
    expect(headings).toEqual(["Places · 1", "Factions · 1", "NPCs · 1"]);
  });

  it("defaults a page that matches something you own to link, and everything else to create", () => {
    mocks.candidates = new Map([["npcs", new Map([["Mara.md", [existing]]])]]) as typeof mocks.candidates;
    const wrapper = mountStep([page("Mara.md", "npc"), page("Bob.md", "npc")]);
    expect(wrapper.text()).toContain("Links to Mara");
    expect(wrapper.text()).toContain("1 link");
    expect(wrapper.text()).toContain("1 new");
    expect(importButton(wrapper).text()).toBe("Import 1 record");
  });

  it("always creates a quest, even with a same-named candidate", () => {
    mocks.candidates = new Map([["quests", new Map([["The Bell.md", [{ ...existing, targetId: "q" }]]])]]) as typeof mocks.candidates;
    const wrapper = mountStep([page("The Bell.md", "quest")]);
    expect(wrapper.text()).not.toContain("Links to");
    expect(wrapper.text()).toContain("1 new");
  });

  it("waits for the duplicate check before it offers rows", () => {
    mocks.loading.value = true;
    const wrapper = mountStep([page("Mara.md", "npc")]);
    expect(wrapper.text()).toContain("Checking your campaign for matches");
    expect(wrapper.findAll("h4")).toHaveLength(0);
    expect(importButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("blocks Import and says so when the plan has no room for what would be created", () => {
    mocks.room.value = (kind: string) => (kind === ("npcs" satisfies ImportEntityKind) ? 1 : null);
    const wrapper = mountStep([page("A.md", "npc"), page("B.md", "npc")]);
    expect(wrapper.text()).toContain("This would go past your plan's limits");
    expect(importButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("renders a long section fifty rows at a time", async () => {
    const wrapper = mountStep(Array.from({ length: 400 }, (_, i) => page(`P${i}.md`, "note")));
    expect(wrapper.findAll("[aria-controls], button[aria-expanded]")).toHaveLength(50);
    await wrapper.findAll("button").find((b) => b.text().startsWith("Show 50 more"))?.trigger("click");
    expect(wrapper.findAll("button[aria-expanded]")).toHaveLength(100);
  });

  it("hands the sweep every page with its settled kind and decision, then reports done", async () => {
    mocks.candidates = new Map([["npcs", new Map([["Mara.md", [existing]]])]]) as typeof mocks.candidates;
    const run = { report: { created: [] }, finishError: null };
    mocks.runSweep.mockResolvedValue(run);
    const pages = [page("Mara.md", "npc"), page("Diary.md", "note")];
    const wrapper = mountStep(pages);
    await importButton(wrapper).trigger("click");
    await flushPromises();
    const [row, input] = mocks.runSweep.mock.calls[0];
    expect(row).toEqual(importRow);
    expect(input.entries.map((e: { page: ArchivePage; kind: string; decision: { action: string } }) => [e.page.ref, e.kind, e.decision.action])).toEqual([
      ["Mara.md", "npc", "link"],
      ["Diary.md", "note", "create"],
    ]);
    expect(input.allPages).toEqual(pages);
    expect(wrapper.emitted("done")?.[0]).toEqual([run]);
  });

  it("Ignore all turns a section's pages into ignores", async () => {
    const wrapper = mountStep([page("A.md", "note"), page("B.md", "note")]);
    await wrapper.findAll("button").find((b) => b.text() === "Ignore all")?.trigger("click");
    expect(wrapper.text()).toContain("2 ignored");
    expect(importButton(wrapper).text()).toBe("Import 0 records");
  });

  it("says what failed instead of going quiet when the sweep throws", async () => {
    mocks.runSweep.mockRejectedValue(new Error("boom"));
    const wrapper = mountStep([page("A.md", "note")]);
    await importButton(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("boom");
    expect(wrapper.emitted("done")).toBeUndefined();
  });
});
