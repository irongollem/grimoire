/**
 * Ask Grimoire (#1270): why the open note cannot take what a note card wrote, shared by Write Chronicle and Scene
 * illustration so they say it alike.
 *
 * A card opened from a note editor names that note (`proposal.target`: the saved note's id, or for a note not saved yet
 * the editor's instance token). It applies to that note only: another note's editor open when the run ends is never
 * written into. A card with no target (one the model proposed) applies to the note that is open, as it always did.
 *
 * Not an adapter: the registry finds adapters by the `*AskAdapter.ts` name, which this file does not have.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import { NOTE_INSTANCE_PREFIX, currentNoteSurface, surfaceIsTarget } from "@/composables/notes/useNoteSurface";

/** The sentence for a card whose note is no longer the open one, or null when the open note is the card's. */
export function noteSurfaceBlock(proposal: AskProposal, what: string): string | null {
  const open = currentNoteSurface.value;
  const target = proposal.target;
  if (target === undefined) return open === null ? `Open the note to ${what} first: it goes into the open note.` : null;
  if (open !== null && surfaceIsTarget(open, target.id)) return null;
  // A note not saved yet is its editor, and that editor is gone for good: there is nothing to reopen.
  if (target.id.startsWith(NOTE_INSTANCE_PREFIX)) return "The note this was written for is closed.";
  return `"${target.name}" is not the note that is open. Open it first.`;
}
