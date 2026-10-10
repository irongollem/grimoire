<template>
  <GeneratorPanelShell
    v-model:open="monstersUi.monsterGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Monster Generator"
    concept-placeholder="A colossal spider deity that dwells in the Underdark, commanding its cultists through webs of illusion and dreams…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/monsters/new"
    blank-label="New Blank Monster"
    image-toggle-label="Generate portrait art"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Challenge Rating</label>
        <AppInput
          v-model="constraints.challenge_rating"
          tone="filled"
          size="body"
          placeholder="e.g. 5, 1/2, 1/4"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Monster Type</label>
          <AppSelect v-model="constraints.monster_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in MONSTER_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Size</label>
          <AppSelect v-model="constraints.size" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="s in SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { useMonstersUiStore } from "@/stores/ui/monsters";
import { useGenerateMonster } from "@/composables/monsters/useGenerateMonster";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useMonsterGenerationCost } from "@/composables/monsters/useMonsterGenerationCost";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useMonsterGeneration } from "@/ai/useMonsterGeneration";
import { MONSTER_SIZES as SIZES, MONSTER_TYPES } from "@/types/monster.types";

const monstersUi = useMonstersUiStore();
const router = useRouter();
const { generateAndCreateMonster } = useGenerateMonster();
// `isGenerating`/`completedEntityId`/`concept` are the shared generation
// state `useGenerateMonster` drives underneath — this panel still reads them
// directly for its own loading/paywall UI, which isn't that composable's
// concern.
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted } = useMonsterGeneration();

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("monsters");

const { credits: textCreditCost } = useMonsterGenerationCost();
const { textIsByok } = useCampaignProviders();

const concept = ref("");
const constraints = reactive({ challenge_rating: "", monster_type: "", size: "" });
const generateImage = ref(true);

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  // generateAndCreateMonster both generates AND creates in one call, so a
  // quota failure on the create half arrives here as a thrown error (a race,
  // or a stale count) rather than through the outcome's own `error` field.
  let id: string | null;
  try {
    ({ id } = await generateAndCreateMonster(concept.value.trim(), {
      challenge_rating: constraints.challenge_rating.trim() || undefined,
      monster_type: constraints.monster_type || undefined,
      size: constraints.size || undefined,
      generateImage: generateImage.value,
    }));
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }
  // A failure already left its message on the shared `genError` ref
  // (`useMonsterGeneration`'s own state, which this panel already renders),
  // so there is nothing further to do here on a `null` id.
  if (!id) return;

  if (monstersUi.monsterGeneratorOpen) {
    monstersUi.monsterGeneratorOpen = false;
    router.push(`/monsters/${id}`);
  } else {
    completedEntityId.value = id;
  }
}

</script>
