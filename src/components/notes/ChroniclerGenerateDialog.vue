<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="emit('close')"
    >
      <div class="bg-card rounded-lg border border-border p-5 max-w-lg w-full mx-4 flex flex-col gap-4">
        <h3 class="font-cinzel text-sm font-bold tracking-wider">Generate Scene Illustration</h3>

        <!-- Scene prompt -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Scene prompt</label>
          <MentionTextarea
            v-model="scenePrompt"
            :rows="6"
            placeholder="Describe the scene… use @Name to reference characters, e.g. @Aria and @Thorin face the @Dragon in the ruins."
            :items="mentionItems"
            :disabled="generating"
          />
          <div class="flex justify-end">
            <span
              class="font-fell text-xs"
              :class="scenePrompt.length >= SCENE_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ scenePrompt.length }} / {{ SCENE_LIMIT }}</span>
          </div>
        </div>

        <!-- Resolved entities -->
        <div v-if="scenePrompt.trim()" class="flex flex-col gap-1.5">
          <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Resolved characters</span>
          <div v-if="resolvedEntities.length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="e in resolvedEntities"
              :key="e.label"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-fell"
              :class="e.portraitUrl
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground'"
            >
              <span class="text-[10px]">{{ e.portraitUrl ? '▣' : '◻' }}</span>
              {{ e.label }}
            </span>
          </div>
          <p v-else-if="hasMentions" class="font-fell text-xs text-muted-foreground italic">
            No @mentions matched known characters — generating from description only.
          </p>
        </div>

        <!-- Shape picker -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Shape</label>
          <div class="flex gap-1.5">
            <button
              v-for="s in SHAPES"
              :key="s.value"
              type="button"
              class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors"
              :class="size === s.value
                ? 'border-primary bg-primary/10 text-primary font-semibold'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'"
              @click="size = s.value"
            >
              <span class="font-cinzel text-xs">{{ s.label }}</span>
              <span class="font-fell text-[10px] opacity-60">{{ byok ? 'BYOK' : `${shapeCost(s.value)} cr` }}</span>
            </button>
          </div>
        </div>

        <!-- Generating status — rotating flavor quote + elapsed timer -->
        <div
          v-if="generating"
          class="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
        >
          <IconGenerate class="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
          <p class="font-fell text-xs text-muted-foreground leading-snug">{{ currentLoadingQuote }}</p>
          <span class="ml-auto font-fell text-xs tabular-nums text-muted-foreground/60 shrink-0">{{ elapsedLabel }}</span>
        </div>

        <!-- Error -->
        <p v-if="error" class="font-fell text-xs text-destructive">{{ error }}</p>

        <!-- Actions -->
        <div class="flex gap-2 justify-end items-center">
          <GenerationCostBadge :credits="selectedCost" :byok="byok" class="mr-auto" />
          <button
            type="button"
            class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            :disabled="generating"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="generating || !scenePrompt.trim() || scenePrompt.length > SCENE_LIMIT || !affordable(selectedCost, byok)"
            @click="generate"
          >
            <IconGenerate class="h-3 w-3" :class="generating ? 'animate-pulse' : ''" />
            {{ generating ? 'Generating…' : 'Generate' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { startAiQuotes, stopAiQuotes, currentLoadingQuote } from "@/ai/aiGenerationState";

const SCENE_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { IconGenerate } from '@/lib/icons';
import { parseSceneEntities, generateChroniclerImage } from "@/ai/useChroniclerImageGeneration";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import type { ChroniclerSize } from "@/types/chronicler.types";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useEntityMentionItems } from "@/composables/useEntityMentionItems";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";

const props = defineProps<{ visible: boolean; initialPrompt?: string }>();

const emit = defineEmits<{
  close: [];
  generated: [url: string];
}>();

const SHAPES: { label: string; value: ChroniclerSize }[] = [
  { label: "Square",    value: "1024x1024" },
  { label: "Landscape", value: "1536x1024" },
];

const scenePrompt = ref("");
const size        = ref<ChroniclerSize>("1024x1024");
const generating  = ref(false);
const error       = ref("");

// Elapsed-time counter shown alongside the rotating flavor quote while waiting.
const elapsed = ref(0);
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
const elapsedLabel = computed(() => {
  const m = Math.floor(elapsed.value / 60);
  const s = elapsed.value % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
});

function startWaitingUi() {
  elapsed.value = 0;
  startAiQuotes("image");
  elapsedTimer = setInterval(() => { elapsed.value += 1; }, 1000);
}

function stopWaitingUi() {
  stopAiQuotes();
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}

onUnmounted(stopWaitingUi);

watch(() => props.visible, (v) => {
  if (v) {
    scenePrompt.value = props.initialPrompt ?? "";
    error.value = "";
  }
});

const { mentionItems, partyMembers, npcs, monsters } = useEntityMentionItems();

const resolvedEntities = computed(() =>
  parseSceneEntities(
    scenePrompt.value,
    npcs.value,
    monsters.value,
    partyMembers.value,
    campaignStore.activeCampaign?.group_portrait_url,
  ),
);

const hasMentions = computed(() => /@[A-Za-z]/.test(scenePrompt.value));

const campaignStore = useCampaignStore();
const { activeCampaignId } = storeToRefs(campaignStore);
const { user } = storeToRefs(useAuthStore());

// Live credit cost — chronicle images always render via OpenAI; cost scales with
// the chosen shape's output area (landscape = 1.5× square). BYOK = no credits.
const { costOf, affordable } = useAiCredits();
const { imageMultiplierFor } = useProviderConfig();
const byok = computed(() => !!campaignStore.decryptedOpenAiKey);
function shapeCost(s: ChroniclerSize): number {
  return Math.round(costOf("chronicle_image", { size: s }) * imageMultiplierFor("openai") * 100) / 100;
}
const selectedCost = computed(() => (byok.value ? 0 : shapeCost(size.value)));

async function generate() {
  if (!activeCampaignId.value || !scenePrompt.value.trim() || !user.value) return;
  generating.value = true;
  error.value = "";
  startWaitingUi();
  try {
    const url = await generateChroniclerImage({
      sceneText: scenePrompt.value,
      entities:  resolvedEntities.value,
      size:      size.value,
    });
    emit("generated", url);
    emit("close");
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Generation failed.";
  } finally {
    generating.value = false;
    stopWaitingUi();
  }
}
</script>
