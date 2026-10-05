import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  quests: [] as unknown[],
  puzzles: [] as unknown[],
  handouts: [] as unknown[],
  notes: [] as unknown[],
  newIds: new Set<string>(),
}));

vi.mock("@/composables/quests/useQuests", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerVisibleQuests: () => ({ data: r(state.quests) }) };
});
vi.mock("@/composables/dungeon-features/usePuzzles", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerVisiblePuzzles: () => ({ data: r(state.puzzles) }) };
});
vi.mock("@/composables/scriptorium/usePlayerHandouts", async () => {
  const { ref: r } = await import("vue");
  return { usePlayerHandouts: () => ({ data: r(state.handouts) }) };
});
vi.mock("@/composables/notes/useNotes", async () => {
  const { ref: r } = await import("vue");
  return { useNotes: () => ({ data: r(state.notes) }) };
});
vi.mock("@/composables/play/useReadItems", () => ({
  useReadItems: (type: string) => ({ isNew: (id: string) => state.newIds.has(`${type}:${id}`) }),
}));

import { anyUnread, usePlayerUnread } from "./usePlayerUnread";

beforeEach(() => {
  state.quests = [];
  state.puzzles = [];
  state.handouts = [];
  state.notes = [];
  state.newIds = new Set();
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
    expect(sections.value).toEqual({ quests: false, puzzles: false, handouts: true, dmNotes: false });
    expect(journal.value).toBe(true);
    expect(unreadPaths.value).toEqual(["/play/journal"]);
  });

  it("ignores a shared quest that the Quest Log does not list", () => {
    state.quests = [{ id: "q1", status: "undiscovered", updated_at: "2026-10-01" }];
    state.newIds.add("quest:q1");
    expect(usePlayerUnread().sections.value.quests).toBe(false);
    state.quests = [{ id: "q2", status: "active", updated_at: "2026-10-01" }];
    state.newIds.add("quest:q2");
    expect(usePlayerUnread().sections.value.quests).toBe(true);
  });

  it("keeps entity types apart", () => {
    state.puzzles = [{ id: "p1", updated_at: "2026-10-01" }];
    state.notes = [{ id: "p1", updated_at: "2026-10-01" }];
    state.newIds.add("note:p1");
    const { sections } = usePlayerUnread();
    expect(sections.value.puzzles).toBe(false);
    expect(sections.value.dmNotes).toBe(true);
  });
});
