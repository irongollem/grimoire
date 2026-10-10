import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import type { ArchiveSweepRun } from "@/composables/campaign/useArchiveImport";
import type { ArchivePage } from "@/lib/archiveImport/types";

const mocks = vi.hoisted(() => ({
  aiEnabled: true,
  isPro: false,
  createImport: vi.fn(),
  startExtraction: vi.fn(),
  requireCredits: vi.fn(() => true),
}));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return mocks.aiEnabled; } }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, f: string) => f, info: vi.fn() }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ get isPro() { return ref(mocks.isPro); } }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: mocks.requireCredits }) }));
vi.mock("@/composables/campaign/useDocumentImport", () => ({
  useCreateDocumentImport: () => ({ mutateAsync: mocks.createImport }),
  useStartExtraction: () => ({ mutateAsync: mocks.startExtraction }),
  useImportCost: (pages: () => number) => ({
    estimate: ref({ baseCredits: 1, perPageCredits: 2, pageCount: pages(), totalCredits: 1 + 2 * pages() }),
    isLoading: ref(false),
    isError: ref(false),
  }),
}));

vi.mock("@/components/common/ai/GenerationCostBadge.vue", () => ({ default: { props: ["credits"], template: "<span class='cost'>{{ credits }} credits</span>" } }));
vi.mock("@/components/billing/ProFeatureGate.vue", () => ({ default: { props: ["message"], template: "<p class='gate'>{{ message }}</p>" } }));

import ArchiveResultStep from "./ArchiveResultStep.vue";

function page(ref: string, text = "Body text."): ArchivePage {
  return {
    ref,
    path: ref,
    title: ref.replace(".md", ""),
    folders: [],
    parentRef: null,
    kind: "npc",
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: {},
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    links: [],
    notes: [],
    format: "markdown",
  };
}

function run(over: Partial<ArchiveSweepRun["report"]> = {}): ArchiveSweepRun {
  const empty = { created: 0, linked: 0, ignored: 0, failed: 0, stoppedAtQuota: false };
  return {
    finishError: null,
    report: {
      perKind: { npc: { ...empty, created: 2, linked: 1 }, location: { ...empty, created: 1 }, faction: empty, item: empty, quest: empty, note: { ...empty, failed: 1 } },
      failures: [{ ref: "x.md", title: "X", kind: "note", message: "boom" }],
      unresolvedLinks: [{ page: "Mara", target: "Nowhere", reason: "not found in this export" }],
      notes: [],
      created: [{ ref: "Mara.md", kind: "npc", id: "1" }, { ref: "Bob.md", kind: "npc", id: "2" }, { ref: "Dunmere.md", kind: "location", id: "3" }],
      ...over,
    },
  };
}

const pages = [page("Mara.md"), page("Bob.md"), page("Dunmere.md"), page("Never imported.md")];
const router = createRouter({
  history: createMemoryHistory(),
  routes: ["/npcs", "/locations", "/factions", "/vault", "/quests", "/notes"].map((path) => ({ path, component: { template: "<div />" } })),
});
const mountResult = () => mount(ArchiveResultStep, { props: { run: run(), pages, displayName: "My vault" }, global: { plugins: [router] } });
const startButton = (w: ReturnType<typeof mountResult>) => w.findAll("button").find((b) => b.text() === "Extract details with AI")!;

beforeEach(() => {
  mocks.aiEnabled = true;
  mocks.isPro = false;
  mocks.createImport.mockReset().mockResolvedValue({ id: "text-row" });
  mocks.startExtraction.mockReset().mockResolvedValue({ status: "review" });
  mocks.requireCredits.mockReset().mockReturnValue(true);
});

describe("ArchiveResultStep", () => {
  it("shows counts per kind that had anything, with a View link to each list that gained rows", () => {
    const wrapper = mountResult();
    expect(wrapper.text()).toContain("2 created, 1 linked");
    expect(wrapper.text()).toContain("1 failed");
    expect(wrapper.text()).not.toContain("Factions");
    const links = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(links).toEqual(expect.arrayContaining(["/npcs", "/locations"]));
    expect(links).not.toContain("/notes");
  });

  it("lists failures and the links left as plain text", async () => {
    const wrapper = mountResult();
    expect(wrapper.text()).toContain("boom");
    await wrapper.findAll("button").find((b) => b.text().includes("1 link left as plain text"))?.trigger("click");
    expect(wrapper.text()).toContain("not found in this export");
  });

  it("offers only the pages this import created to the AI pass, none ticked by default", () => {
    const wrapper = mountResult();
    expect(wrapper.text()).toContain("0 of 3 ticked");
    expect(wrapper.text()).not.toContain("Never imported");
    expect(startButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("is hidden with a one-line reason when the campaign has AI off", () => {
    mocks.aiEnabled = false;
    const wrapper = mountResult();
    expect(wrapper.text()).toContain("AI is turned off for this campaign");
    expect(wrapper.findAll("input[type=checkbox]")).toHaveLength(0);
  });

  it("shows the page budget and cost for what is ticked, then sends it as one text import and starts it", async () => {
    const wrapper = mountResult();
    const boxes = wrapper.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    expect(wrapper.text()).toContain("2 of 3 ticked");
    expect(wrapper.text()).toContain("1 page of text");
    expect(wrapper.text()).toContain("up to 10 pages on your plan");
    expect(wrapper.text()).toContain("1 base + 2 × 1 pages");

    await startButton(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.requireCredits).toHaveBeenCalledWith(3);
    const input = mocks.createImport.mock.calls[0][0];
    expect(input).toMatchObject({ files: [], sourceKind: "text", pageCount: 1, rightsAttested: true, displayName: "My vault (selected pages)" });
    expect(input.sourceText).toBe("# Mara\n\nBody text.\n\n# Dunmere\n\nBody text.");
    expect(mocks.startExtraction).toHaveBeenCalledWith("text-row");
  });

  it("does not start when the credits are not there", async () => {
    mocks.requireCredits.mockReturnValue(false);
    const wrapper = mountResult();
    await wrapper.findAll("input[type=checkbox]")[0].setValue(true);
    await startButton(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.createImport).not.toHaveBeenCalled();
  });

  it("keeps the page cap: too much ticked offers the upgrade and blocks the start", async () => {
    const big = Array.from({ length: 4 }, (_, i) => page(`Big${i}.md`, "word ".repeat(10_000)));
    const created = big.map((p, i) => ({ ref: p.ref, kind: "npc" as const, id: String(i) }));
    const wrapper = mount(ArchiveResultStep, { props: { run: run({ created }), pages: big, displayName: "x" }, global: { plugins: [router] } });
    for (const box of wrapper.findAll("input[type=checkbox]")) await box.setValue(true);
    expect(wrapper.text()).toContain("Free accounts are limited to 10 pages");
    expect(startButton(wrapper).attributes("disabled")).toBeDefined();
  });
});
