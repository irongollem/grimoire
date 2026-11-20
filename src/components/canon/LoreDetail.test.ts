import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonLorePassage } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), createPassage: vi.fn(), updatePassage: vi.fn(), destroyPassage: vi.fn() }));
const passages = ref<CanonLorePassage[]>([]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));
vi.mock("@/composables/canon/useCanonPassages", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/useCanonPassages")>();
  return {
    ...real,
    useCanonPassages: () => ({ data: passages }),
    useCreateCanonPassage: () => ({ mutateAsync: mocks.createPassage, isPending: ref(false) }),
    useUpdateCanonPassage: () => ({ mutateAsync: mocks.updatePassage }),
    useDeleteCanonPassage: () => ({ mutateAsync: mocks.destroyPassage }),
  };
});
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { epochName: "DR", months: [{ num: 1, name: "Hammer", days: 30 }], formatDate: (y: number, m: number | null) => `${m ?? "-"}/${y}` } }),
}));

import LoreDetail from "./LoreDetail.vue";

const p = (id: string, sort: number): CanonLorePassage => ({
  id, user_id: "u", campaign_id: "c", entry_id: "l1", title: id, body: null, sort_order: sort, player_visible_to: [], told_at: null, told_session_id: null,
  location_id: null, npc_id: null, quest_beat_id: null, ai_provenance: null, created_at: `2026-11-19T10:00:0${sort}Z`, updated_at: "",
});

const mountIt = (over = {}) =>
  mount(LoreDetail, {
    props: { entry: canonEntry({ id: "l1", part: "lore", title: "The Fall", ...over }) },
    global: { stubs: { EntityImageBlock: true, AudienceRevealControl: true, ConnectionsSection: true, CanonSuggestions: true, LorePassageRow: { props: ["passage"], emits: ["move", "remove"], template: "<li data-testid='row'>{{ passage.id }}<button data-testid='up' @click=\"$emit('move', -1)\" /><button data-testid='rm' @click=\"$emit('remove')\" /></li>" } } },
  });

describe("LoreDetail", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.createPassage.mockResolvedValue({});
    mocks.updatePassage.mockResolvedValue(undefined);
    passages.value = [];
  });

  it("clears the month and day with the year, so the table never gets a month with no year", async () => {
    const w = mountIt({ world_year: 5, world_month: 1, world_day: 3 });
    const year = w.find("input[aria-label=Year]");
    (year.element as HTMLInputElement).value = "";
    await year.trigger("change");
    expect(mocks.update).toHaveBeenCalledWith({ id: "l1", patch: { world_year: null, world_month: null, world_day: null } });
  });

  it("writes the kind the DM picks, and none for 'Any kind'", async () => {
    const w = mountIt();
    await w.find("select[aria-label='What kind of lore']").setValue("magic");
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "l1", patch: { lore_kind: "magic" } });
    await w.find("select[aria-label='What kind of lore']").setValue("");
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "l1", patch: { lore_kind: null } });
  });

  it("adds a passage after the last, whatever the gaps in the order, so a new passage never jumps ahead", async () => {
    passages.value = [p("a", 0), p("b", 7)];
    const w = mountIt();
    await w.findAll("button").find((b) => b.text() === "Add a passage")!.trigger("click");
    expect(mocks.createPassage).toHaveBeenCalledWith({ entry_id: "l1", sort_order: 8 });
  });

  it("moves a passage earlier by renumbering from position, so equal sort orders still reorder", async () => {
    passages.value = [p("a", 0), p("b", 0), p("c", 0)];
    const w = mountIt();
    await w.findAll("[data-testid=up]")[2]!.trigger("click");
    await flushPromises();
    // c and b swap: the order is a, c, b, and only the rows whose number is wrong are written.
    expect(mocks.updatePassage).toHaveBeenCalledWith({ id: "c", patch: { sort_order: 1 } });
    expect(mocks.updatePassage).toHaveBeenCalledWith({ id: "b", patch: { sort_order: 2 } });
    expect(mocks.updatePassage).not.toHaveBeenCalledWith({ id: "a", patch: { sort_order: 0 } });
  });

  it("offers Split only when the entry has text to split", () => {
    expect(mountIt().findComponent({ name: "CanonSuggestions" }).exists()).toBe(false);
  });
});
