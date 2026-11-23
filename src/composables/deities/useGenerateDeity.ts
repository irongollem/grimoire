/**
 * "Generate a deity with AI and save it": the generation-to-create mapping `DeityGeneratorPanel.vue` used to own
 * inline, extracted so Ask Grimoire (#1253) runs the same pipeline the page does.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps navigation, the paywall, toasts and its form state,
 * and a failed save throws so the page can keep the paid result and offer to save it again.
 *
 * A deity is two writes: the row, then the DM's private note holding its secrets. The deity exists once the first
 * succeeds, so a failed note is reported (`notesFailure`) and never throws: a retry must not make a second deity.
 *
 * Ties other than the pantheon (a faction that serves them, a holy place, a relic) go through `links`, written after
 * the save by the page's own `applyGeneratorLinks`; they ride on the draft so a retried save still writes them.
 */
import { useCreateDeity } from "@/composables/deities/useDeities";
import { useCreateEntityNote } from "@/composables/notes/useEntityNotes";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useDeityGeneration } from "@/ai/useDeityGeneration";
import { useApplyGeneratorLinks } from "@/composables/worldLinks/useApplyGeneratorLinks";
import { linksContextLine, type GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import type { DeityAiGenerated } from "@/lib/deities/deityAi";
import type { Deity, Pantheon } from "@/types/deity.types";

/** What the DM chose besides the concept: the pantheon is a row, so its other deities can inform the model. */
export interface DeityGenerateInput {
  pantheon?: Pick<Pantheon, "id" | "name">;
  /** Every deity of the campaign; only the chosen pantheon's are sent. */
  deities?: ReadonlyArray<Pick<Deity, "pantheon_id" | "name" | "portfolio">>;
  alignment?: string;
  primaryDomain?: string;
  generateImage: boolean;
  /** Ties to existing records, written after the deity is saved. */
  links?: readonly GeneratorLink[];
}

/** A generated deity with the choices it was generated under, so a retried save files it where it was meant to go. */
export interface DeityDraft {
  result: DeityAiGenerated;
  pantheonId: string | null;
  alignment: string | null;
  links: readonly GeneratorLink[];
}

export interface SavedDeity {
  id: string;
  name: string;
  campaignId: string;
  /** Set when the secrets note could not be written; the deity itself is saved. */
  notesFailure: unknown;
  /** One sentence per tie that could not be written; the deity is saved either way. */
  linkErrors: string[];
}

export interface GenerateDeityOutcome {
  /** The saved deity, or `null` when generation failed. */
  deity: SavedDeity | null;
  /** A user-facing reason for a `null` deity. */
  error: string | null;
  picture: "none" | "saved" | "failed";
}

export function useGenerateDeity() {
  const { mutateAsync: createDeity } = useCreateDeity();
  const { mutateAsync: createNote } = useCreateEntityNote();
  const { logImageGeneration } = useImageGenerationLog();
  const { applyGeneratorLinks } = useApplyGeneratorLinks();
  const generation = useDeityGeneration();

  /** Generates the draft; null when it failed (`generation.error` says why). Nothing is saved. */
  async function generateDeityDraft(concept: string, input: DeityGenerateInput): Promise<DeityDraft | null> {
    generation.concept.value = concept;
    generation.clearCompleted();
    const siblings = input.pantheon
      ? (input.deities ?? [])
          .filter((d) => d.pantheon_id === input.pantheon?.id)
          .map((d) => ({ name: d.name, portfolio: d.portfolio }))
      : undefined;
    const links = input.links ?? [];
    // The generation options carry no free-form context, so the ties are said to the model after the concept.
    const ties = linksContextLine(links);
    const result = await generation.generate(ties ? `${concept}\n${ties}` : concept, {
      pantheonName: input.pantheon?.name,
      pantheonDeities: siblings,
      alignment: input.alignment,
      primaryDomain: input.primaryDomain,
      generateImage: input.generateImage,
    });
    if (!result) return null;
    return { result, pantheonId: input.pantheon?.id ?? null, alignment: input.alignment ?? null, links };
  }

  /** Writes the deity and its secrets note. Throws if the deity row cannot be written. */
  async function saveDeity(draft: DeityDraft, concept: string): Promise<SavedDeity> {
    const { result } = draft;
    const created = await createDeity({
      name: result.name,
      titles: result.titles,
      alternate_names: result.alternate_names,
      pantheon_id: draft.pantheonId,
      alignment: result.alignment ?? draft.alignment,
      symbol: result.symbol,
      symbol_image_url: null,
      portrait_url: result.portrait_url,
      portrait_focal_point: result.portrait_url ? { x: 50, y: 50 } : null,
      domains: result.domains,
      portfolio: result.portfolio,
      description: result.description ? toTiptapJson(result.description) : null,
      player_visible_to: [],
      tags: result.tags,
      ai_provenance: result.ai_provenance ?? null,
    });

    // Deity DM notes live in the DM's private entity note, not a column.
    let notesFailure: unknown = null;
    const secrets = result.dm_notes?.trim();
    if (secrets) {
      try {
        await createNote({
          entity_type: "deity",
          entity_id: created.id,
          content: toTiptapJson(secrets),
          is_private: true,
          shared_with_dm: false,
          campaign_id: created.campaign_id,
        });
      } catch (e) {
        notesFailure = e;
      }
    }

    const linkErrors = await applyGeneratorLinks({ kind: "deity", id: created.id }, draft.links, created.campaign_id);

    // Log the portrait to the Gallery, linked back to the new deity.
    if (result.portrait_url) {
      void logImageGeneration({
        kind: "deity", imageUrl: result.portrait_url, prompt: concept,
        targetId: created.id, targetColumn: "portrait_url",
      });
    }
    return { id: created.id, name: result.name, campaignId: created.campaign_id, notesFailure, linkErrors };
  }

  /** Generate then save. Checks `isAnyAiGenerating` first: `generate` returns null silently on it. */
  async function generateAndCreateDeity(concept: string, input: DeityGenerateInput): Promise<GenerateDeityOutcome> {
    if (isAnyAiGenerating.value) {
      return { deity: null, error: "Another AI generation is already in progress.", picture: "none" };
    }
    const draft = await generateDeityDraft(concept, input);
    if (!draft) return { deity: null, error: generation.error.value ?? "Deity generation failed.", picture: "none" };
    const deity = await saveDeity(draft, concept);
    const picture = !input.generateImage ? "none" : draft.result.portrait_url ? "saved" : "failed";
    return { deity, error: null, picture };
  }

  return { generation, generateDeityDraft, saveDeity, generateAndCreateDeity };
}
