<template>
  <!--
    `backdrop-dismiss` off: this panel holds a fact dump the DM typed by hand
    and, after Write, a narrative that cost credits and cannot be recovered. A
    click landing beside the panel is not a decision to throw either away.
    Escape and Cancel still work, and ask first once there is a draft in hand.
  -->
  <AppModal :open="visible" size="lg" :backdrop-dismiss="false" @close="requestClose">
    <ModalHeader title="Write Chronicle" />

    <template v-if="step === 'facts'">
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
        <AppButton variant="subtle" size="sm" label="Cancel" :disabled="isGenerating" @click="requestClose" />
        <!--
          The draft is kept when the DM steps back to the facts, so returning to
          it costs nothing. Without this the only way out of the facts step was
          to generate again, and a second generation is a second charge.
        -->
        <AppButton
          v-if="draftMarkdown"
          variant="subtle"
          size="sm"
          label="Back to draft →"
          :disabled="isGenerating"
          @click="step = 'preview'"
        />
        <AppButton
          variant="primary"
          size="sm"
          :disabled="isGenerating || !rawText.trim() || rawText.length > NOTES_LIMIT || !affordable(textCreditCost, textIsByok)"
          :label="isGenerating ? 'Writing…' : draftMarkdown ? 'Write again' : 'Write Chronicle'"
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
      <div class="min-h-0 flex-1 flex flex-col gap-3 px-5 py-4">
        <div class="flex items-center justify-between shrink-0">
          <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Preview</span>
          <AppButton variant="subtle" size="xs" label="← Edit facts" @click="step = 'facts'" />
        </div>

        <!--
          The model opens its output with a title line — "# Session 4: The
          Duke's Blood" — which used to land in the note body while the note's
          own Title and Session # fields stayed empty. It is parsed out and
          shown here instead, so what goes into those fields is visible before
          Insert rather than after.
        -->
        <div class="shrink-0 flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex-1 min-w-48 flex flex-col gap-1">
              <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Note title</span>
              <AppInput v-model="titleField" tone="card" size="sm" placeholder="Note title…" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Session #</span>
              <AppInput
                v-model.number="sessionField"
                type="number"
                min="1"
                tone="card"
                size="sm"
                placeholder="—"
                class="w-24"
              />
            </label>
          </div>
          <!--
            Shown only when the note already carried a title of its own: the
            field keeps what the DM wrote, and the model's suggestion is one tap
            away rather than applied over the top of it.
          -->
          <div v-if="hasSuggestion" class="flex flex-wrap items-center gap-2">
            <span class="text-caption text-muted-foreground">
              Suggested: “{{ suggestionLabel }}”
            </span>
            <AppButton variant="subtle" size="xs" label="Use" @click="applySuggestion" />
          </div>
        </div>

        <div class="overflow-y-auto overscroll-contain border border-border rounded-md p-4 bg-background min-h-0 flex-1">
          <RichTextViewer :content="previewContent" />
        </div>
      </div>

      <!-- Preview actions -->
      <div class="flex gap-2 justify-end shrink-0 px-5 py-3 border-t border-border">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="requestClose" />
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
import { parseChronicleHeading } from "@/ai/chronicleHeading";
import type { AiProvenance } from "@/ai/provenance";
import type { ChronicleInsert } from "@/types/chronicler.types";
import { useConfirm } from "@/composables/useConfirm";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { markdownToTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppInput from "@/components/common/AppInput.vue";
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
  /** The note's current title and session number, so a parsed suggestion is
   *  offered rather than written over something the DM typed. */
  noteTitle?: string;
  noteSessionNum?: number | null;
}>();
const emit = defineEmits<{
  close: [];
  insert: [payload: ChronicleInsert];
}>();

const rawText           = ref("");
const tone              = ref<ChroniclerTone>("dramatic");
const step              = ref<"facts" | "preview">("facts");
/** AI output with the title heading stripped — what gets inserted. Held across
 *  a step back to the facts, so returning to it never costs a second charge. */
const draftMarkdown     = ref<string | null>(null);
const suggestedTitle    = ref<string | null>(null);
const suggestedSession  = ref<number | null>(null);
const titleField        = ref("");
const sessionField      = ref<number | null>(null);
const aiProvenance      = ref<AiProvenance | null>(null);
const error             = ref("");

const { confirm } = useConfirm();
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
    rawText.value          = "";
    step.value             = "facts";
    draftMarkdown.value    = null;
    suggestedTitle.value   = null;
    suggestedSession.value = null;
    titleField.value       = "";
    sessionField.value     = null;
    aiProvenance.value     = null;
    error.value            = "";
  }
});

const previewContent = computed(() => {
  if (draftMarkdown.value === null) return null;
  return JSON.parse(markdownToTiptapJson(preprocessChronicleMarkdown(draftMarkdown.value)));
});

/** True when the model proposed something the fields are not already showing —
 *  i.e. the DM's own title/number is in there and was kept. */
const hasSuggestion = computed(() => {
  if (!suggestedTitle.value && suggestedSession.value === null) return false;
  return (
    (suggestedTitle.value !== null && suggestedTitle.value !== titleField.value) ||
    (suggestedSession.value !== null && suggestedSession.value !== sessionField.value)
  );
});

const suggestionLabel = computed(() =>
  [
    suggestedSession.value !== null ? `Session ${suggestedSession.value}` : null,
    suggestedTitle.value,
  ]
    .filter(Boolean)
    .join(": "),
);

function applySuggestion() {
  if (suggestedTitle.value) titleField.value = suggestedTitle.value;
  if (suggestedSession.value !== null) sessionField.value = suggestedSession.value;
}

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
    const heading = parseChronicleHeading(result.chronicle);
    draftMarkdown.value    = heading.body;
    suggestedTitle.value   = heading.title;
    suggestedSession.value = heading.sessionNum;
    // The DM's own title wins the field; the model's is offered beneath it.
    titleField.value   = props.noteTitle?.trim() || heading.title || "";
    sessionField.value = props.noteSessionNum ?? heading.sessionNum;
    aiProvenance.value = result.ai_provenance ?? null;
    step.value = "preview";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Generation failed.";
  }
}

/** Escape or Cancel. A generated chronicle is paid for and unrecoverable, so
 *  losing one is a question rather than a side effect. */
async function requestClose() {
  if (draftMarkdown.value !== null) {
    const ok = await confirm(
      "This chronicle has not been inserted into the note. Closing discards it, and writing another costs credits.",
      { title: "Discard chronicle", confirmLabel: "Discard" },
    );
    if (!ok) return;
  }
  emit("close");
}

function insertChronicle() {
  if (draftMarkdown.value === null) return;
  emit("insert", {
    markdown: draftMarkdown.value,
    title: titleField.value.trim() || null,
    sessionNum: typeof sessionField.value === "number" && Number.isFinite(sessionField.value)
      ? sessionField.value
      : null,
    aiProvenance: aiProvenance.value,
  });
  emit("close");
}
</script>
