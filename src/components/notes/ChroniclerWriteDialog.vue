<template>
  <AppModal :open="visible" size="lg" @close="emit('close')">
    <ModalHeader title="Write Chronicle" />

    <template v-if="!previewMarkdown">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-4 px-5 py-4">
        <!-- Raw facts input -->
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Raw session facts</label>
          <MentionTextarea
            v-model="rawText"
            :rows="8"
            placeholder="Dump your notes here… use @Name to reference characters. E.g: Kira stabbed the duke, @Veyra convinced the guards it was self-defence, party escaped via sewer."
            :items="mentionItems"
            :disabled="isGenerating"
          />
          <div class="flex justify-end">
            <span
              class="text-caption"
              :class="rawText.length >= NOTES_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ rawText.length }} / {{ NOTES_LIMIT }}</span>
          </div>
        </div>

        <!-- Tone selector -->
        <div class="flex flex-col gap-1 shrink-0">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Tone</label>
          <SegmentedControl v-model="tone" :options="TONES" size="sm" gap="loose" wrap />
        </div>

        <!-- Error -->
        <p v-if="error" class="text-caption text-destructive shrink-0">{{ error }}</p>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end items-center shrink-0 px-5 py-3 border-t border-border">
        <GenerationCostBadge
          :credits="textCreditCost"
          :byok="textIsByok"
          class="mr-auto"
        />
        <AppButton variant="subtle" size="sm" label="Cancel" :disabled="isGenerating" @click="emit('close')" />
        <AppButton
          variant="primary"
          size="sm"
          :disabled="isGenerating || !rawText.trim() || rawText.length > NOTES_LIMIT || !affordable(textCreditCost, textIsByok)"
          :label="isGenerating ? 'Writing…' : 'Write Chronicle'"
          @click="generate"
        >
          <template #icon>
            <IconNote class="h-3 w-3" :class="isGenerating ? 'animate-pulse' : ''" />
          </template>
        </AppButton>
      </div>
    </template>

    <template v-else>
      <!-- Preview -->
      <div class="min-h-0 flex-1 flex flex-col gap-1 px-5 py-4">
        <div class="flex items-center justify-between shrink-0">
          <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Preview</span>
          <AppButton variant="subtle" size="xs" label="← Edit" @click="resetToInput" />
        </div>
        <div class="overflow-y-auto overscroll-contain border border-border rounded-md p-4 bg-background min-h-0 flex-1">
          <RichTextViewer :content="previewContent" />
        </div>
      </div>

      <!-- Preview actions -->
      <div class="flex gap-2 justify-end shrink-0 px-5 py-3 border-t border-border">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
        <AppButton
          variant="primary"
          size="sm"
          :icon="IconNote"
          icon-size="xs"
          label="Insert into Note"
          @click="insertChronicle"
        />
      </div>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

// Chronicler accepts a larger fact-dump than other prompts — a full session's
// raw notes run long. Input is wrapped (not truncated) before sending, so this
// is purely the UI/validation ceiling.
const NOTES_LIMIT = 3000;
import { IconNote } from '@/lib/icons';
import {
  useChroniclerTextGeneration,
  preprocessChronicleMarkdown,
  CHRONICLER_TONES,
  type ChroniclerTone,
} from "@/ai/useChroniclerTextGeneration";
import type { AiProvenance } from "@/ai/provenance";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { markdownToTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

const TONES = CHRONICLER_TONES;

const props = defineProps<{
  visible: boolean;
  /** The note being edited, so retrieval can exclude it from its own recap
   *  (#600). null/undefined for a new, unsaved note. */
  noteId?: string | null;
}>();
const emit = defineEmits<{
  close: [];
  insert: [markdown: string, aiProvenance: AiProvenance | null];
}>();

const rawText          = ref("");
const tone              = ref<ChroniclerTone>("dramatic");
const rawGeneratedMd    = ref<string | null>(null); // AI output before preprocessing
const previewMarkdown   = ref<string | null>(null); // preprocessed for RichTextViewer
const aiProvenance      = ref<AiProvenance | null>(null);
const error             = ref("");

const { isGenerating, generate: generateChronicle } = useChroniclerTextGeneration();
const { mentionItems, partyMembers, npcs, monsters } = useEntityMentionItems();

const campaign = useCampaignStore();
const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("chronicle_text") * textMultiplierFor(textProvider.value) * 100) / 100,
);

watch(() => props.visible, (v) => {
  if (v) {
    rawText.value        = "";
    rawGeneratedMd.value = null;
    previewMarkdown.value = null;
    aiProvenance.value   = null;
    error.value          = "";
  }
});

const previewContent = computed(() => {
  if (!previewMarkdown.value) return null;
  return JSON.parse(markdownToTiptapJson(previewMarkdown.value));
});

async function generate() {
  if (!rawText.value.trim()) return;
  error.value = "";
  try {
    const result = await generateChronicle({
      rawText: rawText.value,
      tone: tone.value,
      npcs: npcs.value,
      monsters: monsters.value,
      partyMembers: partyMembers.value,
      excludeNoteId: props.noteId ?? undefined,
    });
    rawGeneratedMd.value  = result.chronicle;
    previewMarkdown.value = preprocessChronicleMarkdown(result.chronicle);
    aiProvenance.value    = result.ai_provenance ?? null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Generation failed.";
  }
}

function resetToInput() {
  rawGeneratedMd.value  = null;
  previewMarkdown.value = null;
  aiProvenance.value    = null;
  error.value = "";
}

function insertChronicle() {
  if (!rawGeneratedMd.value) return;
  emit("insert", rawGeneratedMd.value, aiProvenance.value);
  emit("close");
}
</script>
