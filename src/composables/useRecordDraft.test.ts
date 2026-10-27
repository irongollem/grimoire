import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { changedColumns, draftValueEqual, mergeDraft, useRecordDraft } from "./useRecordDraft";

interface Row { id: string; name: string; notes: string | null; tags: string[] }
interface Draft { name: string; notes: string; tags: string[] }

const toDraft = (row: Row | null): Draft => ({
  name: row?.name ?? "",
  notes: row?.notes ?? "",
  tags: [...(row?.tags ?? [])],
});
const build = (d: Draft) => ({ name: d.name.trim(), notes: d.notes || null, tags: d.tags });

function setup(initial: Row | null) {
  const source = ref<Row | null>(initial);
  const handle = useRecordDraft({ source: () => source.value, identity: (r: Row) => r.id, toDraft });
  return { source, ...handle };
}

const row: Row = { id: "a", name: "Ribbon", notes: null, tags: ["baker"] };

describe("useRecordDraft (#946)", () => {
  it("saves only the columns the user changed, never the ones they left alone", async () => {
    const { draft, source, changes } = setup(row);
    // Another DM renames the NPC while this editor is open on a stale copy...
    source.value = { ...row, name: "Ribbon the Elder" };
    await nextTick();
    // ...and this one only writes notes.
    draft.notes = "Owes the guild";
    expect(changes(build)).toEqual({ notes: "Owes the guild" });
  });

  it("brings fresh server values into fields the user has not touched", async () => {
    const { draft, source, conflicts } = setup(row);
    draft.notes = "mine";
    source.value = { ...row, name: "Renamed elsewhere", tags: ["baker", "spy"] };
    await nextTick();
    // Only the user's own field is theirs; the server did not touch it, so nothing conflicts.
    expect(conflicts.value).toEqual([]);
    expect(draft.name).toBe("Renamed elsewhere");
    expect(draft.tags).toEqual(["baker", "spy"]);
    expect(draft.notes).toBe("mine");
  });

  it("names a field both sides changed, and keeps the user's edit in it", async () => {
    const { draft, source, conflicts } = setup(row);
    draft.name = "Mine";
    source.value = { ...row, name: "Theirs" };
    await nextTick();
    expect(draft.name).toBe("Mine");
    expect(conflicts.value).toEqual(["name"]);
  });

  it("is no conflict when both sides changed a field to the same thing", async () => {
    const { draft, source, conflicts } = setup(row);
    draft.name = "Ribbon the Elder";
    source.value = { ...row, name: "Ribbon the Elder" };
    await nextTick();
    expect(conflicts.value).toEqual([]);
  });

  it("drops a conflict once the user's text matches what the server now holds", async () => {
    const { draft, source, conflicts } = setup(row);
    draft.name = "Mine";
    source.value = { ...row, name: "Theirs" };
    await nextTick();
    expect(conflicts.value).toEqual(["name"]);

    draft.name = "Theirs";
    source.value = { ...row, name: "Theirs", notes: "unrelated" };
    await nextTick();
    expect(conflicts.value).toEqual([]);
  });

  it("keeps the draft when the source briefly reads as nothing (a refetch in flight)", async () => {
    const { draft, source } = setup(row);
    draft.notes = "mine";
    source.value = null;
    await nextTick();
    expect(draft.notes).toBe("mine");
  });

  it("is clean again when the refetch confirms its own save", async () => {
    const { draft, source, dirty, commit } = setup(row);
    draft.notes = "saved";
    expect(dirty.value).toBe(true);
    commit();
    expect(dirty.value).toBe(false);
    source.value = { ...row, notes: "saved" };
    await nextTick();
    expect(dirty.value).toBe(false);
    expect(draft.notes).toBe("saved");
  });

  it("re-seeds whole for a different record", async () => {
    const { draft, source, dirty } = setup(row);
    draft.notes = "about Ribbon";
    source.value = { id: "b", name: "Sentry", notes: null, tags: [] };
    await nextTick();
    expect(draft).toEqual({ name: "Sentry", notes: "", tags: [] });
    expect(dirty.value).toBe(false);
  });

  it("seeds when the record arrives after mount", async () => {
    const { draft, source, seeded } = setup(null);
    expect(seeded.value).toBe(false);
    source.value = row;
    await nextTick();
    expect(seeded.value).toBe(true);
    expect(draft.name).toBe("Ribbon");
  });

  it("does not share nested arrays between the draft and the server copy", () => {
    const { draft, changes } = setup(row);
    draft.tags.push("spy");
    expect(changes(build)).toEqual({ tags: ["baker", "spy"] });
  });

  it("reset puts the server copy back", () => {
    const { draft, reset, dirty } = setup(row);
    draft.name = "oops";
    reset();
    expect(draft.name).toBe("Ribbon");
    expect(dirty.value).toBe(false);
  });
});

describe("draftValueEqual", () => {
  it("tells arrays from objects, and sees a key only one side has", () => {
    expect(draftValueEqual([], {})).toBe(false);
    expect(draftValueEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(draftValueEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(draftValueEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
  });
});

describe("changedColumns / mergeDraft", () => {
  it("compares built rows, so a draft field feeding a transformed column still diffs correctly", () => {
    expect(changedColumns({ notes: null, name: "A" }, { notes: null, name: "B" })).toEqual({ name: "A" });
  });

  it("reports nothing when only the server moved on an untouched field", () => {
    const live = { a: 1, b: 2 };
    expect(mergeDraft(live, { a: 1, b: 2 }, { a: 5, b: 2 })).toEqual([]);
    expect(live).toEqual({ a: 5, b: 2 });
  });
});
