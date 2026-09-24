<template>
  <Transition name="fade">
    <div
      v-if="ui.monsterGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.monsterGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.monsterGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Monster Generator</h2>
        <AppButton variant="ghost" size="inline-xs" tooltip="Close" aria-label="Close" :icon="IconClose" icon-size="lg" @click="ui.monsterGeneratorOpen = false" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            placeholder="A colossal spider deity that dwells in the Underdark, commanding its cultists through webs of illusion and dreams…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="text-label-lg font-semibold text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

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
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="text-caption text-muted-foreground">Generate portrait art</span>
          <ToggleSwitch v-model="generateImage" aria-label="Generate portrait art" />
        </div>

        <!-- No API key nudge -->
        <!-- Generating state -->
        <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.monsterGeneratorOpen = false"
          >
            Continue in background
          </button>
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <GenerationCostBadge
          v-if="isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <AppButton
          v-if="isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !concept.trim()"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          :label="isGenerating ? 'Generating…' : 'Generate with AI'"
          @click="generateAndCreate"
        />
        <AiOffNotice v-else />
        <AppButton
          to="/monsters/new"
          :variant="!isAiEnabled ? 'primary' : 'outline'"
          size="md"
          block
          label="New Blank Monster"
          @click="ui.monsterGeneratorOpen = false"
        />
      </div>
    </aside>
  </Transition>

  <PaywallModal v-model="showQuotaPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useGenerateMonster } from "@/composables/monsters/useGenerateMonster";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useMonsterGenerationCost } from "@/composables/monsters/useMonsterGenerationCost";
import { useMonsterGeneration } from "@/ai/useMonsterGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { MONSTER_SIZES as SIZES, MONSTER_TYPES } from "@/types/monster.types";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { generateAndCreateMonster } = useGenerateMonster();
// `isGenerating`/`completedEntityId`/`concept` are the shared generation
// state `useGenerateMonster` drives underneath — this panel still reads them
// directly for its own loading/paywall UI, which isn't that composable's
// concern.
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted } = useMonsterGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("monsters");

const { credits: textCreditCost } = useMonsterGenerationCost();
const textIsByok = computed(() => !!campaign.decryptedApiKey);

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

  if (ui.monsterGeneratorOpen) {
    ui.monsterGeneratorOpen = false;
    router.push(`/monsters/${id}`);
  } else {
    completedEntityId.value = id;
  }
}

</script>

<style scoped>
.gold-divider {
  border-top: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
