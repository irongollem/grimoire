import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import type { CanonClue, CanonEntry, CanonLorePassage } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({ tell: vi.fn(), takeBack: vi.fn(), update: vi.fn(), confirm: vi.fn() }));
const clues = ref<CanonClue[]>([]);
const entries = ref<CanonEntry[]>([]);

vi.mock("@/composables/canon/useCanonPassageEdits", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/useCanonPassageEdits")>();
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
  told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, author_id: "u", ai_provenance: null, created_at: "", updated_at: "", ...over,
});

const mountRow = (p: CanonLorePassage, first = false, extra: Record<string, unknown> = {}) =>
  mount(LorePassageRow, {
    props: { passage: p, index: first ? 0 : 1, first, canMoveUp: !first, canMoveDown: true, ...extra },
    global: { stubs: { RichTextEditor: true, WherePicker: { name: "WherePicker", emits: ["choose"], template: "<button data-testid='choose' @click=\"$emit('choose', { kind: 'npc', id: 'n1' })\" />" }, CanonRef: true, PassageClues: { name: "PassageClues", props: ["passage", "canAdd"], template: "<div />" }, RouterLink: { props: ["to"], template: "<a><slot /></a>" } } },
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

  // Bug caught: the first passage is told with the entry, never by itself, so a clue made of it would never be found;
  // and a player's own passage is not the DM's to plant a clue in.
  it("lets only a later DM passage be made a clue", () => {
    const canAdd = (w: ReturnType<typeof mountRow>) => w.findComponent({ name: "PassageClues" }).props("canAdd");
    expect(canAdd(mountRow(passage()))).toBe(true);
    expect(canAdd(mountRow(passage({ sort_order: 0 }), true))).toBe(false);
    expect(canAdd(mountRow(passage(), false, { playersOwn: true }))).toBe(false);
  });

  describe("in a backstory (frame 14)", () => {
    const target = { id: "m1", name: "Tansy" };

    // Bug caught: Tell the party told the whole table a secret meant for one character, or the DM could not tell it to the character at all.
    it("tells a DM passage to its character first, and to the party only by the other button", async () => {
      const w = mountRow(passage(), false, { tellTarget: target });
      expect(w.find("[data-testid=tell]").text()).toBe("Tell Tansy");
      await w.find("[data-testid=tell]").trigger("click");
      expect(mocks.tell).toHaveBeenLastCalledWith(expect.objectContaining({ id: "g1" }), ["m1"]);
      await w.find("[data-testid=tell-party]").trigger("click");
      expect(mocks.tell).toHaveBeenLastCalledWith(expect.objectContaining({ id: "g1" }));
      expect(mocks.tell.mock.lastCall).toHaveLength(1);
    });

    it("says whose words these are", () => {
      expect(mountRow(passage(), false, { byline: "Your passage" }).find("[data-testid=passage-byline]").text()).toBe("Your passage");
      expect(mountRow(passage()).find("[data-testid=passage-byline]").exists()).toBe(false);
    });

    // Bug caught: the DM was offered Tell on a player's own passage, which is told when written, so a "Tell" there is a button that does nothing or re-tells it.
    it("offers a player's own passage no Tell, no Take back and no place, only the DM's edit and remove", () => {
      const w = mountRow(passage({ told_at: "2026-11-02T10:00:00Z", player_visible_to: ["m1"] }), false, { playersOwn: true, tellTarget: target });
      expect(w.find("[data-testid=tell]").exists()).toBe(false);
      expect(w.find("[data-testid=take-back]").exists()).toBe(false);
      expect(w.find("[data-testid=passage-nowhere]").exists()).toBe(false);
      expect(w.find("[data-testid=passage-state]").text()).toContain("Told");
      expect(w.findAll("button").some((b) => b.text() === "Remove passage")).toBe(true);
      expect(w.findComponent({ name: "AppInput" }).exists()).toBe(true);
    });
  });
});
