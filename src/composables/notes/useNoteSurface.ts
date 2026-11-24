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

export interface NoteSurface {
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

/** Registers the editor's note for as long as the calling scope lives. A later editor replaces an earlier one. */
export function provideNoteSurface(next: NoteSurface): void {
  surface.value = next;
  onScopeDispose(() => {
    // A newer editor may have registered meanwhile: only take away what is still ours.
    if (surface.value === next) surface.value = null;
  });
}
