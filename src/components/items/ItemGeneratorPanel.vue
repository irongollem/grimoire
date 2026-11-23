<template>
  <GeneratorPanelShell
    v-model:open="itemsUi.itemGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Item Generator"
    concept-placeholder="A staff carved from petrified dragon bone, crackling with lightning and able to call storms when wielded by a chosen champion…"
    :credits="quote.total"
    :byok="quote.byok"
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
      <!-- Its owner, the place it lies in, the faction that guards it: every tie is made here. -->
      <GeneratorLinksField v-model="links" subject-kind="item" noun="this item" class="mt-2" />
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
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import GeneratorLinksField from "@/components/generators/GeneratorLinksField.vue";
import { useToast } from "@/composables/useToast";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useItemQuote } from "@/composables/ai/quotes/itemQuote";
import { useGenerateItem } from "@/composables/items/useGenerateItem";
import { useItemGeneration } from "@/ai/useItemGeneration";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
} from "@/types/item.types";

const itemsUi = useItemsUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { generateAndCreateItem } = useGenerateItem();
// The shared generation state `useGenerateItem` drives underneath; this panel reads it for its own loading UI.
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted } = useItemGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);

const toast = useToast();
const { requireCredits } = useOutOfCredits();
const quoteItem = useItemQuote();

const concept = ref("");
const constraints = reactive({ item_type: "", rarity: "" });
const links = ref<GeneratorLink[]>([]);
const generateImage = ref(true);
const generateCursed = ref(false);

// The price Ask Grimoire quotes for the same run: the picture counts when it is switched on.
const quote = computed(() => quoteItem({ image: generateImage.value }));

async function generateAndCreate() {
  if (!requireCredits(quote.value.total, quote.value.byok)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const { id, linkErrors } = await generateAndCreateItem(concept.value.trim(), {
    links: links.value,
    item_type: constraints.item_type || undefined,
    rarity: constraints.rarity || undefined,
    cursed: generateCursed.value || undefined,
    generateImage: generateImage.value,
  });
  if (!id) return;
  if (linkErrors.length) toast.error(`Item created, but some connections could not be added: ${linkErrors.join("; ")}`);

  if (itemsUi.itemGeneratorOpen) {
    itemsUi.itemGeneratorOpen = false;
    router.push(`/vault/${id}`);
  } else {
    completedEntityId.value = id;
  }
}
</script>
