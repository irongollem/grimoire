<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.trapGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Trap Generator"
    concept-placeholder="A pressure plate in a dungeon corridor that triggers a volley of poisoned darts from hidden alcoves in the walls…"
    :credits="effectiveCreditCost"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/traps/new"
    blank-label="New Blank Trap"
    image-toggle-label="Generate trap illustration"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Type</label>
          <AppSelect v-model="constraints.trap_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">CR</label>
          <AppSelect v-model="constraints.cr" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="c in CR_LIST" :key="c" :value="c">{{ c }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
    <template #extra>
      <!-- Party portrait toggle: only when image generation is on, an image provider resolves (OpenAI and Gemini both take source images), and a group portrait exists -->
      <div v-if="isAiEnabled && generateImage && imageProvider && groupPortraitUrl" class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Add party to scene</span>
        <ToggleSwitch v-model="includeParty" aria-label="Add party to scene" />
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { useGenerateTrap } from "@/composables/dungeon-features/useGenerateTrap";
import { useTrapQuote } from "@/composables/ai/quotes/trapQuote";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import { useTrapGeneration } from "@/ai/useTrapGeneration";
import { TRAP_TYPES, CR_LIST } from "@/types/trap.types";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { saveGeneratedTrap } = useGenerateTrap();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useTrapGeneration();

const isAiEnabled   = computed(() => campaign.isAiEnabled);
const groupPortraitUrl = computed(() => campaign.activeCampaign?.group_portrait_url ?? null);

const { requireCredits } = useOutOfCredits();
const { imageProvider } = useCampaignProviders();
// The price is the quote's, the one Ask Grimoire shows too, so the page and Ask cannot disagree.
const quoteTrap = useTrapQuote();

const concept       = ref("");
const constraints   = reactive({ trap_type: "", cr: "" });
const generateImage = ref(true);
const includeParty  = ref(false);

const quote = computed(() => quoteTrap({ image: generateImage.value }));
// Null while any part that will be charged has no known price yet.
const effectiveCreditCost = computed(() => quote.value.total);

async function generateAndCreate() {
  if (!requireCredits(effectiveCreditCost.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      trap_type:        constraints.trap_type || undefined,
      cr:               constraints.cr || undefined,
      generateImage:    generateImage.value,
      groupPortraitUrl: includeParty.value ? groupPortraitUrl.value : null,
    },
  );

  if (!result) return;

  const trap = await saveGeneratedTrap(result, genConcept.value);

  completedEntityId.value = trap.id;
  generatorsUi.trapGeneratorOpen = false;
  router.push(`/traps/${trap.id}`);
}
</script>
