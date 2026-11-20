import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { PlayerCanonEntry, PlayerLore, PlayerLorePassage, PlayerWorld } from "@/composables/canon/usePlayerCanon";

const state = vi.hoisted(() => ({
  world: undefined as unknown,
  readAt: new Map<string, Date>(),
  marked: [] as { entityType: string; entityId: string }[],
  notes: [] as unknown[],
  sessions: [] as unknown[],
  noteReads: 0,
}));

vi.mock("@/composables/canon/usePlayerCanon", async (orig) => {
  const real = await orig<typeof import("@/composables/canon/usePlayerCanon")>();
  return {
    ...real,
    usePlayerCanon: () => ({ world: ref(state.world), isLoading: ref(false), error: ref(null) }),
  };
});
vi.mock("@/composables/player/useReadItems", () => ({
  useReadItems: () => ({
    readAt: ref(state.readAt),
    isNew: (id: string, updatedAt?: string) => {
      const at = state.readAt.get(id);
      return at ? new Date(updatedAt ?? 0) > at : true;
    },
  }),
  useMarkRead: () => ({ mutate: (v: { entityType: string; entityId: string }) => state.marked.push(v) }),
}));
vi.mock("@/composables/notes/useNotes", () => ({
  usePlayerVisibleNotes: () => {
    state.noteReads += 1;
    return { data: ref(state.notes) };
  },
}));
vi.mock("@/composables/sessions/usePlayerSessions", () => ({ usePlayerSessions: () => ({ data: ref(state.sessions) }) }));
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { formatDate: (y: number, m: number | null, d: number | null) => `${d}/${m}/${y} AR` } }),
}));
vi.mock("@/components/notes/NoteReading.vue", () => ({ default: { template: "<span />" } }));
vi.mock("@/components/common/richtext/RichTextViewer.vue", () => ({
  default: { props: ["content"], template: "<div class='rte'>{{ content }}</div>" },
}));

import PlayerJournalWorldTab from "./PlayerJournalWorldTab.vue";

const truth = (id: string, title: string, knowledge: "all" | "some"): PlayerCanonEntry => ({
  id, part: "truth", premise_kind: null, knowledge, title, body: null, sort_order: 0, image_url: null,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", lore_kind: null, world_year: null, world_month: null, world_day: null,
});
const passage = (id: string, title: string, told_at: string | null): PlayerLorePassage => ({ id, entry_id: "l1", sort_order: 0, title, body: `${title} text`, told_at });
const lore = (passages: PlayerLorePassage[]): PlayerLore => ({
  entry: { ...truth("l1", "The Fall of the Guild", "all"), part: "lore", knowledge: null, lore_kind: "history", body: "body text" },
  passages,
  latestAt: "2026-11-09T00:00:00Z",
});
const world = (over: Partial<PlayerWorld>): PlayerWorld => ({ onlyMine: [], known: [], lore: [], ...over });

beforeEach(() => {
  state.readAt = new Map();
  state.marked = [];
  state.notes = [];
  state.sessions = [];
  state.noteReads = 0;
});

describe("PlayerJournalWorldTab", () => {
  it("sets what only this player knows apart from what the table knows", () => {
    state.world = world({ onlyMine: [truth("a", "The river gives back", "some")], known: [truth("b", "Magic leaves a taste", "all")] });
    const w = mount(PlayerJournalWorldTab, { global: { stubs: { RouterLink: true } } });
    const [mine, known] = w.findAll("section");
    expect(mine.text()).toContain("Only you know");
    expect(mine.text()).toContain("The river gives back");
    expect(mine.text()).not.toContain("Magic leaves a taste");
    expect(known.text()).toContain("What we know");
    expect(known.text()).toContain("Magic leaves a taste");
  });

  it("opens a lore entry to its body and its passages told so far, in order, and marks it read", async () => {
    state.world = world({ lore: [lore([passage("p1", "What everyone says", null), passage("p2", "What Bell-Note believes", "2026-11-09T00:00:00Z")])] });
    const w = mount(PlayerJournalWorldTab);
    expect(w.text()).not.toContain("What everyone says");
    await w.find("button").trigger("click");
    const text = w.text();
    expect(text.indexOf("body text")).toBeLessThan(text.indexOf("What everyone says"));
    expect(text.indexOf("What everyone says")).toBeLessThan(text.indexOf("What Bell-Note believes"));
    expect(text).not.toContain("There is more to this story");
    expect(state.marked).toEqual([{ entityType: "canon_lore", entityId: "l1" }]);
  });

  it("marks New only the passage told after the player's last visit, even though opening marks the entry read", async () => {
    state.readAt = new Map([["l1", new Date("2026-11-05T00:00:00Z")]]);
    state.world = world({ lore: [lore([passage("p1", "What everyone says", "2026-11-02T00:00:00Z"), passage("p2", "What Bell-Note believes", "2026-11-09T00:00:00Z")])] });
    const w = mount(PlayerJournalWorldTab);
    await w.find("button").trigger("click");
    await flushPromises();
    expect(w.find("[data-testid='passage-p1']").find("[data-testid='passage-new']").exists()).toBe(false);
    expect(w.find("[data-testid='passage-p2']").find("[data-testid='passage-new']").exists()).toBe(true);
  });

  const note = (id: string, over: Record<string, unknown>) => ({
    id, title: `Note ${id}`, content: `${id} body`, tags: [], ai_provenance: null, session_id: null, is_pinned: false,
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
    session_start_year: null, session_start_month: null, session_start_day: null, ...over,
  });
  const session = (id: string, number: number, title: string, played_on: string) => ({ id, number, title, played_on, started_at: null, ended_at: null });

  it("lists shared session notes in the Chronicle, newest session first, and leaves notes without a session out", () => {
    state.sessions = [session("s1", 1, "The Mere", "2026-10-01"), session("s2", 2, "The Guild", "2026-10-15")];
    state.notes = [
      note("a", { session_id: "s1", title: "Into the Mere" }),
      note("b", { session_id: "s2", title: "The Guild Falls" }),
      note("c", { title: "A plain note" }),
    ];
    const w = mount(PlayerJournalWorldTab);
    const text = w.find("[aria-labelledby='world-chronicle']").text();
    expect(text.indexOf("The Guild Falls")).toBeLessThan(text.indexOf("Into the Mere"));
    expect(text).toContain("Session 2: The Guild");
    expect(text).not.toContain("A plain note");
  });

  it("shows no Chronicle block when no shared note has a session", () => {
    state.notes = [note("c", { title: "A plain note" })];
    state.world = world({ known: [truth("b", "Magic leaves a taste", "all")] });
    const w = mount(PlayerJournalWorldTab);
    expect(w.find("[aria-labelledby='world-chronicle']").exists()).toBe(false);
  });

  it("dates a chronicle entry in the world through the calendar, and opens it marking the note read", async () => {
    state.sessions = [session("s1", 1, "The Mere", "2026-10-01")];
    state.notes = [note("a", { session_id: "s1", session_start_year: 1492, session_start_month: 3, session_start_day: 9 })];
    state.world = world({});
    const w = mount(PlayerJournalWorldTab);
    expect(w.text()).toContain("9/3/1492 AR");
    expect(w.text()).not.toContain("a body");
    await w.find("button").trigger("click");
    expect(w.text()).toContain("a body");
    expect(state.marked).toEqual([{ entityType: "note", entityId: "a" }]);
  });

  it("reads notes through the preview-aware player read, never a table of its own", () => {
    state.world = world({});
    mount(PlayerJournalWorldTab);
    expect(state.noteReads).toBe(1);
  });

  it("says nothing is told yet rather than showing empty sections", () => {
    state.world = world({});
    const w = mount(PlayerJournalWorldTab);
    expect(w.text()).toContain("has not told you anything of the world yet");
    expect(w.find("section").exists()).toBe(false);
  });
});
