import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import type { CanonClue, CanonEntry, CanonLorePassage } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ setFound: vi.fn(), tell: vi.fn() }));
const passages = ref<CanonLorePassage[]>([]);
const clues = ref<CanonClue[]>([]);
const entries = ref<CanonEntry[]>([]);

vi.mock("@/composables/canon/useCanonClues", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/useCanonClues")>();
  return {
    ...real,
    useCluesAt: (kind: () => "location" | "npc" | "quest_beat", id: () => string) => ({
      clues: computed(() => real.cluesAt(clues.value, kind(), id())),
    }),
    useSetClueFound: () => mocks.setFound,
  };
});
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/canon/useCanonPassages", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/useCanonPassages")>();
  return { ...real, useCanonPassages: () => ({ data: passages }), useTellPassage: () => ({ tell: mocks.tell, takeBack: vi.fn() }) };
});

import CanonHere from "./CanonHere.vue";

const clue = (over: Partial<CanonClue>): CanonClue => ({
  id: "k1", user_id: "u", campaign_id: "c", secret_id: "s1", title: "A locket with the guild's mark", sort_order: 0, location_id: "p1",
  npc_id: null, quest_beat_id: null, found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});
const secret: CanonEntry = canonEntry({ id: "s1", part: "secret", title: "Sift is the guild master's daughter." });

const mountHere = (kind: "location" | "npc" | "quest_beat", id: string) =>
  mount(CanonHere, { props: { kind, id }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href=\"to.query.entry\"><slot /></a>" } } } });

describe("CanonHere", () => {
  beforeEach(() => {
    clues.value = [clue({}), clue({ id: "k2", location_id: "p2", title: "Elsewhere" })];
    entries.value = [secret];
    mocks.setFound.mockReset();
    mocks.tell.mockReset();
    passages.value = [];
  });

  it("renders nothing when no clue lies here, so a place without clues carries no empty block", () => {
    expect(mountHere("location", "p9").find("[data-testid=clues-here]").exists()).toBe(false);
  });

  it("lists the clue at this place with its secret's statement, and not the clue at another place", () => {
    const w = mountHere("location", "p1");
    expect(w.findAll("[data-testid=clue-here]")).toHaveLength(1);
    expect(w.text()).toContain("A locket with the guild's mark");
    expect(w.text()).toContain("Sift is the guild master's daughter.");
    expect(w.text()).not.toContain("Elsewhere");
  });

  it("does not show a place's clue on a person with the same id", () => {
    expect(mountHere("npc", "p1").find("[data-testid=clues-here]").exists()).toBe(false);
  });

  it("ticks the clue found through the shared tick, with the clue and the new value", async () => {
    const w = mountHere("location", "p1");
    await w.find("input[type=checkbox]").setValue(true);
    expect(mocks.setFound).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }), true);
  });

  const passage = (over: Partial<CanonLorePassage>): CanonLorePassage => ({
    id: "g1", user_id: "u", campaign_id: "c", entry_id: "l1", title: "What was lost", body: null, sort_order: 1, player_visible_to: [],
    told_at: null, told_session_id: null, location_id: "p1", npc_id: null, quest_beat_id: null, ai_provenance: null, created_at: "2026-11-19T10:00:00Z", updated_at: "", ...over,
  });
  const first = passage({ id: "g0", title: "What everyone says", sort_order: 0, location_id: "p1" });

  it("offers an untold passage that comes out here, with Tell the party, and tells that passage", async () => {
    passages.value = [first, passage({})];
    const w = mountHere("location", "p1");
    expect(w.findAll("[data-testid=passage-here]")).toHaveLength(1);
    await w.find("[data-testid=tell-here]").trigger("click");
    expect(mocks.tell).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }));
  });

  it("does not offer a passage that is already told, so the party is never told the same passage twice", () => {
    passages.value = [first, passage({ told_at: "2026-11-20T10:00:00Z" })];
    expect(mountHere("location", "p1").find("[data-testid=lore-here]").exists()).toBe(false);
  });

  it("never offers an entry's first passage: it is told with the entry, not at a place", () => {
    passages.value = [first];
    expect(mountHere("location", "p1").find("[data-testid=lore-here]").exists()).toBe(false);
  });

  it("does not show a passage that comes out at another place", () => {
    passages.value = [first, passage({ location_id: "p2" })];
    expect(mountHere("location", "p1").find("[data-testid=lore-here]").exists()).toBe(false);
  });

  it("shows clues and passages together in one block", () => {
    passages.value = [first, passage({})];
    const w = mountHere("location", "p1");
    expect(w.findAll("[data-testid=canon-here]")).toHaveLength(1);
    expect(w.find("[data-testid=clues-here]").exists()).toBe(true);
    expect(w.find("[data-testid=lore-here]").exists()).toBe(true);
  });
});
