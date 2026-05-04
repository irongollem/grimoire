<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="emit('close')"
    >
      <div class="bg-card rounded-lg border border-border p-5 max-w-2xl w-full mx-4 flex flex-col gap-4 max-h-[90vh] overflow-hidden">
        <h3 class="font-cinzel text-sm font-bold tracking-wider shrink-0">Write Chronicle</h3>

        <template v-if="!previewMarkdown">
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
                class="font-fell text-xs"
                :class="rawText.length >= NOTES_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
              >{{ rawText.length }} / {{ NOTES_LIMIT }}</span>
            </div>
          </div>

          <!-- Tone selector -->
          <div class="flex flex-col gap-1 shrink-0">
            <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Tone</label>
            <div class="flex gap-1.5 flex-wrap">
              <button
                v-for="t in TONES"
                :key="t.value"
                type="button"
                class="rounded-md border px-2.5 py-1 font-cinzel text-xs transition-colors"
                :class="tone === t.value
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'"
                @click="tone = t.value"
              >
                {{ t.label }}
              </button>
            </div>
          </div>

          <!-- Error -->
          <p v-if="error" class="font-fell text-xs text-destructive shrink-0">{{ error }}</p>

          <!-- Actions -->
          <div class="flex gap-2 justify-end shrink-0">
            <button
              type="button"
              class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              :disabled="isGenerating"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="isGenerating || !rawText.trim() || rawText.length > NOTES_LIMIT"
              @click="generate"
            >
              <BookText class="h-3 w-3" :class="isGenerating ? 'animate-pulse' : ''" />
              {{ isGenerating ? 'Writing…' : 'Write Chronicle' }}
            </button>
          </div>
        </template>

        <template v-else>
          <!-- Preview -->
          <div class="flex flex-col gap-1 min-h-0 flex-1">
            <div class="flex items-center justify-between">
              <span class="font-cinzel text-xs text-muted-foreground tracking-wide">Preview</span>
              <button
                type="button"
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
                @click="resetToInput"
              >
                ← Edit
              </button>
            </div>
            <div class="overflow-y-auto border border-border rounded-md p-4 bg-background min-h-0 flex-1">
              <RichTextViewer :content="previewContent" />
            </div>
          </div>

          <!-- Preview actions -->
          <div class="flex gap-2 justify-end shrink-0">
            <button
              type="button"
              class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              @click="insertChronicle"
            >
              <BookText class="h-3 w-3" />
              Insert into Note
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { AI_PROMPT_LIMIT_LONG } from "@/ai/utils";

const NOTES_LIMIT = AI_PROMPT_LIMIT_LONG;
import { BookText } from "lucide-vue-next";
import {
  useChroniclerTextGeneration,
  preprocessChronicleMarkdown,
  CHRONICLER_TONES,
  type ChroniclerTone,
} from "@/ai/useChroniclerTextGeneration";
import { useEntityMentionItems } from "@/composables/useEntityMentionItems";
import { markdownToTiptapJson } from "@/lib/markdownToTiptap";
import MentionTextarea from "@/components/common/MentionTextarea.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const TONES = CHRONICLER_TONES;

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  close: [];
  insert: [markdown: string];
}>();

const rawText          = ref("");
const tone             = ref<ChroniclerTone>("dramatic");
const rawGeneratedMd   = ref<string | null>(null); // AI output before preprocessing
const previewMarkdown  = ref<string | null>(null); // preprocessed for RichTextViewer
const error            = ref("");

const { isGenerating, generate: generateChronicle } = useChroniclerTextGeneration();
const { mentionItems, partyMembers, npcs, monsters } = useEntityMentionItems();

watch(() => props.visible, (v) => {
  if (v) {
    rawText.value        = "";
    rawGeneratedMd.value = null;
    previewMarkdown.value = null;
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
    const raw = await generateChronicle({
      rawText: rawText.value,
      tone: tone.value,
      npcs: npcs.value,
      monsters: monsters.value,
      partyMembers: partyMembers.value,
    });
    rawGeneratedMd.value  = raw;
    previewMarkdown.value = preprocessChronicleMarkdown(raw);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Generation failed.";
  }
}

function resetToInput() {
  rawGeneratedMd.value  = null;
  previewMarkdown.value = null;
  error.value = "";
}

function insertChronicle() {
  if (!rawGeneratedMd.value) return;
  emit("insert", rawGeneratedMd.value);
  emit("close");
}
</script>
