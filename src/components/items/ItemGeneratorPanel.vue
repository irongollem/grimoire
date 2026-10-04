<template>
  <GeneratorPanelShell
    v-model:open="ui.itemGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Item Generator"
    concept-placeholder="A staff carved from petrified dragon bone, crackling with lightning and able to call storms when wielded by a chosen champion…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/vault/new"
    blank-label="New Blank Item"
    image-toggle-label="Generate item art"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1"
            >Item Type</label
          >
          <AppSelect v-model="constraints.item_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in ITEM_TYPES" :key="t" :value="t">
              {{ ITEM_TYPE_LABELS[t] }}
            </option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1"
            >Rarity</label
          >
          <AppSelect v-model="constraints.rarity" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="r in ITEM_RARITIES" :key="r" :value="r">
              {{ ITEM_RARITY_LABELS[r] }}
            </option>
          </AppSelect>
        </div>
      </div>
    </template>

    <template #extra>
      <div v-if="isAiEnabled" class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Make it cursed <span class="text-muted-foreground/50">(AI chooses the curse)</span></span>
        <ToggleSwitch v-model="generateCursed" aria-label="Make it cursed" />
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateItem } from "@/composables/items/useItems";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useItemGeneration } from "@/ai/useItemGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
} from "@/types/item.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createItem } = useCreateItem();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useItemGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);

const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("item_generation") * textMultiplierFor(textProvider.value)),
);

const concept = ref("");
const constraints = reactive({ item_type: "", rarity: "" });
const generateImage = ref(true);
const generateCursed = ref(false);

async function generateAndCreate() {
  if (!requireCredits(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      item_type: constraints.item_type || undefined,
      rarity: constraints.rarity || undefined,
      cursed: generateCursed.value || undefined,
      generateImage: generateImage.value,
    },
  );
  if (!result) return;

  const created = await createItem({
    name: result.name,
    item_type: result.item_type,
    subtype: result.subtype ?? null,
    rarity: result.rarity,
    requires_attunement: result.requires_attunement ?? false,
    attunement_requirements: result.attunement_requirements ?? null,
    weight: result.weight !== null && result.weight !== undefined ? parseFloat(String(result.weight)) || null : null,
    cost: result.cost ?? null,
    damage_rolls: result.damage_rolls ?? null,
    armor_class: result.armor_class ?? null,
    properties: result.properties ?? [],
    weapon_range: result.weapon_range ?? null,
    versatile_damage: result.versatile_damage ?? null,
    charges: result.charges ?? null,
    recharge: result.recharge ?? null,
    spell_ids: [],
    description: result.description ? toTiptapJson(result.description) : "",
    mundane_description: result.mundane_description ? toTiptapJson(result.mundane_description) : null,
    source: "Grimoire:AI",
    tags: result.tags ?? [],
    image_url: result.image_url ?? null,
    image_focal_point: null,
    curse_description: result.curse_description ?? null,
    is_arcane_focus: false,
    ai_provenance: result.ai_provenance ?? null,
    // Matches ItemDetail.vue's manual-create default (#596): an AI-generated
    // item is DM content for the campaign the DM is looking at, not a fresh
    // "available everywhere" default. No active campaign is a genuine
    // "no campaign yet" case, so it stays global rather than inventing one.
    campaign_id: campaign.activeCampaignId ?? null,
  });

  if (ui.itemGeneratorOpen) {
    ui.itemGeneratorOpen = false;
    router.push(`/vault/${created.id}`);
  } else {
    completedEntityId.value = created.id;
  }
}
</script>
