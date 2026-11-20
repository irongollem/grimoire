import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import type { CanonClue, CanonEntry, CanonLorePassage } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ tell: vi.fn(), takeBack: vi.fn(), update: vi.fn(), confirm: vi.fn() }));
const clues = ref<CanonClue[]>([]);
const entries = ref<CanonEntry[]>([]);

vi.mock("@/composables/canon/useCanonPassages", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/useCanonPassages")>();
  return { ...real, updateCanonPassage: vi.fn(), useTellPassage: () => ({ tell: mocks.tell, takeBack: mocks.takeBack }), useUpdateCanonPassage: () => ({ mutate: mocks.update }) };
});
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: clues }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/canon/useClueWhere", () => ({ useClueWhere: () => computed(() => () => null) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "m1", name: "Pip" }, { id: "m2", name: "Sift" }]) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import LorePassageRow from "./LorePassageRow.vue";

const passage = (over: Partial<CanonLorePassage> = {}): CanonLorePassage => ({
  id: "g1", user_id: "u", campaign_id: "c", entry_id: "l1", title: "What was lost", body: null, sort_order: 1, player_visible_to: [], told_at: null,
  told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const mountRow = (p: CanonLorePassage, first = false) =>
  mount(LorePassageRow, {
    props: { passage: p, index: first ? 0 : 1, first, canMoveUp: !first, canMoveDown: true },
    global: { stubs: { RichTextEditor: true, WherePicker: { name: "WherePicker", emits: ["choose"], template: "<button data-testid='choose' @click=\"$emit('choose', { kind: 'npc', id: 'n1' })\" />" }, CanonRef: true, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } },
  });

describe("LorePassageRow", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.confirm.mockResolvedValue(true);
    clues.value = [];
    entries.value = [];
  });

  it("offers the first passage no Tell the party: it is told with the entry, and telling it alone would say nothing", () => {
    const w = mountRow(passage({ sort_order: 0 }), true);
    expect(w.find("[data-testid=tell]").exists()).toBe(false);
    expect(w.find("[data-testid=passage-state]").text()).toBe("Told with the entry");
  });

  it("tells a later untold passage through Tell the party, with the passage", async () => {
    const w = mountRow(passage());
    expect(w.find("[data-testid=passage-state]").text()).toBe("Not yet told");
    await w.find("[data-testid=tell]").trigger("click");
    expect(mocks.tell).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }));
  });

  it("names who a told passage went to, and offers Take back instead of Tell", () => {
    const w = mountRow(passage({ told_at: "2026-11-02T10:00:00Z", player_visible_to: ["m1", "m2"] }));
    expect(w.find("[data-testid=passage-state]").text()).toContain("to the whole party");
    expect(w.find("[data-testid=tell]").exists()).toBe(false);
    expect(w.find("[data-testid=take-back]").exists()).toBe(true);
  });

  it("asks before taking a passage back, and takes nothing back when the DM says no", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountRow(passage({ told_at: "2026-11-02T10:00:00Z", player_visible_to: ["m1"] }));
    await w.find("[data-testid=take-back]").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.takeBack).not.toHaveBeenCalled();
  });

  it("takes it back once confirmed", async () => {
    const w = mountRow(passage({ told_at: "2026-11-02T10:00:00Z", player_visible_to: ["m1"] }));
    await w.find("[data-testid=take-back]").trigger("click");
    await flushPromises();
    expect(mocks.takeBack).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }));
  });

  it("moves where it comes out to one place by clearing the others, so a passage is never at two", async () => {
    const w = mountRow(passage({ location_id: "p1" }));
    const change = w.findAll("button").find((b) => b.text() === "Change");
    await change!.trigger("click");
    await w.find("[data-testid=choose]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "g1", patch: { location_id: null, npc_id: "n1", quest_beat_id: null } });
  });

  it("says which secret it is also a clue to, with a link to it", () => {
    entries.value = [canonEntry({ id: "s1", part: "secret", title: "The Stain is a wound in the dream" })];
    clues.value = [{ id: "k1", secret_id: "s1", passage_id: "g1" } as CanonClue, { id: "k2", secret_id: "s9", passage_id: "other" } as CanonClue];
    const w = mountRow(passage());
    expect(w.findAll("[data-testid=passage-clue-to]").map((a) => a.text())).toEqual(["The Stain is a wound in the dream"]);
  });
});
