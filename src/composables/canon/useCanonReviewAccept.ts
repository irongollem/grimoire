import type { AiProvenance } from "@/ai/provenance";
import type { ArcSuggestion, BackstorySuggestion, CanonSuggestionMode, HabitatSuggestion, PeopleSuggestion, SpeciesSuggestion } from "@/ai/useCanonSuggestions";
import { useQueryClient } from "@tanstack/vue-query";
import { CANON_KEY, trashCanonEntry } from "@/composables/canon/useCanonEntries";
import { useDeleteCanonClue } from "@/composables/canon/useCanonClues";
import { useCanonArcActions, useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useOpenBackstory } from "@/composables/canon/useBackstory";
import { useCanonPassages, useCreateCanonPassage, useDeleteCanonPassage } from "@/composables/canon/useCanonPassages";
import { passageInput } from "@/composables/canon/useAcceptLore";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { deleteHabitat, insertHabitat, insertHabitatSpecies, updateHabitat } from "@/composables/canon/useCampaignHabitats";
import { useCampaignStore } from "@/stores/campaign";
import { plainTextToTiptap } from "@/lib/canon/canonParts";

/**
 * What an accept wrote, as a way to take it back (#1282 story 6): null when nothing was written (declined, refused),
 * `undo: null` when the write cannot be reversed safely. An undo reverses exactly what that accept made, by id.
 */
export type Accepted = { undo: (() => Promise<void>) | null } | null;

const nameKey = (campaignId: string, name: string) => `${campaignId}|${name.trim().toLowerCase().replace(/\s+/g, " ")}`;

/**
 * Species accepted from the field guide proposals, by campaign and name, and the links that wait for a species of the
 * same answer that is not accepted yet. Module state because every review mounts its own composable but one answer is
 * accepted across them. A link to another species of the answer is written once both are in the guide.
 */
const acceptedSpecies = new Map<string, string>();
interface WaitingLink { fromId: string; kind: SpeciesSuggestion["links"][number]["kind"]; toKey: string; note: string | null }
let waitingLinks: WaitingLink[] = [];

/** Test seam: forget the species of an earlier answer. */
export function resetAcceptedSpecies() {
  acceptedSpecies.clear();
  waitingLinks = [];
}

/**
 * The writes behind Accept on the proposals of "Design it with me" (#1282): an arc, a people and a passage of a
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
  const campaign = useCampaignStore();
  const species = useSpeciesEditing(() => false);

  const campaignId = (): string => {
    const id = campaign.activeCampaignId;
    if (!id) throw new Error("No campaign is open.");
    return id;
  };

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
   * One species of the field guide: its clade (made when the answer names a new one), the species, its forms (a bare
   * Adult when it has none) and its links to existing species. A link to another species of the same answer waits until
   * that one is accepted too. A write that failed was toasted by the hook: what this accept already made is taken back
   * and the proposal stays. Undo removes the species (its forms and links go with it) and the clade only if this made it.
   */
  async function acceptSpecies(s: SpeciesSuggestion): Promise<Accepted> {
    const cid = campaignId();
    let newCladeId: string | null = null;
    let speciesId: string | null = null;
    const takeBack = async () => {
      if (speciesId !== null) await species.removeSpecies(speciesId);
      if (newCladeId !== null) await species.removeClade(newCladeId);
    };
    let cladeId: string | null = s.clade?.id ?? null;
    if (s.clade !== null && s.clade.id === null) {
      newCladeId = await species.addClade(s.clade.name, null);
      if (newCladeId === null) return null;
      cladeId = newCladeId;
    }
    speciesId = await species.addSpecies(s.name);
    if (speciesId === null) {
      await takeBack();
      return null;
    }
    const patched = await species.updateSpecies(speciesId, {
      scientificName: s.scientificName,
      cladeId,
      kingdom: s.kingdom,
      livesAs: s.livesAs,
      activity: s.activity,
      description: s.description === "" ? null : plainTextToTiptap(s.description),
    });
    if (patched === null) {
      await takeBack();
      return null;
    }
    for (const form of s.forms.length > 0 ? s.forms : [{ label: "Adult", domesticated: false }]) {
      if ((await species.addForm(speciesId, { label: form.label, domesticated: form.domesticated })) === null) {
        await takeBack();
        return null;
      }
    }
    const here = speciesId;
    for (const link of s.links) {
      if (link.toName === null) {
        // A link that fails was toasted; the species stays without it.
        await species.addLink({ fromSpeciesId: here, kind: link.kind, toSpeciesId: link.toSpeciesId, note: link.note });
        continue;
      }
      const target = acceptedSpecies.get(nameKey(cid, link.toName));
      if (target !== undefined) await species.addLink({ fromSpeciesId: here, kind: link.kind, toSpeciesId: target, note: link.note });
      else waitingLinks.push({ fromId: here, kind: link.kind, toKey: nameKey(cid, link.toName), note: link.note });
    }
    const key = nameKey(cid, s.name);
    acceptedSpecies.set(key, here);
    // Links that were waiting for this species are written now that it exists.
    const ready = waitingLinks.filter((w) => w.toKey === key);
    waitingLinks = waitingLinks.filter((w) => w.toKey !== key);
    for (const w of ready) await species.addLink({ fromSpeciesId: w.fromId, kind: w.kind, toSpeciesId: here, note: w.note });
    return {
      undo: async () => {
        acceptedSpecies.delete(key);
        waitingLinks = waitingLinks.filter((w) => w.fromId !== here);
        await takeBack();
      },
    };
  }

  /** A habitat with its description and its species, each with how common it is there; a failure takes the habitat back out. */
  async function acceptHabitat(s: HabitatSuggestion): Promise<Accepted> {
    const cid = campaignId();
    const habitatId = await insertHabitat(cid, s.name);
    try {
      if (s.description !== "") await updateHabitat(habitatId, { description: plainTextToTiptap(s.description) });
      for (const sp of s.species) await insertHabitatSpecies(cid, habitatId, sp.speciesId, sp.abundance);
    } catch (e) {
      await deleteHabitat(habitatId);
      await qc.invalidateQueries({ queryKey: [CANON_KEY] });
      throw e;
    }
    await qc.invalidateQueries({ queryKey: [CANON_KEY] });
    // The habitat's species and roll rows go with it (on delete cascade).
    return {
      undo: async () => {
        await deleteHabitat(habitatId);
        await qc.invalidateQueries({ queryKey: [CANON_KEY] });
      },
    };
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

  return { acceptArc, acceptPeople, acceptBackstory, acceptSpecies, acceptHabitat, trashEntry, removeClue: async (id: string) => void (await deleteClue(id)) };
}
