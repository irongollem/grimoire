<template>
  <GeneratorPanelShell
    v-model:open="itemsUi.itemGeneratorOpen"
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
import { useItemsUiStore } from "@/stores/ui/items";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateItem } from "@/composables/items/useItems";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useItemGeneration } from "@/ai/useItemGeneration";
import { generatedItemPayload } from "@/lib/items/generatedItemPayload";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
} from "@/types/item.types";

const itemsUi = useItemsUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createItem } = useCreateItem();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useItemGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);

const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("item_generation")),
);

const concept = ref("");
const constraints = reactive({ item_type: "", rarity: "" });
const generateImage = ref(true);
const generateCursed = ref(false);

async function generateAndCreate() {
  if (!requireCredits(textCreditCost.value, textIsByok.value)) return;

  const campaignId = campaign.activeCampaignId;
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

  const created = await createItem(generatedItemPayload(result, campaignId));

  if (itemsUi.itemGeneratorOpen) {
    itemsUi.itemGeneratorOpen = false;
    router.push(`/vault/${created.id}`);
  } else {
    completedEntityId.value = created.id;
  }
}
</script>
