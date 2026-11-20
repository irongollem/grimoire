import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  quests: [] as unknown[],
  puzzles: [] as unknown[],
  handouts: [] as unknown[],
  notes: [] as unknown[],
  noticeBoards: [] as unknown[],
  lore: [] as { entry: { id: string; title: string }; latestAt: string }[],
  backstories: [] as { entry: { id: string }; memberId: string; latestDmAt: string | null }[],
  newIds: new Set<string>(),
  questions: [] as { id: string; closed_at: string | null; mode: string; exclusive: boolean }[],
  questionAnswers: [] as { question_id: string; user_id: string; option_id: string | null }[],
}));

vi.mock("@/composables/quests/useQuests", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerVisibleQuests: () => ({ data: r(state.quests) }) };
});
vi.mock("@/composables/dungeon-features/usePuzzles", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerVisiblePuzzles: () => ({ data: r(state.puzzles) }) };
});
vi.mock("@/scriptorium/composables/usePlayerHandouts", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerHandouts: () => ({ data: r(state.handouts) }) };
});
vi.mock("@/composables/notes/useNotes", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerVisibleNotes: () => ({ data: r(state.notes) }) };
});
vi.mock("@/composables/noticeBoards/usePlayerNoticeBoards", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerNoticeBoards: () => ({ data: r(state.noticeBoards) }) };
});
vi.mock("@/composables/canon/usePlayerCanon", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerCanon: () => ({ world: r({ onlyMine: [], known: [], lore: state.lore, backstories: state.backstories }) }) };
});
vi.mock("@/composables/canon/useMyStory", async () => {
  const { computed: c } = await import("vue");
  return { useMyMemberId: () => c(() => "m-me") };
});
vi.mock("@/composables/player/useReadItems", () => ({
  useReadMarkers: () => ({ isNew: (type: string, id: string) => state.newIds.has(`${type}:${id}`) }),
}));

vi.mock("@/composables/tableQuestions/useTableQuestions", async () => {
  const { ref: r } = await import("vue");
  return {
    useTableQuestions: () => ({ data: r(state.questions) }),
    useTableQuestionAnswers: () => ({ data: r(state.questionAnswers) }),
  };
});
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "me" } }) }));

import { anyUnread, collectUnreadItems, usePlayerUnread } from "./usePlayerUnread";

beforeEach(() => {
  state.quests = [];
  state.puzzles = [];
  state.handouts = [];
  state.notes = [];
  state.noticeBoards = [];
  state.lore = [];
  state.backstories = [];
  state.newIds = new Set();
  state.questions = [];
  state.questionAnswers = [];
});

describe("anyUnread", () => {
  it("is false for nothing and for an undefined list", () => {
    expect(anyUnread(undefined, () => true)).toBe(false);
    expect(anyUnread([], () => true)).toBe(false);
  });
  it("is true when any item is new", () => {
    const items = [{ id: "a", updated_at: "x" }, { id: "b", updated_at: "x" }];
    expect(anyUnread(items, (id) => id === "b")).toBe(true);
    expect(anyUnread(items, () => false)).toBe(false);
  });
});

describe("usePlayerUnread", () => {
  it("is quiet when everything is read", () => {
    state.handouts = [{ id: "h1", updated_at: "2026-10-01" }];
    const { journal, unreadPaths } = usePlayerUnread();
    expect(journal.value).toBe(false);
    expect(unreadPaths.value).toEqual([]);
  });

  it("lights the Journal and the section a shared handout arrives in", () => {
    state.handouts = [{ id: "h1", updated_at: "2026-10-01" }];
    state.newIds.add("handout:h1");
    const { sections, journal, unreadPaths } = usePlayerUnread();
    expect(sections.value).toEqual({ quests: false, puzzles: false, handouts: true, dmNotes: false, noticeBoards: false, world: false, story: false });
    expect(journal.value).toBe(true);
    expect(unreadPaths.value).toEqual(["/play/journal"]);
  });

  it("lights the Journal when a revealed notice board is new, and not when it is read", () => {
    state.noticeBoards = [{ id: "b1", name: "The Rusty Flagon's board", updated_at: "2026-10-15" }];
    expect(usePlayerUnread().journal.value).toBe(false);
    state.newIds = new Set(["notice_board:b1"]);
    const { sections, journal, isNoticeBoardNew } = usePlayerUnread();
    expect(sections.value.noticeBoards).toBe(true);
    expect(journal.value).toBe(true);
    expect(isNoticeBoardNew("b1", "2026-10-15")).toBe(true);
  });

  it("ignores a shared quest that the Quest Log does not list", () => {
    state.quests = [{ id: "q1", status: "undiscovered", updated_at: "2026-10-01" }];
    state.newIds.add("quest:q1");
    expect(usePlayerUnread().sections.value.quests).toBe(false);
    state.quests = [{ id: "q2", status: "active", updated_at: "2026-10-01" }];
    state.newIds.add("quest:q2");
    expect(usePlayerUnread().sections.value.quests).toBe(true);
  });

  it("lights the Journal's World tab when a passage was told after the player last opened the lore", () => {
    state.lore = [{ entry: { id: "l1", title: "The Fall of the Bakers' Guild" }, latestAt: "2026-11-02" }];
    expect(usePlayerUnread().sections.value.world).toBe(false);
    state.newIds.add("canon_lore:l1");
    const { sections, unreadPaths } = usePlayerUnread();
    expect(sections.value.world).toBe(true);
    expect(unreadPaths.value).toEqual(["/play/journal"]);
  });

  // Bug this guards: My story lighting the Journal for a passage the player wrote themselves, or for someone else's
  // shared backstory, so the dot promised news the tab did not hold.
  it("lights My story for a passage the DM told this player, and not for another character's backstory or one never told", () => {
    state.backstories = [{ entry: { id: "b-other" }, memberId: "m-other", latestDmAt: "2026-11-05" }, { entry: { id: "b-mine" }, memberId: "m-me", latestDmAt: null }];
    state.newIds = new Set(["canon_backstory:b-other", "canon_backstory:b-mine"]);
    expect(usePlayerUnread().sections.value.story).toBe(false);
    state.backstories = [{ entry: { id: "b-mine" }, memberId: "m-me", latestDmAt: "2026-11-05" }];
    const { sections, unreadPaths } = usePlayerUnread();
    expect(sections.value.story).toBe(true);
    expect(sections.value.world).toBe(false);
    expect(unreadPaths.value).toEqual(["/play/journal"]);
    state.newIds = new Set();
    expect(usePlayerUnread().sections.value.story).toBe(false);
  });

  it("lights The World, not DM Notes, for a new shared session note, and the reverse for a plain note", () => {
    state.notes = [{ id: "n1", updated_at: "2026-11-02", session_id: "s1" }];
    state.newIds.add("note:n1");
    let { sections } = usePlayerUnread();
    expect(sections.value.world).toBe(true);
    expect(sections.value.dmNotes).toBe(false);
    state.notes = [{ id: "n2", updated_at: "2026-11-02", session_id: null }];
    state.newIds = new Set(["note:n2"]);
    ({ sections } = usePlayerUnread());
    expect(sections.value.world).toBe(false);
    expect(sections.value.dmNotes).toBe(true);
  });

  it("keeps entity types apart", () => {
    state.puzzles = [{ id: "p1", updated_at: "2026-10-01" }];
    state.notes = [{ id: "p1", updated_at: "2026-10-01", session_id: null }];
    state.newIds.add("note:p1");
    const { sections } = usePlayerUnread();
    expect(sections.value.puzzles).toBe(false);
    expect(sections.value.dmNotes).toBe(true);
  });
});

describe("a question waiting on the player (#1212)", () => {
  it("dots the Hearth for an open question this player has not answered, and keeps the Journal dot", () => {
    state.questions = [{ id: "q1", closed_at: null, mode: "pick", exclusive: false }];
    state.questionAnswers = [{ question_id: "q1", user_id: "someone-else", option_id: "o1" }];
    state.handouts = [{ id: "h1", updated_at: "2026-10-01" }];
    state.newIds.add("handout:h1");
    expect(usePlayerUnread().unreadPaths.value).toEqual(["/play", "/play/journal"]);
  });

  it("does not dot the Hearth for a closed question this player never answered", () => {
    // The read is every question (shared with the Hearth's section), so a closed one is in it.
    state.questions = [{ id: "q1", closed_at: "2026-11-16T10:00:00Z", mode: "vote", exclusive: false }];
    state.questionAnswers = [];
    expect(usePlayerUnread().unreadPaths.value).toEqual([]);
  });

  it("does not dot the Hearth once this player has answered", () => {
    state.questions = [{ id: "q1", closed_at: null, mode: "pick", exclusive: false }];
    state.questionAnswers = [{ question_id: "q1", user_id: "me", option_id: "o1" }];
    expect(usePlayerUnread().unreadPaths.value).toEqual([]);
  });
});

describe("unread items", () => {
  it("lists the same things the section dots count, newest first, with routes", () => {
    state.quests = [
      { id: "q1", title: "Quest", status: "active", updated_at: "2026-10-02" },
      { id: "q0", title: "Hidden", status: "undiscovered", updated_at: "2026-10-09" },
    ];
    // The "read-*" entries are already read, so they must not be listed.
    state.puzzles = [
      { id: "p1", name: "Riddle", updated_at: "2026-10-03" },
      { id: "read-p", name: "Solved", updated_at: "2026-10-12" },
    ];
    state.handouts = [
      { id: "h1", title: "Map", updated_at: "2026-10-04" },
      { id: "read-h", title: "Seen map", updated_at: "2026-10-12" },
    ];
    state.notes = [
      { id: "n1", title: "Rumour", updated_at: "2026-10-01", session_id: null },
      { id: "c1", title: "Session 3", updated_at: "2026-10-07", session_id: "s3" },
      { id: "read-n", title: "Old rumour", updated_at: "2026-10-12" },
    ];
    state.noticeBoards = [{ id: "b1", name: "The Rusty Flagon's board", updated_at: "2026-10-05" }];
    state.lore = [{ entry: { id: "l1", title: "The Fall of the Bakers' Guild" }, latestAt: "2026-10-06" }];
    state.backstories = [{ entry: { id: "b1" }, memberId: "m-me", latestDmAt: "2026-10-08" }];
    state.newIds = new Set(["quest:q1", "quest:q0", "puzzle:p1", "handout:h1", "note:n1", "note:c1", "notice_board:b1", "canon_lore:l1", "canon_backstory:b1"]);
    const { items, sections } = usePlayerUnread();
    expect(items.value.map((i) => i.id)).toEqual(["b1", "c1", "l1", "h1", "p1", "q1", "n1"]);
    expect(items.value[0].to).toEqual({ name: "play-journal", query: { tab: "story" } });
    expect(items.value[1].to).toEqual({ name: "play-journal", query: { tab: "world" } });
    expect(items.value[1].kind).toBe("chronicle");
    expect(items.value[3].to).toEqual({ name: "play-handout", params: { id: "h1" } });
    expect(items.value[5].to).toEqual({ name: "play-quest-detail", params: { id: "q1" } });
    expect(items.value[4].to).toEqual({ name: "play-journal", query: { tab: "puzzles" } });
    expect(items.value[6].to).toEqual({ name: "play-journal", query: { tab: "dm-notes" } });
    expect(Object.values(sections.value).every(Boolean)).toBe(true);
  });

  it("is empty when everything is read, and tolerates undefined lists", () => {
    const never = () => false;
    expect(
      collectUnreadItems({ quests: undefined, puzzles: undefined, handouts: undefined, notes: undefined, lore: undefined, isNew: { quest: never, puzzle: never, handout: never, note: never, lore: never, chronicle: never, story: never } }),
    ).toEqual([]);
  });
});
