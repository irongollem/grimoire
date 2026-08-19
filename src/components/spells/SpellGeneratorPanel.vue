<template>
  <Transition name="fade">
    <div
      v-if="ui.spellGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.spellGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.spellGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Spell Generator</h2>
        <AppButton variant="ghost" size="inline-xs" tooltip="Close" aria-label="Close" :icon="IconClose" icon-size="lg" @click="ui.spellGeneratorOpen = false" />
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
            placeholder="A storm of luminous moths that swarm a target, biting and dazzling them with flashes of bioluminescence…"
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

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Level</label>
              <AppSelect v-model="constraints.level" tone="filled" size="body" weight="normal" block>
                <option value="">Any</option>
                <option value="0">Cantrip</option>
                <option v-for="n in 9" :key="n" :value="String(n)">{{ n }}{{ levelSuffix(n) }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-caption text-muted-foreground mb-1">School</label>
              <AppSelect v-model="constraints.school" tone="filled" size="body" weight="normal" block class="capitalize">
                <option value="">Any</option>
                <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
              </AppSelect>
            </div>
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="text-caption text-muted-foreground">Generate spell-effect art</span>
          <button
            type="button"
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
            :class="generateImage ? 'bg-primary' : 'bg-muted border border-border'"
            @click="generateImage = !generateImage"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
              :class="generateImage ? 'translate-x-4.5' : 'translate-x-0.5'"
            />
          </button>
        </div>

        <!-- No API key nudge (pro users only) -->
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.spellGeneratorOpen = false"
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
          v-if="isPro && isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <AppButton
          v-if="isPro && isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          :label="isGenerating ? 'Generating…' : 'Generate with AI'"
          @click="generateAndCreate"
        />
        <AppButton
          v-else-if="!isPro"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          label="Generate with AI"
          @click="showPaywall = true"
        />
        <AppButton
          to="/spells/new"
          :variant="isPro && !aiApiKey ? 'primary' : 'outline'"
          size="md"
          block
          label="New Blank Spell"
          @click="ui.spellGeneratorOpen = false"
        />
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate spells, NPCs, monsters, items, puzzles, and session artwork." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateSpell } from "@/composables/useSpells";
import { useSpellGeneration } from "@/ai/useSpellGeneration";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";
import { SPELL_SCHOOLS, type SpellSchool } from "@/types/spell.types";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createSpell } = useCreateSpell();
const {
  isGenerating,
  error: genError,
  completedEntityId,
  concept: genConcept,
  clearCompleted,
  generate,
} = useSpellGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("spell_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const concept = ref("");
const constraints = reactive<{ level: string; school: "" | SpellSchool }>({
  level: "",
  school: "",
});
const generateImage = ref(true);

function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

async function generateAndCreate() {
  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(concept.value.trim(), {
    level: constraints.level === "" ? undefined : Number(constraints.level),
    school: constraints.school || undefined,
    generateImage: generateImage.value,
  });
  if (!result) return;

  const created = await createSpell(spellInsertFromAi(result));

  if (ui.spellGeneratorOpen) {
    ui.spellGeneratorOpen = false;
    router.push(`/spells/${created.id}`);
  } else {
    completedEntityId.value = created.id;
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
