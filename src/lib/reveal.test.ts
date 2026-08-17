import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { arrayRevealAdapter, revealLabel, revealState } from "./reveal";

const PARTY = ["a", "b", "c"];

describe("revealState", () => {
  it("reports private when nobody can see it", () => {
    expect(revealState(PARTY, () => false)).toBe("private");
  });

  it("reports everyone only when every member is covered", () => {
    expect(revealState(PARTY, () => true)).toBe("everyone");
    expect(revealState(PARTY, (id) => id !== "c")).toBe("partial");
  });

  it("treats an empty party as private, not as everyone", () => {
    // `every` on an empty list is vacuously true, which would otherwise claim a
    // campaign with no players had revealed the entity to all of them.
    expect(revealState([], () => true)).toBe("private");
  });
});

describe("revealLabel", () => {
  it("names the audience rather than the mechanism", () => {
    expect(revealLabel("everyone", 3)).toBe("Whole party");
    expect(revealLabel("private", 0)).toBe("Hidden");
  });

  it("counts players, singular and plural", () => {
    expect(revealLabel("partial", 1)).toBe("1 player");
    expect(revealLabel("partial", 2)).toBe("2 players");
  });
});

describe("arrayRevealAdapter", () => {
  it("adds and removes a member", () => {
    const visibleTo = ref<string[]>([]);
    const adapter = arrayRevealAdapter(visibleTo, () => PARTY);

    adapter.toggleMember("b");
    expect(visibleTo.value).toEqual(["b"]);
    expect(adapter.isMemberVisible("b")).toBe(true);

    adapter.toggleMember("b");
    expect(visibleTo.value).toEqual([]);
    expect(adapter.isMemberVisible("b")).toBe(false);
  });

  it("reveals to the whole party and hides from everyone", () => {
    const visibleTo = ref<string[]>(["a"]);
    const adapter = arrayRevealAdapter(visibleTo, () => PARTY);

    adapter.setWholeParty();
    expect(visibleTo.value).toEqual(PARTY);

    adapter.unshare();
    expect(visibleTo.value).toEqual([]);
  });

  it("reads the party at click time, not at construction", () => {
    // The party query resolves after the control mounts; capturing the list up
    // front would reveal to whoever had loaded so far.
    let party: string[] = [];
    const visibleTo = ref<string[]>([]);
    const adapter = arrayRevealAdapter(visibleTo, () => party);

    party = PARTY;
    adapter.setWholeParty();
    expect(visibleTo.value).toEqual(PARTY);
  });

  it("reports each change exactly once, so a saver cannot loop", () => {
    // Persisting used to live in a watcher on the ref. The save refetched, the
    // refetch pushed a fresh array back in, and the changed identity read as
    // another edit — an endless write loop with an embedding call behind each
    // one. Saving is a callback now, and it must fire per action, not per
    // assignment.
    const seen: string[][] = [];
    const visibleTo = ref<string[]>([]);
    const adapter = arrayRevealAdapter(visibleTo, () => PARTY, (next) => seen.push(next));

    adapter.toggleMember("a");
    adapter.setWholeParty();
    adapter.unshare();
    expect(seen).toEqual([["a"], PARTY, []]);

    // An outside write (a refetch syncing the row back in) is not an edit.
    visibleTo.value = ["b"];
    expect(seen).toHaveLength(3);
  });

  it("works without a saver, for editors that own their own Save", () => {
    const visibleTo = ref<string[]>([]);
    const adapter = arrayRevealAdapter(visibleTo, () => PARTY);
    adapter.toggleMember("a");
    expect(visibleTo.value).toEqual(["a"]);
  });

  it("replaces the array rather than mutating it, so watchers fire", () => {
    const original: string[] = [];
    const visibleTo = ref<string[]>(original);
    const adapter = arrayRevealAdapter(visibleTo, () => PARTY);

    adapter.toggleMember("a");
    expect(visibleTo.value).not.toBe(original);
    expect(original).toEqual([]);
  });
});
