import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonLorePassage } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
const passages = ref<Partial<CanonLorePassage>[]>([]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }) }));
vi.mock("@/composables/canon/useCanonPassages", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/useCanonPassages")>();
  return { ...real, useCanonPassages: () => ({ data: passages }) };
});
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: (y: number) => `year ${y}` } }) }));
vi.mock("@/composables/useLowArt", () => ({ useLowArt: () => ({ lowArt: ref(true) }) }));

import LoreChapter from "./LoreChapter.vue";

const lore = (id: string, title: string, year: number | null) => canonEntry({ id, part: "lore", title, world_year: year, lore_kind: "history" });
const SuggestStub = { name: "CanonSuggest", props: ["request"], template: "<i data-testid='suggest' :data-request='request' />" };
const mountIt = (entries = [lore("a", "Undated tale", null), lore("b", "Late", 412), lore("c", "Early", 7)], props: Record<string, unknown> = {}) =>
  mount(LoreChapter, { props: { lore: entries, ...props }, global: { stubs: { CanonReview: true, LoreDetail: true, CanonSuggest: SuggestStub, FocalImage: true } } });

describe("LoreChapter", () => {
  beforeEach(() => setActivePinia(createPinia()));
  beforeEach(() => {
    mocks.create.mockReset();
    passages.value = [];
  });

  // Bug caught: lore listed in the order it was made, so a history read out of sequence.
  it("lists dated lore by date in the world and the undated after it, with the date and its kind on each row", () => {
    const rows = mountIt().findAll("li").map((li) => li.text());
    expect(rows[0]).toContain("Early");
    expect(rows[1]).toContain("Late");
    expect(rows[2]).toContain("Undated tale");
    expect(rows[0]).toContain("year 7");
    expect(rows[0]).toContain("History");
  });

  // Bug caught: the first passage counted as untold, or an entry with no passage reading "All told".
  it("signs each row with how much is told: the first passage is told with the entry", () => {
    passages.value = [
      { id: "g1", entry_id: "c", sort_order: 0, created_at: "1", told_at: null },
      { id: "g2", entry_id: "c", sort_order: 1, created_at: "2", told_at: null },
      { id: "g3", entry_id: "c", sort_order: 2, created_at: "3", told_at: "2026-11-02T10:00:00Z" },
      { id: "g4", entry_id: "b", sort_order: 0, created_at: "1", told_at: null },
    ];
    const marks = mountIt().findAll("[data-testid=lore-told]").map((m) => m.text());
    expect(marks).toEqual(["2 of 3 told", "All told", "None told"]);
  });

  // Bug caught: the open entry not marked in the list, or opening a different row than the one tapped.
  it("marks the open entry and selects the tapped one", async () => {
    const entries = [lore("a", "Undated tale", null), lore("c", "Early", 7)];
    const w = mountIt(entries, { selected: entries[1] });
    expect(w.findAll("li").map((li) => li.attributes("data-selected"))).toEqual(["true", "false"]);
    await w.findAll("li")[1]!.get("button").trigger("click");
    expect(w.emitted("select")?.[0]).toEqual(["a"]);
    expect(w.findComponent({ name: "LoreDetail" }).exists()).toBe(true);
  });

  // Bug caught: the empty state asking nothing of the Familiar, or an arc-narrowed list claiming the world has no lore.
  it("says what lore is when there is none, and names the arc when one narrows the list", () => {
    const empty = mountIt([]);
    expect(empty.text()).toContain("No lore yet");
    expect(empty.get("[data-testid=suggest]").attributes("data-request")).toBe("Suggest a piece of lore for my world.");
    expect(mountIt([], { arcLabel: "The Long Winter" }).text()).toContain("Nothing of this chapter is in The Long Winter.");
  });

  it("adds a piece of lore with its title and kind, empties the box and opens the new entry", async () => {
    mocks.create.mockResolvedValue({ id: "l9" });
    const w = mountIt([]);
    await w.find("input[aria-label='A new piece of lore']").setValue("  The Fall ");
    await w.find("select[aria-label='What kind of lore']").setValue("legend");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "lore", title: "The Fall", lore_kind: "legend", sort_order: 0 });
    expect(w.emitted("select")?.[0]).toEqual(["l9"]);
  });

  it("keeps the words and selects nothing when the create fails", async () => {
    mocks.create.mockImplementation(() => Promise.reject(new Error("no")));
    const w = mountIt([]);
    const input = w.find("input[aria-label='A new piece of lore']");
    await input.setValue("The Fall");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe("The Fall");
    expect(w.emitted("select")).toBeUndefined();
  });

  it("offers no manual order, since lore reads by its date", () => {
    const w = mountIt([lore("a", "Flood", 1), lore("b", "Mill", 2)]);
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
  });

  // Bug caught: a lore draft from the Familiar landed under a key no chapter reads, so it never showed up to accept.
  it("reviews the Familiar's new-lore drafts in its own toolbar, and opens one that is accepted", () => {
    const w = mountIt([lore("a", "Flood", 1)]);
    const review = w.findComponent({ name: "CanonReview" });
    expect(review.props()).toMatchObject({ mode: "lore", lore: { entryId: null } });
    review.vm.$emit("accepted", "l9");
    expect(w.emitted("select")?.[0]).toEqual(["l9"]);
  });
});
