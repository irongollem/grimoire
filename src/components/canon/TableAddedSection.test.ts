import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { StoryFact } from "@/lib/table/solo/storyRecord";

const facts = ref<StoryFact[]>([]);
const mocks = vi.hoisted(() => ({
  keep: vi.fn(), strike: vi.fn(), undoStrike: vi.fn(), makeTruth: vi.fn(), correct: vi.fn(),
  error: vi.fn(), success: vi.fn(),
}));
const pending = { isPending: { value: false } };
vi.mock("@/composables/canon/useTableFacts", () => ({
  useTableFacts: () => ({ facts: { data: facts, isLoading: ref(false), isError: ref(false) }, links: { data: ref([]) } }),
  useTableFactWrites: () => ({
    keep: { mutateAsync: mocks.keep }, strike: { mutateAsync: mocks.strike }, undoStrike: { mutateAsync: mocks.undoStrike },
    makeTruth: { mutateAsync: mocks.makeTruth }, correct: { mutateAsync: mocks.correct, ...pending },
  }),
}));
vi.mock("@/composables/table/useFactAbout", () => ({ useFactAbout: () => () => [] }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.error, success: mocks.success, fromError: (_e: unknown, m: string) => m }) }));
vi.mock("vue-router", () => ({ RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } }));
const tableOpen = ref(true);
vi.mock("@/composables/campaign/useTableAccess", () => ({ useTableAccess: () => ({ open: tableOpen }) }));

import { useCanonUiStore } from "@/stores/ui/canon";
import TableAddedSection from "./TableAddedSection.vue";
import { canonEntry } from "@/test/canonEntry";

const fact = (id: string, over: Partial<StoryFact> = {}): StoryFact => ({
  id, campaign_id: "c1", session_id: null, body: `Fact ${id}`, known_to_player: true, supersedes_id: null, source: "table",
  kept_at: null, struck_at: null, created_at: `2026-11-10T10:00:0${id.length}Z`, ...over,
});

const TRUTHS = [canonEntry({ id: "t1" }), canonEntry({ id: "t2" })];
const mountIt = (truths = TRUTHS) =>
  mount(TableAddedSection, {
    props: { truths },
    global: { stubs: { SoloCorrectDialog: true, OverflowMenu: { emits: ["select"], template: "<button data-testid='more' @click=\"$emit('select', 'truth')\" />" } } },
  });
const button = (w: ReturnType<typeof mountIt>, label: string) => w.findAll("button, a").find((b) => b.text() === label);

describe("TableAddedSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.keep.mockResolvedValue(undefined);
    mocks.strike.mockResolvedValue(undefined);
    mocks.undoStrike.mockResolvedValue(undefined);
    mocks.makeTruth.mockResolvedValue("t1");
    facts.value = [fact("a"), fact("bb", { kept_at: "2026-11-11T10:00:00Z" })];
    tableOpen.value = true;
  });

  // Bug caught: the default list showing lines the DM already reviewed, so there was never a clear "to do" list.
  it("opens on what is new", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=table-fact]").map((r) => r.text())).toHaveLength(1);
    expect(w.text()).toContain("Fact a");
    expect(w.text()).not.toContain("Fact bb");
  });

  // Bug caught: a strike with no way back, because the struck line fell out of the New list with its Undo.
  it("keeps a struck line on screen with Undo, and Undo hands back the earlier keep", async () => {
    facts.value = [fact("a", { kept_at: "2026-11-11T10:00:00Z" })];
    useCanonUiStore().tableFactFilter = "kept";
    const w = mountIt();
    // The record refreshes while the write is still settling, as the mutation's own refresh does.
    let finish!: () => void;
    mocks.strike.mockImplementation(async () => {
      facts.value = [fact("a", { struck_at: "2026-11-12T10:00:00Z" })];
      await new Promise<void>((resolve) => (finish = resolve));
    });
    await button(w, "Strike")!.trigger("click");
    await flushPromises();
    expect(w.find("[data-testid=table-fact-struck]").exists()).toBe(true);
    finish();
    await flushPromises();
    expect(mocks.strike).toHaveBeenCalledTimes(1);
    expect(w.find("[data-testid=table-fact-struck]").exists()).toBe(true);
    await button(w, "Undo")!.trigger("click");
    await flushPromises();
    expect(mocks.undoStrike).toHaveBeenCalledWith({ fact: expect.objectContaining({ id: "a" }), previousKeptAt: "2026-11-11T10:00:00Z" });
  });

  // Bug caught: Keep offered on a line already kept, or Edit and Strike withheld from it.
  it("offers Keep only on a new line, and Edit and Strike on a kept one", () => {
    useCanonUiStore().tableFactFilter = "kept";
    const w = mountIt();
    expect(button(w, "Keep")).toBeUndefined();
    expect(button(w, "Edit")).toBeDefined();
    expect(button(w, "Strike")).toBeDefined();
  });

  // Bug caught: a failed Keep announced as a success, or left listed as if it had happened.
  it("says so and writes nothing more when a keep fails", async () => {
    mocks.keep.mockRejectedValue(new Error("no"));
    const w = mountIt();
    await button(w, "Keep")!.trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("That could not be kept.");
  });

  // Bug caught: Make it a truth filed at the wrong position, ignoring the truths already there.
  it("makes a truth through the menu, after the existing truths", async () => {
    const w = mountIt();
    await w.find("[data-testid=more]").trigger("click");
    await flushPromises();
    expect(mocks.makeTruth).toHaveBeenCalledWith({ fact: expect.objectContaining({ id: "a" }), sortOrder: 2 });
  });

  // Bug caught: Clear missing once a filter other than New is chosen.
  it("shows Clear only away from New, and Clear returns to it", async () => {
    const w = mountIt();
    expect(button(w, "Clear")).toBeUndefined();
    useCanonUiStore().tableFactFilter = "all";
    await flushPromises();
    await button(w, "Clear")!.trigger("click");
    expect(useCanonUiStore().tableFactFilter).toBe("new");
  });

  // Bug caught: a campaign where the table never added anything saying "Everything has been reviewed", and offering a filter over nothing.
  it("says the table has added nothing, with no filter, when there are no facts at all", () => {
    facts.value = [];
    const w = mountIt();
    expect(w.text()).toContain("The table has added nothing");
    expect(w.text()).not.toContain("Nothing new");
    expect(w.find("[role=radiogroup], [aria-label=Show]").exists()).toBe(false);
  });

  // Bug caught: the no-facts words swallowing the reviewed-everything state, so a DM who kept every line is told the table added nothing.
  it("still says nothing is new when every fact has been reviewed", () => {
    facts.value = [fact("a", { kept_at: "2026-11-11T10:00:00Z" })];
    const w = mountIt();
    expect(w.text()).toContain("Nothing new");
    expect(w.find("[aria-label=Show]").exists()).toBe(true);
  });

  // Bug caught (#1255 item 22): a fact already filed as a truth still offering Make it a truth, so it could be filed twice.
  it("links a fact that is already a truth to it and offers no Make it a truth", () => {
    const w = mountIt([canonEntry({ id: "t9", from_fact_id: "a" })]);
    expect(w.find("[data-testid=more]").exists()).toBe(false);
    const link = w.findAll("a").find((b) => b.text() === "Now a truth");
    expect(link!.attributes("href")).toBe("/canon?entry=t9");
  });

  // Bug caught: a second truth refused by the database (two tabs) reported as a generic failure, or still toasting success.
  it("says the line is already a truth when the database refuses a second one", async () => {
    mocks.makeTruth.mockRejectedValue({ code: "23505", message: "duplicate key" });
    const w = mountIt();
    await w.find("[data-testid=more]").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("That line is already a truth.");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  // Bug caught (#1255 item 23): the Canon side giving no way to the place where a fact of your own is added.
  it("points to the story record only where the AI table is open", async () => {
    const w = mountIt();
    expect(w.find("[data-testid=table-story-link]").text()).toContain("Add a fact of your own, or reveal one");
    tableOpen.value = false;
    await flushPromises();
    expect(w.find("[data-testid=table-story-link]").exists()).toBe(false);
  });
});
