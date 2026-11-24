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
    useDeleteCanonPassage: () => ({ mutateAsync: mocks.destroyPassage }),
  };
});
vi.mock("@/composables/canon/useCanonPassageEdits", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonPassageEdits")>()),
  useUpdateCanonPassage: () => ({ mutateAsync: mocks.updatePassage }),
}));
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { epochName: "DR", months: [{ num: 1, name: "Hammer", days: 30 }], formatDate: (y: number, m: number | null) => `${m ?? "-"}/${y}` } }),
}));

const questData = vi.hoisted(() => ({ quests: [] as unknown[] }));
vi.mock("@/composables/canon/useCanonForces", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({ data: { value: { steps: [], ticks: [], quests: questData.quests } } }),
}));
const EntryQuestsStub = { name: "EntryQuests", props: ["entry", "links", "label", "empty"], template: "<div data-testid='entry-quests' />" };
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import LoreDetail from "./LoreDetail.vue";

const p = (id: string, sort: number): CanonLorePassage => ({
  id, user_id: "u", campaign_id: "c", entry_id: "l1", title: id, body: null, sort_order: sort, player_visible_to: [], told_at: null, told_session_id: null,
  location_id: null, npc_id: null, quest_beat_id: null, author_id: "u", ai_provenance: null, created_at: `2026-11-19T10:00:0${sort}Z`, updated_at: "",
});

const mountIt = (over = {}) =>
  mount(LoreDetail, {
    props: { entry: canonEntry({ id: "l1", part: "lore", title: "The Fall", ...over }) },
    global: { stubs: { EntryQuests: EntryQuestsStub, EntryStoryLinks: { props: ["entry"], template: "<div data-testid='story-links' :data-id='entry.id' />" }, EntityImageBlock: true, AudienceRevealControl: true, ConnectionsSection: true, CanonSuggestions: true, LorePassageRow: { props: ["passage"], emits: ["move", "remove"], template: "<li data-testid='row'>{{ passage.id }}<button data-testid='up' @click=\"$emit('move', -1)\" /><button data-testid='rm' @click=\"$emit('remove')\" /></li>" } } },
  });

describe("LoreDetail", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.createPassage.mockResolvedValue({});
    mocks.updatePassage.mockResolvedValue(undefined);
    passages.value = [];
  });

  // Bug: the first passage looked like any other, so the DM could not tell it is read when the entry is shared.
  it("labels the first passage as the opening, read when the entry is shared, once there is a passage", () => {
    expect(mountIt().find("[data-testid=lore-opening]").exists()).toBe(false);
    passages.value = [p("a", 0)];
    const opening = mountIt().get("[data-testid=lore-opening]");
    expect(opening.text()).toContain("The opening, read when the entry is shared");
    expect(opening.text()).toContain("never waits at a place");
  });

  // Bug: a lore entry showed no "Because of" and "Led to", so its cause and effect were only visible from other entries.
  it("shows what the entry came of and led to", () => {
    expect(mountIt().get("[data-testid=story-links]").attributes("data-id")).toBe("l1");
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
  // Bug caught: the block showing another entry's quests (or another part's words), so a lore read as a force's "where the party meets it".
  it("shows this lore's own quest links, in the lore's words", () => {
    questData.quests = [
      { id: "l1", entry_id: "l1", quest_id: "q1" },
      { id: "l2", entry_id: "someone-else", quest_id: "q2" },
    ];
    const block = mountIt().getComponent(EntryQuestsStub);
    expect(block.props("links")).toEqual([expect.objectContaining({ id: "l1" })]);
    expect(block.props("label")).toBe("The quests that tell it");
    expect(block.props("empty")).toBe("No quest tells this yet.");
  });
});
