import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useAutosave } from "@/composables/useAutosave";
import type { EntityNote } from "@/types/faction.types";
import { useCreateEntityNote, useDeleteEntityNote, useUpdateEntityNote } from "./useEntityNotes";

export interface MyNoteDraft {
  content: string | null;
  sharedWithDm: boolean;
  /** Null until the first save creates the row. */
  noteId: string | null;
  // The entity travels in the draft so a save still in the debounce when the
  // widget is pointed at another entity lands on the one it was typed about.
  entityType: string;
  entityId: string;
}

// Wrappers whose text decides whether there is anything in them. Any other node
// (a mention, an image, a table) is content in its own right.
const TEXT_CONTAINERS = new Set([
  "doc", "paragraph", "heading", "hardBreak", "bulletList", "orderedList", "listItem", "blockquote",
]);

function hasContent(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const { type, text, content } = node as { type?: string; text?: unknown; content?: unknown };
  if (type === "text") return typeof text === "string" && text.trim() !== "";
  if (type && !TEXT_CONTAINERS.has(type)) return true;
  return Array.isArray(content) && content.some(hasContent);
}

/**
 * True for a note with nothing in it: no value, or a Tiptap document holding
 * only empty paragraphs (what the editor emits once its text is deleted).
 * Legacy plain text is content.
 */
export function isBlankNote(content: string | null | undefined): boolean {
  if (!content?.trim()) return true;
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return false;
  }
  return !hasContent(doc);
}

export function myNoteDraftsEqual(a: MyNoteDraft, b: MyNoteDraft): boolean {
  const sameContent = a.content === b.content || (isBlankNote(a.content) && isBlankNote(b.content));
  return sameContent && a.sharedWithDm === b.sharedWithDm;
}

/**
 * The signed-in user's one private or one party note on an entity, saving
 * itself as they type. A blank note is never created, so opening an entity
 * and leaving writes nothing.
 */
export function useMyEntityNote(options: {
  entityType: MaybeRefOrGetter<string>;
  entityId: MaybeRefOrGetter<string>;
  /** The entity's notes, as `useEntityNotes` reads them. */
  notes: MaybeRefOrGetter<EntityNote[] | undefined>;
  userId: MaybeRefOrGetter<string | null | undefined>;
  isPrivate: boolean;
  /**
   * The campaign a note this creates is filed under, asked at the moment it is
   * created; omitted, it is created without a campaign.
   */
  campaignFor?: (snapshot: MyNoteDraft) => Promise<string | null>;
  /** Called after each save that landed, with the snapshot that was written. */
  onSaved?: (snapshot: MyNoteDraft) => void;
}) {
  const { isPrivate } = options;
  const createMut = useCreateEntityNote();
  const updateMut = useUpdateEntityNote();
  const deleteMut = useDeleteEntityNote();

  const mine = computed(
    () =>
      toValue(options.notes)?.find(
        (n) => n.user_id === toValue(options.userId) && n.is_private === isPrivate,
      ) ?? null,
  );

  const fromRow = (row: EntityNote | null): MyNoteDraft => ({
    content: row?.content ?? null,
    sharedWithDm: row?.shared_with_dm ?? false,
    noteId: row?.id ?? null,
    entityType: row?.entity_type ?? toValue(options.entityType),
    entityId: row?.entity_id ?? toValue(options.entityId),
  });

  const draft = reactive(fromRow(mine.value));

  async function save(snapshot: MyNoteDraft) {
    const sharedWithDm = isPrivate && snapshot.sharedWithDm;
    if (snapshot.noteId) {
      await updateMut.mutateAsync({
        id: snapshot.noteId,
        content: snapshot.content ?? "",
        is_private: isPrivate,
        shared_with_dm: sharedWithDm,
        entity_type: snapshot.entityType,
        entity_id: snapshot.entityId,
      });
      options.onSaved?.(snapshot);
      return;
    }
    const campaignId = options.campaignFor ? await options.campaignFor(snapshot) : undefined;
    const created = await createMut.mutateAsync({
      entity_type: snapshot.entityType,
      entity_id: snapshot.entityId,
      content: snapshot.content ?? "",
      is_private: isPrivate,
      shared_with_dm: sharedWithDm,
      ...(campaignId !== undefined && { campaign_id: campaignId }),
    });
    // The next save updates this row rather than creating a second one, even
    // before the refetch brings it back.
    if (!draft.noteId && draft.entityType === snapshot.entityType && draft.entityId === snapshot.entityId) {
      draft.noteId = created.id;
    }
    options.onSaved?.(snapshot);
  }

  const autosave = useAutosave({
    draft,
    initial: () => fromRow(mine.value),
    equal: myNoteDraftsEqual,
    save,
    canSave: () => draft.noteId !== null || !isBlankNote(draft.content),
    errorMessage: "Could not save the note",
  });

  // RichTextEditor reads its value once and then only emits, so text replaced
  // from here never reaches it. Bumped whenever that happens, as the editor's
  // key; the echo of our own save carries the same text and leaves the editor
  // (and the cursor in it) alone.
  const revision = ref(0);
  function rehydrate(next: MyNoteDraft) {
    const replaced = next.content !== draft.content;
    autosave.reset(next);
    if (replaced) revision.value++;
  }

  // Fresh server copy (first load, another device) reaches a note the user is
  // not in the middle of; one being typed in keeps the typing.
  watch(mine, (row) => {
    if (autosave.dirty.value || autosave.saving.value) return;
    rehydrate(fromRow(row));
  });

  // Pointed at another entity: send what was typed about the last one first.
  watch(
    () => `${toValue(options.entityType)}:${toValue(options.entityId)}`,
    async () => {
      await autosave.saveNow();
      rehydrate(fromRow(mine.value));
    },
  );

  async function clear() {
    const { noteId, entityType, entityId } = draft;
    if (!noteId) return;
    await autosave.hold();
    try {
      await deleteMut.mutateAsync({ id: noteId, entity_type: entityType, entity_id: entityId });
      rehydrate(fromRow(null));
    } finally {
      autosave.release();
    }
  }

  return {
    draft,
    status: autosave.status,
    saveError: autosave.saveError,
    exists: computed(() => draft.noteId !== null),
    revision,
    clear,
  };
}
