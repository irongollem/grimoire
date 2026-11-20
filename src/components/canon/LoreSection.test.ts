import { beforeEach, describe, expect, it, vi } from "vitest";
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

import LoreSection from "./LoreSection.vue";

const lore = (id: string, title: string, year: number | null) => canonEntry({ id, part: "lore", title, world_year: year, lore_kind: "history" });
const mountIt = (entries = [lore("a", "Undated tale", null), lore("b", "Late", 412), lore("c", "Early", 7)]) =>
  mount(LoreSection, { props: { lore: entries }, global: { stubs: { CanonSuggestions: true, LoreRow: false, FocalImage: true } } });

describe("LoreSection", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    passages.value = [];
  });

  it("lists dated lore by date in the world and the undated after it, with the date and its kind on each row", () => {
    const w = mountIt();
    const titles = w.findAll("li").map((li) => li.text());
    expect(titles[0]).toContain("Early");
    expect(titles[1]).toContain("Late");
    expect(titles[2]).toContain("Undated tale");
    expect(titles[0]).toContain("year 7");
    expect(titles[0]).toContain("History");
  });

  it("shows how much of an entry is told: its first passage counts as told with the entry", () => {
    passages.value = [
      { id: "g1", entry_id: "c", sort_order: 0, created_at: "1", told_at: null },
      { id: "g2", entry_id: "c", sort_order: 1, created_at: "2", told_at: null },
      { id: "g3", entry_id: "c", sort_order: 2, created_at: "3", told_at: "2026-11-02T10:00:00Z" },
    ];
    expect(mountIt().findAll("li")[0]!.text()).toContain("Told 2 of 3");
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
});
