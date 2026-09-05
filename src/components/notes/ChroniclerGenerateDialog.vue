<template>
  <!-- No backdrop dismiss: this holds a typed scene prompt and, between Generate
       and the `started` emit, a paid render whose anchor has not been dropped
       into the note yet. See AppModal's `backdropDismiss`. -->
  <AppModal :open="visible" size="md" :backdrop-dismiss="false" @close="emit('close')">
    <ModalHeader title="Generate Scene Illustration" />

    <div ref="dialogRef" class="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-4 px-5 py-4">
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
          <AppButton
            v-for="s in SHAPES"
            :key="s.value"
            variant="subtle"
            size="xs"
            :active="size === s.value"
            @click="size = s.value"
          >
            <span class="font-cinzel text-xs">{{ s.label }}</span>
            <span class="text-caption-sm opacity-60">{{ byok ? 'BYOK' : `${shapeCost(s.value)} cr` }}</span>
          </AppButton>
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
    </div>

    <!-- Actions -->
    <div class="flex gap-2 justify-end items-center shrink-0 px-5 py-3 border-t border-border">
      <GenerationCostBadge :credits="selectedCost" :byok="byok" class="mr-auto" />
      <span v-if="queuedCount > 0" class="text-caption text-muted-foreground/70">
        Queued this session: {{ queuedCount }}
      </span>
      <AppButton variant="subtle" size="sm" label="Close" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :disabled="starting || !scenePrompt.trim() || scenePrompt.length > SCENE_LIMIT || !affordable(selectedCost, byok)"
        :label="starting ? 'Queuing…' : 'Generate'"
        @click="generate"
      >
        <template #icon>
          <IconGenerate class="h-3 w-3" :class="starting ? 'animate-pulse' : ''" />
        </template>
      </AppButton>
    </div>
  </AppModal>
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
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";

const props = defineProps<{ visible: boolean; initialPrompt?: string; noteId?: string }>();

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

const { ensureLikenessAck } = useLikenessGate();

async function generate() {
  if (!activeCampaignId.value || !scenePrompt.value.trim() || !user.value) return;
  // Only a scene with resolved @mentions actually sends portrait references
  // (see startChroniclerImage's referenceUrls) — an unmentioned/plain scene
  // needs no likeness ack, matching the server's portrait_urls-shaped gate.
  const hasPortraitReferences = resolvedEntities.value.some((e) => e.portraitUrl);
  if (hasPortraitReferences && !(await ensureLikenessAck())) return; // user declined — abort silently
  starting.value = true;
  error.value = "";
  queuedNotice.value = "";
  const prompt = scenePrompt.value;
  try {
    const { jobId } = await startChroniclerImage({
      sceneText: prompt,
      entities:  resolvedEntities.value,
      size:      size.value,
      noteId:    props.noteId ?? null,
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
