import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import type { EntityNote } from "@/types/faction.types";
import { isBlankNote, useMyEntityNote } from "./useMyEntityNote";

const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock("./useEntityNotes", () => ({
  useCreateEntityNote: () => ({ mutateAsync: create }),
  useUpdateEntityNote: () => ({ mutateAsync: update }),
  useDeleteEntityNote: () => ({ mutateAsync: remove }),
}));

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }] });

function row(over: Partial<EntityNote> = {}): EntityNote {
  return {
    id: "note-1",
    user_id: "me",
    campaign_id: null,
    entity_type: "npc",
    entity_id: "npc-1",
    content: doc("Owes us a favour"),
    is_private: true,
    shared_with_dm: false,
    written_as_dm: false,
    created_at: "2026-10-05",
    updated_at: "2026-10-05",
    ...over,
  };
}

function setup(
  initial: EntityNote[] = [],
  isPrivate = true,
  writtenAsDm = false,
  campaignFor?: (snapshot: { entityId: string }) => Promise<string | null>,
) {
  const notes = ref<EntityNote[] | undefined>(initial);
  const entityId = ref("npc-1");
  let handle!: ReturnType<typeof useMyEntityNote>;
  mount(defineComponent({
    setup() {
      handle = useMyEntityNote({ entityType: "npc", entityId, notes, userId: "me", isPrivate, writtenAsDm, campaignFor });
      return () => null;
    },
  }));
  return { notes, entityId, handle };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(2500);
  await flushPromises();
}

describe("isBlankNote", () => {
  it("treats no value and a document of empty paragraphs as blank", () => {
    expect(isBlankNote(null)).toBe(true);
    expect(isBlankNote("")).toBe(true);
    expect(isBlankNote(doc(""))).toBe(true);
    expect(isBlankNote(doc("   "))).toBe(true);
  });

  it("treats text, legacy plain text and non-text nodes as content", () => {
    expect(isBlankNote(doc("x"))).toBe(false);
    expect(isBlankNote("plain old note")).toBe(false);
    expect(isBlankNote(JSON.stringify({ type: "doc", content: [{ type: "mention", attrs: { id: "a" } }] }))).toBe(false);
  });
});

describe("useMyEntityNote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    create.mockReset().mockResolvedValue(row({ id: "created" }));
    update.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  // Someone who has sat in the DM chair and at the table holds both on the
  // same entity (#590); each surface edits its own and never the other.
  it("picks the DM note or the player note by how it was written", () => {
    const notes = [
      row({ id: "as-player", content: doc("I think he lies") }),
      row({ id: "as-dm", written_as_dm: true, content: doc("He lies") }),
    ];
    expect(setup(notes, true, false).handle.draft.noteId).toBe("as-player");
    expect(setup(notes, true, true).handle.draft.noteId).toBe("as-dm");
  });

  it("never picks up another user's note on the entity, nor the other visibility", () => {
    const notes = [
      row({ id: "theirs", user_id: "someone-else" }),
      row({ id: "my-party-note", is_private: false }),
      row({ id: "my-private-note" }),
    ];
    expect(setup([notes[0]]).handle.draft.noteId).toBeNull();
    expect(setup(notes, true).handle.draft.noteId).toBe("my-private-note");
    expect(setup(notes, false).handle.draft.noteId).toBe("my-party-note");
  });

  it("says which kind of note it creates", async () => {
    const { handle } = setup([], true, true);
    handle.draft.content = doc("Cult leader");
    await settle();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ written_as_dm: true }));
  });

  it("writes nothing for an untouched or blank note", async () => {
    const { handle } = setup();
    handle.draft.content = doc("");
    handle.draft.sharedWithDm = true;
    await settle();
    expect(create).not.toHaveBeenCalled();
    expect(handle.status.value).toBe("paused");
  });

  it("creates the note on the first save and updates that row afterwards", async () => {
    const { handle } = setup();
    handle.draft.content = doc("Hates the duke");
    await settle();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: "npc", entity_id: "npc-1", is_private: true, content: doc("Hates the duke"),
    }));

    handle.draft.content = doc("Hates the duke. Loves cats.");
    await settle();
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "created", content: doc("Hates the duke. Loves cats.") }));
  });

  it("never shares a party note with the DM", async () => {
    const { handle } = setup([], false);
    handle.draft.content = doc("Shop opens at dawn");
    await settle();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ is_private: false, shared_with_dm: false }));
  });

  it("never shares an existing party note with the DM, whatever the toggle says", async () => {
    const { handle } = setup([row({ is_private: false })], false);
    handle.draft.sharedWithDm = true;
    await settle();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "note-1", is_private: false, shared_with_dm: false }));
  });

  it("saves a note the DM has emptied rather than leaving the old text on the server", async () => {
    const { handle } = setup([row()]);
    handle.draft.content = doc("");
    await settle();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "note-1", content: doc("") }));
  });

  it.each([
    ["files the note under the campaign it names", async () => "camp-9", { campaign_id: "camp-9" }],
    ["files a note under no campaign when the caller says so", async () => null, { campaign_id: null }],
  ])("%s", async (_label, campaignFor, expected) => {
    const { handle } = setup([], true, true, campaignFor);
    handle.draft.content = doc("Cult leader");
    await settle();
    expect(create).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it("leaves the campaign off the insert when the caller does not choose one", async () => {
    const { handle } = setup();
    handle.draft.content = doc("x");
    await settle();
    expect(create.mock.calls[0][0]).not.toHaveProperty("campaign_id");
  });

  it("saves the share toggle on an existing note", async () => {
    const { handle } = setup([row()]);
    handle.draft.sharedWithDm = true;
    await settle();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: "note-1", shared_with_dm: true }));
  });

  it("takes a fresh server copy when the note is not being typed in", async () => {
    const { notes, handle } = setup([row()]);
    notes.value = [row({ content: doc("Edited on the phone") })];
    await flushPromises();
    expect(handle.draft.content).toBe(doc("Edited on the phone"));
    expect(handle.revision.value).toBe(1);
  });

  it("leaves the editor mounted when the refetch is the echo of its own save", async () => {
    const { notes, handle } = setup();
    handle.draft.content = doc("Mine");
    await settle();
    notes.value = [row({ id: "created", content: doc("Mine") })];
    await flushPromises();
    expect(handle.revision.value).toBe(0);
  });

  it("keeps the typing when a refetch lands mid-edit", async () => {
    const { notes, handle } = setup([row()]);
    handle.draft.content = doc("Typing…");
    await vi.advanceTimersByTimeAsync(0);
    notes.value = [row({ content: doc("Older") })];
    await flushPromises();
    expect(handle.draft.content).toBe(doc("Typing…"));
  });

  it("saves what was typed onto the entity it was typed about when the entity changes", async () => {
    const { notes, entityId, handle } = setup();
    handle.draft.content = doc("About the first NPC");
    await vi.advanceTimersByTimeAsync(0);
    entityId.value = "npc-2";
    notes.value = undefined;
    await flushPromises();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ entity_id: "npc-1", content: doc("About the first NPC") }));
    expect(handle.draft.entityId).toBe("npc-2");
    expect(handle.draft.content).toBeNull();
  });

  it("clear on a note that was never saved deletes nothing", async () => {
    const { handle } = setup();
    await handle.clear();
    expect(remove).not.toHaveBeenCalled();
  });

  it("clear waits for a save still in flight, so the delete is not followed by a late update", async () => {
    let finish!: () => void;
    update.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { handle } = setup([row()]);
    handle.draft.content = doc("Edited");
    await vi.advanceTimersByTimeAsync(2500);
    const cleared = handle.clear();
    await flushPromises();
    expect(remove).not.toHaveBeenCalled();
    finish();
    await cleared;
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("clear deletes the note and empties the editor without saving it again", async () => {
    const { handle } = setup([row()]);
    await handle.clear();
    expect(remove).toHaveBeenCalledWith({ id: "note-1", entity_type: "npc", entity_id: "npc-1" });
    expect(handle.draft.content).toBeNull();
    expect(handle.exists.value).toBe(false);
    expect(handle.revision.value).toBe(1);
    await settle();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
