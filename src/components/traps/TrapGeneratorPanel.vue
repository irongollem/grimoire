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
        <h2 class="font-cinzel text-base font-semibold text-foreground">Trap Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.trapGeneratorOpen = false">
          <IconClose class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A pressure plate in a dungeon corridor that triggers a volley of poisoned darts from hidden alcoves in the walls…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="font-fell text-xs"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Type</label>
              <select
                v-model="constraints.trap_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">CR</label>
              <select
                v-model="constraints.cr"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="c in CR_LIST" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="font-fell text-xs text-muted-foreground">Generate trap illustration</span>
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
          <span class="font-fell text-xs text-muted-foreground">Add party to scene</span>
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
          <p class="font-fell text-sm text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
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
          <p class="font-fell text-xs text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <button
          v-if="isPro && isAiEnabled"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim()"
          :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          {{ isGenerating ? "Generating…" : "Generate with AI" }}
        </button>
        <button
          v-else-if="!isPro"
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="showPaywall = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate with AI
        </button>
        <RouterLink
          to="/traps/new"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          :class="isPro && !aiApiKey ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted'"
          @click="ui.trapGeneratorOpen = false"
        >
          New Blank Trap
        </RouterLink>
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate traps, NPCs, monsters, items, spells, and more." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter, RouterLink } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateTrap } from "@/composables/useTraps";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useTrapGeneration } from "@/ai/useTrapGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { TRAP_TYPES, CR_LIST } from "@/types/trap.types";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createTrap } = useCreateTrap();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useTrapGeneration();

const aiApiKey      = computed(() => campaign.decryptedApiKey);
const isAiEnabled   = computed(() => campaign.isAiEnabled);
const openAiKey     = computed(() => campaign.decryptedOpenAiKey);
const groupPortraitUrl = computed(() => campaign.activeCampaign?.group_portrait_url ?? null);
const { isPro } = useSubscription();
const showPaywall = ref(false);

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
  });

  completedEntityId.value = trap.id;
  ui.trapGeneratorOpen = false;
  router.push(`/traps/${trap.id}`);
}
</script>
