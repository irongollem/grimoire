import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { CanonHere as CanonHereData, CanonHereClue, CanonHerePassage } from "@/composables/canon/useCanonHere";

const mocks = vi.hoisted(() => ({ setFound: vi.fn(), tell: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
const answer = { clues: [] as CanonHereClue[], passages: [] as CanonHerePassage[] };

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/canon/useCanonClues", async (orig) => ({ ...(await orig<typeof import("@/composables/canon/useCanonClues")>()), useSetClueFound: () => mocks.setFound }));
vi.mock("@/composables/canon/useCanonPassageEdits", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonPassageEdits")>()),
  useTellPassage: () => ({ tell: mocks.tell, takeBack: vi.fn() }),
}));

import CanonHere from "./CanonHere.vue";

const clue = (over: Partial<CanonHereClue> = {}): CanonHereClue => ({
  id: "k1", title: "A locket with the guild's mark", secret_id: "s1", secret_title: "Sift is the guild master's daughter.", found_at: null, found_session_id: null, ...over,
});
const passage = (over: Partial<CanonHerePassage> = {}): CanonHerePassage => ({ id: "g1", title: "What was lost", entry_id: "l1", entry_title: "The Drowned Shrine", ...over });

async function mountHere(kind: "location" | "npc" | "quest_beat", id: string, extra: { bare?: boolean } = {}) {
  const w = mount(CanonHere, {
    props: { kind, id, ...extra },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]],
      stubs: { RouterLink: { props: ["to"], template: "<a :href=\"to.query.entry\"><slot /></a>" } },
    },
  });
  await flushPromises();
  return w;
}

describe("CanonHere", () => {
  beforeEach(() => {
    mocks.setFound.mockReset();
    mocks.tell.mockReset();
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    answer.clues = [];
    answer.passages = [];
    mocks.rpc.mockImplementation(async () => ({ data: { clues: answer.clues, passages: answer.passages, lore: [], knows: [], about: [] } satisfies CanonHereData, error: null }));
  });

  it("reads through get_canon_here only, never the whole campaign's clues, entries or passages", async () => {
    answer.clues = [clue()];
    await mountHere("npc", "n1");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_canon_here", { p_kind: "npc", p_id: "n1" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("renders nothing when nothing is placed here, so a place without canon carries no empty block", async () => {
    expect((await mountHere("location", "p9")).find("[data-testid=canon-here]").exists()).toBe(false);
  });

  // Bug (#1279 item 13): the block inside "In the canon" drawing its own card, a box in a box.
  it("draws no card of its own when bare, and keeps it otherwise", async () => {
    answer.clues = [clue()];
    expect((await mountHere("npc", "n1", { bare: true })).get("[data-testid=canon-here]").classes()).not.toContain("border");
    expect((await mountHere("npc", "n1")).get("[data-testid=canon-here]").classes()).toContain("border");
  });

  it("lists the clue with its secret's statement", async () => {
    answer.clues = [clue()];
    const w = await mountHere("location", "p1");
    expect(w.findAll("[data-testid=clue-here]")).toHaveLength(1);
    expect(w.text()).toContain("A locket with the guild's mark");
    expect(w.text()).toContain("Sift is the guild master's daughter.");
  });

  it("ticks the clue found through the shared tick, with the clue and the new value", async () => {
    answer.clues = [clue()];
    const w = await mountHere("location", "p1");
    await w.find("input[type=checkbox]").setValue(true);
    expect(mocks.setFound).toHaveBeenCalledWith(expect.objectContaining({ id: "k1" }), true);
  });

  it("offers an untold passage with Tell the party, and tells that passage", async () => {
    answer.passages = [passage()];
    const w = await mountHere("location", "p1");
    expect(w.findAll("[data-testid=passage-here]")).toHaveLength(1);
    expect(w.text()).toContain("The Drowned Shrine");
    await w.find("[data-testid=tell-here]").trigger("click");
    expect(mocks.tell).toHaveBeenCalledWith(expect.objectContaining({ id: "g1" }));
  });

  it("names an untitled passage rather than leaving an empty row", async () => {
    answer.passages = [passage({ title: "" })];
    expect((await mountHere("location", "p1")).text()).toContain("An untitled passage");
  });

  // Bug caught: the compact prop ignored, so the run surfaces carry the full-size card.
  it("marks itself compact only when asked", async () => {
    answer.clues = [clue()];
    expect((await mountHere("location", "p1")).get("[data-testid=canon-here]").attributes("data-compact")).toBeUndefined();
    const w = mount(CanonHere, {
      props: { kind: "location", id: "p1", compact: true },
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]], stubs: { RouterLink: true } },
    });
    await flushPromises();
    expect(w.get("[data-testid=canon-here]").attributes("data-compact")).toBe("true");
  });
});

// Bug caught: Canon here (the DM's clues and Tell buttons) imported into a player surface, which would show a player what is hidden.
describe("CanonHere stays off the player surfaces", () => {
  const sources = import.meta.glob(["/src/views/player/**/*.vue", "/src/components/player/**/*.vue", "/src/components/table/**/*.vue"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("is imported by no player view or component", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.entries(sources).filter(([, src]) => src.includes("CanonHere")).map(([path]) => path)).toEqual([]);
  });
});
