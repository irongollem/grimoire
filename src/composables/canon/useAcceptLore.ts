import type { AiProvenance } from "@/ai/provenance";
import type { LoreSuggestion } from "@/ai/useCanonSuggestions";
import { plainTextToTiptap } from "@/lib/canon/canonParts";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCreateCanonPassage, useDeleteCanonPassage } from "@/composables/canon/useCanonPassages";
import type { NewCanonPassage } from "@/lib/canon/canonPassageWrites";
import type { CanonLorePassage } from "@/types/canon.types";

type Passage = LoreSuggestion["passages"][number];

/** A passage comes out at exactly one of the three places; only the column matching the suggested spot is set. */
export function passageInput(entryId: string, p: Passage, sortOrder: number, provenance: AiProvenance | null): NewCanonPassage {
  const base = { entry_id: entryId, title: p.title, body: plainTextToTiptap(p.body), sort_order: sortOrder, ...(provenance ? { ai_provenance: { ...provenance } } : {}) };
  if (p.spot === null) return base;
  if (p.spot.kind === "location") return { ...base, location_id: p.spot.id };
  if (p.spot.kind === "npc") return { ...base, npc_id: p.spot.id };
  return { ...base, quest_beat_id: p.spot.id };
}

/**
 * What a split may replace: a passage not yet told and not the place a clue points at. A told passage is what the
 * players already heard, and a clue's passage would lose the link (`canon_clues.passage_id` goes null) if deleted.
 */
export function splitReplacement(
  existing: readonly CanonLorePassage[],
  cluePassageIds: ReadonlySet<string>,
): { replace: CanonLorePassage[]; kept: CanonLorePassage[] } {
  const replace: CanonLorePassage[] = [];
  const kept: CanonLorePassage[] = [];
  for (const p of existing) (p.told_at !== null || cluePassageIds.has(p.id) ? kept : replace).push(p);
  return { replace, kept };
}

/**
 * Writes an accepted lore suggestion (#1226 story 5). A draft makes the entry and its passages; a split keeps the entry
 * and replaces its untold, clue-free passages (`splitReplacement`); kept passages stay where they are and the new ones
 * come after the last of all. Nothing is written before the DM accepts, and a split writes the new passages before it
 * removes the old ones, so a failure part-way leaves the old text in place.
 */
export function useAcceptLore() {
  const { mutateAsync: createEntry } = useCreateCanonEntry();
  const { mutateAsync: createPassage } = useCreateCanonPassage();
  const { mutateAsync: deletePassage } = useDeleteCanonPassage();

  async function draft(s: LoreSuggestion, provenance: AiProvenance | null, sortOrder: number): Promise<string> {
    const stamp = provenance ? { ai_provenance: { ...provenance } } : {};
    const entry = await createEntry({ part: "lore", title: s.title, lore_kind: s.kind, sort_order: sortOrder, ...stamp });
    for (const [i, p] of s.passages.entries()) await createPassage(passageInput(entry.id, p, i, provenance));
    return entry.id;
  }

  async function split(s: LoreSuggestion, entryId: string, provenance: AiProvenance | null, existing: readonly CanonLorePassage[], replace: readonly CanonLorePassage[]): Promise<void> {
    const start = existing.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
    for (const [i, p] of s.passages.entries()) await createPassage(passageInput(entryId, p, start + i, provenance));
    for (const old of replace) await deletePassage(old.id);
  }

  return { draft, split };
}
