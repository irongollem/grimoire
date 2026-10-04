import { computed, ref } from "vue";
import type { BucketId } from "@/lib/storage";
import { useCampaignStore } from "@/stores/campaign";
import { useEntityImageGeneration } from "@/ai/useEntityImageGeneration";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useUpdateNpc } from "@/composables/npcs/useNpcs";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useUpdateMonster } from "@/composables/monsters/useMonsters";
import { useUpdateItem } from "@/composables/items/useItems";
import { useUpdateSpell } from "@/composables/spells/useSpells";
import { wholeCredits } from "@edge-shared/credit-math.ts";

export type PortraitKind = "npc" | "party" | "monster" | "item" | "spell";

/**
 * The same image kind and bucket the entity's own detail editor passes to
 * EntityImageBlock, so art painted here lands exactly where an edit there
 * would put it, and shows up in the Gallery under the same tab.
 */
const KIND_CONFIG = {
  npc:     { aiKind: "npc_portrait", bucket: "npc-portraits" },
  party:   { aiKind: "party_member", bucket: "npc-portraits" },
  monster: { aiKind: "monster",      bucket: "monster-images" },
  item:    { aiKind: "item",         bucket: "item-images" },
  spell:   { aiKind: "spell",        bucket: "spell-images" },
} as const satisfies Record<PortraitKind, { aiKind: string; bucket: BucketId }>;

// One portrait at a time across every surface: a second paint would spend
// credits while the first is still rendering.
const paintingId = ref<string | null>(null);

/**
 * "Paint portrait" for an entity that has no picture at all: generates the
 * entity's own portrait with its existing image kind and saves it onto the
 * entity, so its token, its card and its detail page all gain it at once.
 *
 * Text-only generation, so the likeness gate (reference images only) does not
 * apply, exactly as in EntityImageBlock. The write goes through the entity's
 * own update mutation so its caches refresh and the Mint and Card Forge
 * re-render.
 */
export function useMissingPortrait(kind: PortraitKind) {
  const campaign = useCampaignStore();
  const config = KIND_CONFIG[kind];
  const { generate, error } = useEntityImageGeneration(config.bucket);
  const { canSpend } = useGenerationGate();
  const { costOf } = useAiCredits();
  const { imageMultiplierFor } = useProviderConfig();

  const updateNpc = useUpdateNpc();
  const updateParty = useUpdatePartyMember();
  const updateMonster = useUpdateMonster();
  const updateItem = useUpdateItem();
  const updateSpell = useUpdateSpell();

  const byok = computed(() => !!campaign.decryptedOpenAiKey);
  const cost = computed(
    () => wholeCredits(costOf("entity_image", { size: "1024x1536" }) * imageMultiplierFor("openai")),
  );
  const enabled = computed(() => campaign.isAiEnabled);
  const isPaintingAny = computed(() => paintingId.value !== null);

  function isPainting(id: string): boolean {
    return paintingId.value === id;
  }

  async function save(id: string, url: string): Promise<void> {
    // New art has no curated focal point yet: default to dead-centre, as EntityImageBlock does.
    const focal = { x: 50, y: 50 };
    switch (kind) {
      case "npc":
        await updateNpc.mutateAsync({ id, update: { portrait_url: url, portrait_focal_point: focal } });
        return;
      case "party":
        await updateParty.mutateAsync({ id, update: { portrait_url: url, portrait_focal_point: focal } });
        return;
      case "monster":
        await updateMonster.mutateAsync({ id, update: { image_url: url, portrait_focal_point: focal } });
        return;
      case "item":
        await updateItem.mutateAsync({ id, update: { image_url: url, image_focal_point: focal } });
        return;
      case "spell":
        await updateSpell.mutateAsync({ id, update: { image_url: url, image_focal_point: focal } });
        return;
    }
  }

  /** Resolves to the saved URL, or null when gated, failed, or another paint is running. */
  async function paint(id: string, context: string): Promise<string | null> {
    if (isPaintingAny.value || !context.trim()) return null;
    if (!canSpend(cost.value, byok.value)) return null;
    paintingId.value = id;
    try {
      const url = await generate({ kind: config.aiKind, context, targetId: id });
      if (!url) return null;
      await save(id, url);
      return url;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not save the portrait.";
      return null;
    } finally {
      paintingId.value = null;
    }
  }

  return { paint, isPainting, isPaintingAny, enabled, cost, byok, error };
}
