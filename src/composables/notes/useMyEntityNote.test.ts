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
    created_at: "2026-10-05",
    updated_at: "2026-10-05",
    ...over,
  };
}

function setup(initial: EntityNote[] = [], isPrivate = true) {
  const notes = ref<EntityNote[] | undefined>(initial);
  const entityId = ref("npc-1");
  let handle!: ReturnType<typeof useMyEntityNote>;
  mount(defineComponent({
    setup() {
      handle = useMyEntityNote({ entityType: "npc", entityId, notes, userId: "me", isPrivate });
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
