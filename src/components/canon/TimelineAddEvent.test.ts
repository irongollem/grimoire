import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TimelineAddEvent from "./TimelineAddEvent.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), discard: vi.fn(), error: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ createCanonEntry: mocks.create, updateCanonEntry: mocks.update, discardCanonEntry: mocks.discard }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.error, fromError: (e: Error) => e.message } }));
vi.mock("./WorldDateField.vue", () => ({
  default: { props: ["date"], emits: ["change"], template: "<button data-testid='set-date' @click=\"$emit('change', { year: 412, month: 3, day: null })\" />" },
}));

async function fill(w: ReturnType<typeof mount>, title: string, date = true) {
  await w.get("input").setValue(title);
  if (date) await w.get("[data-testid=set-date]").trigger("click");
}

describe("TimelineAddEvent", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.create.mockResolvedValue({ id: "e1" });
    mocks.update.mockResolvedValue(undefined);
    mocks.discard.mockResolvedValue(undefined);
  });

  // Bug caught: an event made without a date, which the timeline never lists, or one filed outside the chosen arc.
  it("makes a history lore entry in the chosen arc and dates it", async () => {
    useCanonUiStore().arcFilter = "arc-1";
    const w = mount(TimelineAddEvent, { props: { sortOrder: 4 } });
    await fill(w, "The flood");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith("c1", { part: "lore", title: "The flood", lore_kind: "history", sort_order: 4, arc_id: "arc-1" });
    expect(mocks.update).toHaveBeenCalledWith("e1", { world_year: 412, world_month: 3, world_day: null });
  });

  it("will not add an event with no year", async () => {
    const w = mount(TimelineAddEvent, { props: { sortOrder: 0 } });
    await fill(w, "The flood", false);
    await w.get("form").trigger("submit");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // Bug caught: a failed dating leaving a dateless entry behind, invisible on the timeline and cluttering Lore.
  it("takes the entry back and says why when dating fails", async () => {
    mocks.update.mockRejectedValue(new Error("no"));
    const w = mount(TimelineAddEvent, { props: { sortOrder: 0 } });
    await fill(w, "The flood");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.discard).toHaveBeenCalledWith("e1");
    expect(mocks.error).toHaveBeenCalledWith("no");
    expect((w.get("input").element as HTMLInputElement).value).toBe("The flood");
  });
});
