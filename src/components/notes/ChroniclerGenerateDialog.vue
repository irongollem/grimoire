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
              class="text-caption"
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
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-caption"
              :class="e.portraitUrl
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground'"
            >
              <span class="text-2xs">{{ e.portraitUrl ? '▣' : '◻' }}</span>
              {{ e.label }}
            </span>
          </div>
          <p v-else-if="hasMentions" class="text-caption text-muted-foreground italic">
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
              <span class="text-caption-sm opacity-60">{{ byok ? 'BYOK' : `${shapeCost(s.value)} cr` }}</span>
            </button>
          </div>
        </div>

        <!-- Generating status — rotating flavor quote + elapsed timer -->
        <div
          v-if="generating"
          class="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <IconGenerate class="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
            <p class="text-caption text-muted-foreground leading-snug">{{ currentLoadingQuote }}</p>
            <span class="ml-auto text-caption tabular-nums text-muted-foreground/60 shrink-0">{{ elapsedLabel }}</span>
          </div>
          <p class="font-fell text-[0.6875rem] leading-snug pl-5.5" :class="reassurance.tone">{{ reassurance.text }}</p>
        </div>

        <!-- Error -->
        <p v-if="error" class="text-caption text-destructive">{{ error }}</p>

        <!-- Actions -->
        <div class="flex gap-2 justify-end items-center">
          <GenerationCostBadge :credits="selectedCost" :byok="byok" class="mr-auto" />
          <!-- Stays enabled while generating: the job runs server-side (or in
               this tab for BYOK), so closing backgrounds it rather than
               aborting — the image still lands in the note and gallery. -->
          <button
            type="button"
            class="px-3 py-1.5 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="emit('close')"
          >
            {{ generating ? 'Close — keep generating' : 'Cancel' }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-4 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
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
import { useToast } from "@/composables/useToast";

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

// Calm, escalating expectation-setting so a long render reads as "normal and
// still working" rather than "hung". gpt-image typically lands in 1–3 min but
// can run ~5; we don't surface alarm until it's genuinely overlong.
const reassurance = computed<{ text: string; tone: string }>(() => {
  const s = elapsed.value;
  if (s < 90)  return { text: "Portrait renders usually take 1–3 minutes.", tone: "text-muted-foreground/70" };
  if (s < 240) return { text: "Still working — you can close this and keep working; the image will drop into your note and gallery when it's ready.", tone: "text-muted-foreground/70" };
  return { text: "Taking longer than usual, but still running. It'll appear in your note and gallery when ready, or be marked failed automatically if it can't finish.", tone: "text-yellow-600 dark:text-yellow-500" };
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
const toast = useToast();
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
    // If the user closed the dialog to keep working, the inline UI is gone —
    // confirm the backgrounded render landed via a toast instead.
    if (!props.visible) toast.success("Chronicle image added to your note.");
    emit("generated", url);
    emit("close");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    error.value = message;
    // Backgrounded failures have no visible inline error, so surface them as a
    // toast (when the dialog is open, the inline error already shows it).
    if (!props.visible) toast.error(`Chronicle image failed: ${message}`);
  } finally {
    generating.value = false;
    stopWaitingUi();
  }
}
</script>
