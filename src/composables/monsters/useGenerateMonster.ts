/**
 * "Generate a monster with AI and insert it" — the generation→create mapping
 * `MonsterGeneratorPanel.vue` used to own inline, extracted so the document
 * importer's per-page monster generation (`entityMatching.ts`'s `generate`
 * decision, for a page that named a creature without ever printing its
 * stats) can call the exact same pipeline instead of a second copy of it.
 *
 * Deliberately narrow: this is only the generate-then-create step. The
 * panel's own post-create navigation, paywall gate and credit-cost display
 * are UX decisions that belong to the panel, not to a shared composable two
 * very different callers both use — the importer, for instance, never
 * navigates anywhere on a successful generation, and has no paywall of its
 * own to show (a document import is already Pro-gated upstream).
 */
import { useCreateMonster } from "@/composables/monsters/useMonsters";
import { useCampaignStore } from "@/stores/campaign";
import { useMonsterGeneration, type MonsterGenerationOptions } from "@/ai/useMonsterGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";

export interface GenerateMonsterOutcome {
  /** The created row's id, or `null` when generation or creation failed. */
  id: string | null;
  /** A user-facing reason for a `null` id, or `null` on success. */
  error: string | null;
}

export function useGenerateMonster() {
  const campaign = useCampaignStore();
  const { mutateAsync: createMonster } = useCreateMonster();
  const { generate, error: genError } = useMonsterGeneration();

  /**
   * `nameOverride` exists for the importer: the page already named the
   * creature, so the created row must carry that exact name (not whatever
   * the model chooses to call it) — link resolution and encounter-combatant
   * resolution both look a monster up by the name the page printed, and a
   * model-invented name would never be found by either.
   *
   * Checks `isAnyAiGenerating` up front rather than only reacting to a
   * `null` result from `generate()`: that function returns `null` silently
   * on the same check without necessarily updating its own `error` ref (it
   * bails before touching it), so relying on `genError` after the fact could
   * surface a *stale* error from an unrelated earlier failure instead of the
   * concurrency reason that actually applies here.
   */
  async function generateAndCreateMonster(
    concept: string,
    options: MonsterGenerationOptions & { nameOverride?: string } = {},
  ): Promise<GenerateMonsterOutcome> {
    if (isAnyAiGenerating.value) {
      return { id: null, error: "Another AI generation is already in progress." };
    }

    const { nameOverride, ...generationOptions } = options;
    const result = await generate(concept, generationOptions);
    if (!result) {
      return { id: null, error: genError.value ?? "Monster generation failed." };
    }

    const created = await createMonster({
      // Scoped to the campaign it was generated for, same as the panel's own
      // create — the DM can widen it to all campaigns from the monster's
      // Scope control afterward.
      campaign_id: campaign.activeCampaignId,
      name: nameOverride ?? result.name,
      monster_type: result.monster_type,
      size: result.size,
      alignment: (result.alignment || "unaligned").toLowerCase(),
      habitat: result.habitat || null,
      source: "Grimoire:AI",
      tags: result.tags ?? [],
      description: result.description ? toTiptapJson(result.description) : null,
      notes: result.notes ? toTiptapJson(result.notes) : null,
      image_url: result.image_url ?? null,
      portrait_focal_point: null,
      stat_block: result.stat_block,
      ai_provenance: result.ai_provenance ?? null,
    });

    return { id: created.id, error: null };
  }

  return { generateAndCreateMonster };
}
