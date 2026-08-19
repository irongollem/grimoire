<template>
  <Transition name="fade">
    <div
      v-if="ui.trapGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.trapGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.trapGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Trap Generator</h2>
        <AppButton variant="ghost" size="inline-xs" tooltip="Close" aria-label="Close" @click="ui.trapGeneratorOpen = false">
          <template #icon><IconClose class="h-5 w-5" /></template>
        </AppButton>
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
            :maxlength="CONCEPT_LIMIT"
            placeholder="A pressure plate in a dungeon corridor that triggers a volley of poisoned darts from hidden alcoves in the walls…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="text-caption"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
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
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="text-caption text-muted-foreground">Generate trap illustration</span>
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

        <!-- Party portrait toggle — only when image generation is on, OpenAI key available, and group portrait exists -->
        <div v-if="isAiEnabled && generateImage && openAiKey && groupPortraitUrl" class="flex items-center justify-between">
          <span class="text-caption text-muted-foreground">Add party to scene</span>
          <button
            type="button"
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
            :class="includeParty ? 'bg-primary' : 'bg-muted border border-border'"
            @click="includeParty = !includeParty"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
              :class="includeParty ? 'translate-x-4.5' : 'translate-x-0.5'"
            />
          </button>
        </div>

        <!-- No API key nudge -->
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.trapGeneratorOpen = false"
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
        <p
          v-if="effectiveCreditCost > 0 && isPro && isAiEnabled"
          class="text-caption text-center"
          :class="canAfford ? 'text-muted-foreground' : 'text-destructive font-semibold'"
        >{{ creditLine }}</p>
        <AppButton
          v-if="isPro && isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !concept.trim() || (effectiveCreditCost > 0 && !canAfford)"
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
          to="/traps/new"
          :variant="isPro && !aiApiKey ? 'primary' : 'outline'"
          size="md"
          block
          label="New Blank Trap"
          @click="ui.trapGeneratorOpen = false"
        />
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate traps, NPCs, monsters, items, spells, and more." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateTrap } from "@/composables/useTraps";
import { useImageGenerationLog } from "@/composables/useImageGenerationLog";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useTrapGeneration } from "@/ai/useTrapGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { TRAP_TYPES, CR_LIST } from "@/types/trap.types";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createTrap } = useCreateTrap();
const { logImageGeneration } = useImageGenerationLog();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useTrapGeneration();

const aiApiKey      = computed(() => campaign.decryptedApiKey);
const isAiEnabled   = computed(() => campaign.isAiEnabled);
const openAiKey     = computed(() => campaign.decryptedOpenAiKey);
const groupPortraitUrl = computed(() => campaign.activeCampaign?.group_portrait_url ?? null);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf, balance, isLoading: creditsLoading } = useAiCredits();
const { textMultiplierFor, imageMultiplierFor } = useProviderConfig();

const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok   = computed(() => !!campaign.decryptedApiKey);
const imageIsByok  = computed(() => !!campaign.decryptedOpenAiKey);

const effectiveCreditCost = computed(() => {
  let cost = textIsByok.value
    ? 0
    : Math.round(costOf("trap_generation") * textMultiplierFor(textProvider.value) * 100) / 100;
  // The illustration is a separate entity_image charge (portrait → 1.5×).
  if (generateImage.value && !imageIsByok.value) {
    cost += Math.round(costOf("entity_image", { size: "1024x1536" }) * imageMultiplierFor("openai") * 100) / 100;
  }
  return cost;
});

const canAfford  = computed(() => creditsLoading.value || (balance.value ?? 0) >= effectiveCreditCost.value);
const creditLine = computed(() => {
  const cost = parseFloat(effectiveCreditCost.value.toFixed(2));
  const bal  = parseFloat(((balance.value ?? 0) as number).toFixed(2));
  return `${cost === 1 ? "1 credit" : `${cost} credits`} · Balance: ${bal}`;
});

const concept       = ref("");
const constraints   = reactive({ trap_type: "", cr: "" });
const generateImage = ref(true);
const includeParty  = ref(false);

async function generateAndCreate() {
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

  const trap = await createTrap({
    // Scoped to the campaign it was generated for; widened from the trap's
    // own Scope control if the DM wants it everywhere.
    campaign_id:        campaign.activeCampaignId,
    name:               result.name,
    trap_type:          result.trap_type,
    trigger_type:       result.trigger_type ?? null,
    description:        toTiptapJson(result.description),
    effect_description: result.effect_description ?? null,
    detection_dc:       result.detection_dc,
    disarm_dc:          result.disarm_dc,
    attack_bonus:       result.attack_bonus,
    save_type:          result.save_type,
    save_dc:            result.save_dc,
    damage_entries:     result.damage_entries,
    reset_type:         result.reset_type,
    cr:                 result.cr,
    trap_hp:            result.trap_hp,
    trap_ac:            result.trap_ac,
    damage_immunities:  [],
    notes:              toTiptapJson(result.notes),
    tags:               result.tags,
    image_url:          result.image_url,
    image_focal_point:  null,
    ai_provenance:      result.ai_provenance ?? null,
  });

  // Log the generated illustration to the Gallery, linked back to the new trap.
  if (result.image_url) {
    void logImageGeneration({
      kind: "trap", imageUrl: result.image_url, prompt: genConcept.value,
      targetId: trap.id, targetColumn: "image_url",
    });
  }

  completedEntityId.value = trap.id;
  ui.trapGeneratorOpen = false;
  router.push(`/traps/${trap.id}`);
}
</script>
