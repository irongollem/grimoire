import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { PlayerCanonEntry, PlayerLore, PlayerLorePassage, PlayerWorld } from "@/composables/canon/usePlayerCanon";

const state = vi.hoisted(() => ({
  world: undefined as unknown,
  readAt: new Map<string, Date>(),
  marked: [] as { entityType: string; entityId: string }[],
  notes: [] as unknown[],
  sessions: [] as unknown[],
  noteReads: 0,
  tell: vi.fn(),
  addWonder: vi.fn(),
  found: [] as unknown[],
  wonders: [] as unknown[],
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
vi.mock("@/composables/canon/useTellParty", () => ({ useTellParty: () => ({ tellParty: state.tell, telling: ref(false) }) }));
vi.mock("@/composables/canon/usePlayerFoundClues", () => ({ usePlayerFoundClues: () => ({ rows: ref(state.found) }) }));
vi.mock("@/composables/canon/useCanonWonders", () => ({
  usePlayerWonders: () => ({ data: ref(state.wonders) }),
  useAddWonder: () => ({ mutateAsync: state.addWonder }),
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
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", lore_kind: null, world_year: null, world_month: null, world_day: null, party_member_id: null,
});
const passage = (id: string, title: string, told_at: string | null): PlayerLorePassage => ({ id, entry_id: "l1", sort_order: 0, title, body: `${title} text`, told_at, by_dm: true, written_at: "2026-11-09T00:00:00Z" });
const lore = (passages: PlayerLorePassage[]): PlayerLore => ({
  entry: { ...truth("l1", "The Fall of the Guild", "all"), part: "lore", knowledge: null, lore_kind: "history", body: "body text" },
  passages,
  latestAt: "2026-11-09T00:00:00Z",
});
const world = (over: Partial<PlayerWorld>): PlayerWorld => ({ onlyMine: [], known: [], lore: [], backstories: [], premise: [], revealed: [], ...over });

beforeEach(() => {
  setActivePinia(createPinia());
  state.tell.mockReset();
  state.addWonder.mockReset();
  state.found = [];
  state.wonders = [];
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

  // Bug caught (#1255 item 8): the DM's "More about it" on a truth never reached the player, in either truth section.
  it("shows a truth's body under its title, only when it has one", () => {
    state.world = world({
      onlyMine: [{ ...truth("a", "The river gives back", "some"), body: "mine body" }],
      known: [{ ...truth("b", "Magic leaves a taste", "all"), body: "known body" }, truth("c", "Salt keeps", "all")],
    });
    const w = mount(PlayerJournalWorldTab, { global: { stubs: { RouterLink: true } } });
    const [mine, known] = w.findAll("section");
    expect(mine.find(".rte").text()).toBe("mine body");
    expect(known.findAll(".rte")).toHaveLength(1);
    expect(known.find(".rte").text()).toBe("known body");
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

  // Bug caught (#1255): the tab never rendered revealed secrets, and a world holding only one fell into the empty state.
  it("shows a revealed secret, and not the empty state when it is all there is", () => {
    state.world = world({ revealed: [{ ...truth("s", "The duke is a lich", "all"), part: "secret", knowledge: null }] });
    const w = mount(PlayerJournalWorldTab);
    expect(w.find("[aria-labelledby='world-revealed']").text()).toContain("The duke is a lich");
    expect(w.text()).not.toContain("has not told you anything of the world yet");
  });

  // Bug caught (#1255): a shared premise never shown; a line read as a veil (or unlabelled) so the player could not
  // tell what the table never plays.
  it("shows the shared pitch and says in words whether an entry is a line or a veil", () => {
    const prem = (id: string, title: string, kind: "pitch" | "line" | "veil", body: string | null = null): PlayerCanonEntry => ({
      ...truth(id, title, "all"), part: "premise", premise_kind: kind, knowledge: null, body,
    });
    state.world = world({ premise: [prem("p", "A drowned kingdom", "pitch", "Dark tide rising"), prem("l", "Harm to children", "line"), prem("v", "Torture", "veil")] });
    const w = mount(PlayerJournalWorldTab);
    const text = w.find("[aria-labelledby='world-campaign']").text();
    expect(text).toContain("A drowned kingdom");
    expect(text).toContain("Dark tide rising");
    expect(text.indexOf("Harm to children")).toBeLessThan(text.indexOf("Line: never in the story"));
    expect(text.indexOf("Line: never in the story")).toBeLessThan(text.indexOf("Torture"));
    expect(text).toContain("Veil: happens off screen");
  });

  it("says nothing is told yet rather than showing empty sections", () => {
    state.world = world({});
    const w = mount(PlayerJournalWorldTab);
    expect(w.text()).toContain("has not told you anything of the world yet");
    // Only the player's own wonders stay: they have something to ask even when nothing has been told.
    expect(w.find("section:not([data-testid=player-wonders])").exists()).toBe(false);
  });
});

describe("PlayerJournalWorldTab: who knows, found clues and wonders (#1258 items 14, 23, 24)", () => {
  const mountTab = () => mount(PlayerJournalWorldTab, { global: { stubs: { RouterLink: true } } });

  // Bug caught: a truth shared with some characters read like any shared truth, so the player could not tell who knew it.
  it("says who shares a truth only some know, and says nothing under a truth known to all", () => {
    state.world = world({
      known: [{ ...truth("a", "The river gives back", "some"), known_with: ["Bram", "Mira"] }, truth("b", "Magic leaves a taste", "all")],
    });
    const items = mountTab().findAll("section")[0]!.findAll("li");
    expect(items[0]!.find("[data-testid=known-with]").text()).toBe("You, Bram and Mira know");
    expect(items[1]!.find("[data-testid=known-with]").exists()).toBe(false);
  });

  // Bug caught: Tell the party was offered on truths the whole table already knows, or told the party the wrong truth.
  it("offers Tell the party only under Only you know, for that truth", async () => {
    state.world = world({ onlyMine: [truth("a", "The river gives back", "some")], known: [truth("b", "Magic leaves a taste", "all")] });
    const w = mountTab();
    const buttons = w.findAll("[data-testid=tell-party]");
    expect(buttons).toHaveLength(1);
    await buttons[0]!.trigger("click");
    expect(state.tell).toHaveBeenCalledWith(expect.objectContaining({ id: "a", title: "The river gives back" }));
  });

  // Bug caught: a DM previewing as a player could tell the party on the player's behalf.
  it("does not offer Tell the party to a DM previewing as a player", async () => {
    const { useAppUiStore } = await import("@/stores/ui/app");
    useAppUiStore().dmPreviewMode = true;
    state.world = world({ onlyMine: [truth("a", "The river gives back", "some")] });
    expect(mountTab().find("[data-testid=tell-party]").exists()).toBe(false);
  });

  // Bug caught: found clues never reached the player's page, or named a place the player cannot see.
  it("lists the found clues with where they lay, and just the title when it is nowhere the player can see", () => {
    state.world = world({ known: [truth("b", "Magic leaves a taste", "all")] });
    state.found = [
      { clue: { id: "k1", title: "A brass key" }, where: { kind: "place", name: "The Drowned Mill" } },
      { clue: { id: "k2", title: "A torn letter" }, where: null },
    ];
    const section = mountTab().get("[data-testid=found-clues]");
    expect(section.text()).toContain("What we have found");
    expect(section.text()).toContain("Found at The Drowned Mill");
    const rows = section.findAll("li");
    expect(rows[1]!.text()).toBe("A torn letter");
  });

  // Bug caught: with nothing told yet the wonder field was not drawn, so a player at the start of a campaign could not ask anything.
  it("lets a player ask a wonder, even before the DM has told them anything", async () => {
    state.world = world({});
    state.addWonder.mockResolvedValue(undefined);
    const w = mountTab();
    const input = w.get("input[aria-label='Something you wonder']");
    await input.setValue("  Who sank the mill?  ");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(state.addWonder).toHaveBeenCalledWith("Who sank the mill?");
  });

  // Bug caught: the player never learned what became of their question.
  it("says what became of each wonder", () => {
    state.world = world({ known: [truth("b", "x", "all")] });
    state.wonders = [
      { id: "w1", body: "Who sank the mill?", adopted_entry_id: "q1", dismissed_at: null },
      { id: "w2", body: "Is the well cursed?", adopted_entry_id: null, dismissed_at: "2026-11-02T00:00:00Z" },
      { id: "w3", body: "Where does the river go?", adopted_entry_id: null, dismissed_at: null },
    ];
    const items = mountTab().get("[data-testid=player-wonders]").findAll("li");
    expect(items[0]!.text()).toContain("Taken up by the DM");
    expect(items[1]!.text()).toContain("Let be");
    expect(items[2]!.text()).toBe("Where does the river go?");
  });
});
