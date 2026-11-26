import type { AiProvenance } from "@/ai/provenance";
import type { ArcSuggestion, BackstorySuggestion, CanonSuggestionMode, PeopleSuggestion } from "@/ai/useCanonSuggestions";
import { useQueryClient } from "@tanstack/vue-query";
import { CANON_KEY, trashCanonEntry } from "@/composables/canon/useCanonEntries";
import { useDeleteCanonClue } from "@/composables/canon/useCanonClues";
import { useCanonArcActions, useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useOpenBackstory } from "@/composables/canon/useBackstory";
import { useCanonPassages, useCreateCanonPassage, useDeleteCanonPassage } from "@/composables/canon/useCanonPassages";
import { passageInput } from "@/composables/canon/useAcceptLore";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";

/**
 * What an accept wrote, as a way to take it back (#1282 story 6): null when nothing was written (declined, refused),
 * `undo: null` when the write cannot be reversed safely. An undo reverses exactly what that accept made, by id.
 */
export type Accepted = { undo: (() => Promise<void>) | null } | null;

/**
 * The writes behind Accept on the three proposals of "Design it with me" (#1282): an arc, a people and a passage of a
 * backstory. Nothing here runs before the DM accepts, and each returns whether it wrote, so the review keeps a
 * proposal that failed. The other modes' accepts stay in `CanonReview`.
 */
export function useCanonReviewAccept(opts: { mode: () => CanonSuggestionMode; provenance: () => AiProvenance | null }) {
  const qc = useQueryClient();
  const { add: addArc, remove: removeArc } = useCanonArcActions();
  const { data: arcs } = useCanonArcs(() => opts.mode() === "arcs");
  const { addPeopleAsync, removePeopleAsync } = usePeoplesEditing();
  const { mutateAsync: openBackstory } = useOpenBackstory();
  const { mutateAsync: createPassage } = useCreateCanonPassage();
  const { mutateAsync: deletePassage } = useDeleteCanonPassage();
  const { mutateAsync: deleteClue } = useDeleteCanonClue();
  const { data: passages } = useCanonPassages(() => opts.mode() === "backstory");

  /** New arcs come in planned, after the last one: the DM decides when each starts running. */
  async function acceptArc(s: ArcSuggestion): Promise<Accepted> {
    const arc = await addArc.mutateAsync({
      name: s.name,
      summary: s.summary,
      question: s.question,
      stakes: s.stakes,
      theme_id: s.themeId,
      status: "planned",
      sort_order: (arcs.value ?? []).length,
    });
    return { undo: async () => void (await removeArc.mutateAsync(arc.id)) };
  }

  /** The share goes in as proposed; a refused write (the hundred-percent rule) was toasted by the hook and keeps the proposal. */
  async function acceptPeople(s: PeopleSuggestion): Promise<Accepted> {
    let id: string;
    try {
      id = await addPeopleAsync({ kind: "species", recordId: s.recordId, fromLibrary: s.kind === "library_species", percent: s.percent, name: s.name });
    } catch {
      return null;
    }
    return { undo: async () => void (await removePeopleAsync(id)) };
  }

  /** Opens the character's backstory if it is not yet, and writes the passage at the end. It is untold and the DM's own. */
  async function acceptBackstory(s: BackstorySuggestion, partyMemberId: string): Promise<Accepted> {
    const entryId = await openBackstory(partyMemberId);
    const start = (passages.value ?? []).filter((p) => p.entry_id === entryId).reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
    const passage = await createPassage(passageInput(entryId, { title: s.title, body: s.body, spot: null }, start, opts.provenance()));
    // The backstory entry itself stays: opening one is idempotent and it was never the proposal's.
    return { undo: async () => void (await deletePassage(passage.id)) };
  }

  /**
   * Takes back an entry an accept made. The Canon's own trash write, so it goes to Deleted with the ties, clues, steps
   * and passages that hang off it (`trash_canon_entry`); the tab's own "Moved to Deleted" toast is left out because
   * its Restore would bring back what the row now says is pending.
   */
  async function trashEntry(id: string): Promise<void> {
    await trashCanonEntry(id);
    await qc.invalidateQueries({ queryKey: [CANON_KEY] });
  }

  return { acceptArc, acceptPeople, acceptBackstory, trashEntry, removeClue: async (id: string) => void (await deleteClue(id)) };
}
