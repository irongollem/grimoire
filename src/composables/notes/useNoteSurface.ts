/**
 * The note that is open for writing, as the Familiar's cards see it (#1270 story 7).
 *
 * Write Chronicle and Scene illustration fill the note the DM has open, and what they fill lives in that editor's draft
 * and its text, not in a saved row: a chronicle is put into the body and the title, session and tags of a note that
 * may not exist yet, and a scene's picture is anchored at the cursor. The editor registers itself while it is mounted
 * (`provideNoteSurface`), and the cards' adapters read `currentNoteSurface`, so the Familiar needs no reference to the
 * editor and the editor needs none to the Familiar. With no note open there is no surface, and the cards say so.
 */
import { computed, onScopeDispose, shallowRef } from "vue";
import type { ChronicleInsert } from "@/types/chronicler.types";

/** A token starts with this, so a card's `target.id` is recognisably an editor instance and never a note's id. */
export const NOTE_INSTANCE_PREFIX = "note-editor:";

let sequence = 0;

export interface NoteSurface {
  /**
   * This one editor, for as long as it lives (`provideNoteSurface` makes it): a card opened from a note not saved yet
   * has no note id to name its note by, and without one it would write into whichever note editor is open later.
   */
  readonly instance: string;
  /** The saved note's id; null for a note not saved yet (a new one, whose chronicle may still be written). */
  noteId(): string | null;
  /** The note's own title and linked session number, so a suggestion is offered rather than written over them. */
  title(): string;
  sessionNum(): number | null;
  /** What the DM sees land: a chronicle goes into the text, title, session and tags exactly as the editor's own insert. */
  insertChronicle(chronicle: ChronicleInsert): void;
  /** A queued scene picture takes its place in the text (the suggestion the DM clicked, else the cursor). */
  insertScene(job: { jobId: string; prompt: string; size: string }): void;
}

const surface = shallowRef<NoteSurface | null>(null);

/** The open note editor, or null. Read-only: only the editor registers. */
export const currentNoteSurface = computed(() => surface.value);

/**
 * Whether the card that names `targetId` is for this editor: it opened from this very instance (a note not saved yet,
 * which stays this editor's after it is saved), or it names the saved note this editor has open.
 */
export function surfaceIsTarget(open: NoteSurface, targetId: string): boolean {
  return targetId === open.instance || targetId === open.noteId();
}

/**
 * Registers the editor's note for as long as the calling scope lives. A later editor replaces an earlier one. Returns
 * the editor's instance token, which the editor puts in the `target` of the cards it opens.
 */
export function provideNoteSurface(next: Omit<NoteSurface, "instance">): string {
  sequence += 1;
  const registered: NoteSurface = { ...next, instance: `${NOTE_INSTANCE_PREFIX}${sequence}` };
  surface.value = registered;
  onScopeDispose(() => {
    // A newer editor may have registered meanwhile: only take away what is still ours.
    if (surface.value === registered) surface.value = null;
  });
  return registered.instance;
}
