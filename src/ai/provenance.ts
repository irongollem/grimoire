import type { AiProvenance } from "@edge-shared/provenance/types.ts";

export type { AiProvenance };

/**
 * The ONLY place client code constructs an `AiProvenance` record. Used by the
 * client-direct BYOK generators (monster, item, spell, faction, puzzle) and by
 * the local-key (`runLocal()`) paths inside the server-backed generator
 * composables — both bypass the edge function, which is where every other
 * generator's provenance is built (see the `ai_provenance` object each
 * `supabase/functions/generate-*` function returns in its draft JSON).
 *
 * `generatorType` should match the string the equivalent edge function uses
 * (e.g. "npc_text", "location_generation") so a query for "what generated
 * this row" gets the same answer regardless of which path produced it.
 */
export function buildAiProvenance(
  generatorType: string,
  provider: string,
  model: string,
): AiProvenance {
  return {
    generatorType,
    provider,
    model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };
}

/**
 * The ONLY place client code flips `edited` true. Every DM editor that
 * material-edits AI-generated content routes its save payload through this
 * function instead of setting `edited` inline, so the "never reverts to
 * false, never removed" rule (architecture doc §6) has one enforcement point.
 */
export function markEdited(prov: AiProvenance | null | undefined): AiProvenance | null {
  if (prov == null) return null;
  if (prov.edited) return prov;
  return { ...prov, edited: true };
}
