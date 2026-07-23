<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="emit('close')"
    >
      <div ref="dialogRef" class="bg-card rounded-lg border border-border p-5 max-w-lg w-full mx-4 flex flex-col gap-4">
        <h3 class="font-cinzel text-sm font-bold tracking-wider">Generate Scene Illustration</h3>

        <!-- Scene prompt -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Scene prompt</label>
          <MentionTextarea
            v-model="scenePrompt"
            :rows="6"
            placeholder="Describe the scene… use @Name to reference characters, e.g. @Aria and @Thorin face the @Dragon in the ruins."
            :items="mentionItems"
            :disabled="starting"
            @update:model-value="queuedNotice = ''"
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

        <!-- Queued confirmation -->
        <div
          v-if="queuedNotice"
          class="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
        >
          <IconGenerate class="h-3.5 w-3.5 text-primary shrink-0" />
          <p class="text-caption text-muted-foreground leading-snug">{{ queuedNotice }}</p>
        </div>

        <!-- Error -->
        <p v-if="error" class="text-caption text-destructive">{{ error }}</p>

        <!-- Actions -->
        <div class="flex gap-2 justify-end items-center">
          <GenerationCostBadge :credits="selectedCost" :byok="byok" class="mr-auto" />
          <span v-if="queuedCount > 0" class="text-caption text-muted-foreground/70">
            Queued this session: {{ queuedCount }}
          </span>
          <button
            type="button"
            class="px-3 py-1.5 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="emit('close')"
          >
            Close
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-4 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="starting || !scenePrompt.trim() || scenePrompt.length > SCENE_LIMIT || !affordable(selectedCost, byok)"
            @click="generate"
          >
            <IconGenerate class="h-3 w-3" :class="starting ? 'animate-pulse' : ''" />
            {{ starting ? 'Queuing…' : 'Generate' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const SCENE_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { IconGenerate } from '@/lib/icons';
import { parseSceneEntities, startChroniclerImage } from "@/ai/useChroniclerImageGeneration";
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
  started: [{ jobId: string; prompt: string; size: string }];
}>();

const SHAPES: { label: string; value: ChroniclerSize }[] = [
  { label: "Square",    value: "1024x1024" },
  { label: "Landscape", value: "1536x1024" },
];

const scenePrompt = ref("");
const size        = ref<ChroniclerSize>("1024x1024");
const starting    = ref(false);
const error       = ref("");
const queuedNotice = ref("");
const queuedCount  = ref(0);
const dialogRef    = ref<HTMLDivElement | null>(null);

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function clearNoticeAfter(ms: number) {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { queuedNotice.value = ""; }, ms);
}

watch(() => props.visible, (v) => {
  if (v) {
    scenePrompt.value = props.initialPrompt ?? "";
    error.value = "";
    queuedNotice.value = "";
  } else {
    queuedCount.value = 0;
    if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
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
  starting.value = true;
  error.value = "";
  queuedNotice.value = "";
  const prompt = scenePrompt.value;
  try {
    const { jobId } = await startChroniclerImage({
      sceneText: prompt,
      entities:  resolvedEntities.value,
      size:      size.value,
    });
    emit("started", { jobId, prompt, size: size.value });
    queuedCount.value += 1;
    scenePrompt.value = "";
    queuedNotice.value = "Queued — it'll render into your note";
    clearNoticeAfter(2500);
    await nextTick();
    dialogRef.value?.querySelector("textarea")?.focus();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "Generation failed.";
  } finally {
    starting.value = false;
  }
}
</script>
