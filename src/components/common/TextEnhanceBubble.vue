<template>
  <BubbleMenu :editor="editor" :tippy-options="{ duration: 100 }">
    <div data-slip class="rounded-md border border-border bg-card shadow-lg overflow-hidden">
      <AppButton
        variant="link"
        size="sm"
        :icon="IconWand"
        :loading="isEnhancing"
        :disabled="isEnhancing"
        label="Enhance"
        :tooltip="enhanceTooltip"
        @click="onEnhance"
      />
    </div>
  </BubbleMenu>

  <Transition name="enhance-error">
    <div
      v-if="enhanceError"
      class="absolute bottom-2 left-2 right-2 z-30 rounded-md bg-destructive/90 px-3 py-2 text-caption text-white shadow-lg"
    >
      {{ enhanceError }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * The Enhance menu shared by `RichTextEditor` and the Scriptorium editor: select
 * text, press Enhance, and the selection is rewritten in place. Mount it only
 * where `useEnhanceAvailable()` says yes; the error line positions itself
 * against the editor's own relative container, so place it inside that.
 */
import { computed, ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import AppButton from "@/components/common/AppButton.vue";
import { IconWand } from "@/lib/icons";
import { parseMarkdown } from "@/lib/tiptap/markdownToTiptap";
import { useTextEnhancement } from "@/ai/useTextEnhancement";

const { editor, context, styleHint, contextRadius } = defineProps<{
  editor: Editor;
  /** What kind of text this is, for tone: "NPC backstory: Mira". */
  context: string;
  styleHint?: string;
  /** Send this many characters either side of the selection for register. */
  contextRadius?: number;
}>();

const { isEnhancing, creditCost, isByok, enhance } = useTextEnhancement();
// The price is null until it is known (see useCampaignProviders); say nothing about it then.
const enhanceTooltip = computed(() => {
  const base = "Rewrite the selection as richer prose";
  if (isByok.value) return `${base} (your API key, no credits)`;
  const cost = creditCost.value;
  if (cost === null) return base;
  return `${base} (${cost} credit${cost === 1 ? "" : "s"})`;
});
const enhanceError = ref<string | null>(null);

async function onEnhance() {
  if (isEnhancing.value) return;
  const { state } = editor;
  const { from, to } = state.selection;
  if (from === to) return;

  const selectedText = state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;

  const docSize = state.doc.content.size;
  const before = contextRadius ? state.doc.textBetween(Math.max(0, from - contextRadius), from, " ") : undefined;
  const after = contextRadius ? state.doc.textBetween(to, Math.min(docSize, to + contextRadius), " ") : undefined;

  enhanceError.value = null;
  try {
    const markdown = await enhance({ selectedText, context, styleHint, before, after });
    if (markdown === null) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, parseMarkdown(markdown), { parseOptions: { preserveWhitespace: false } })
      .run();
  } catch (e) {
    enhanceError.value = e instanceof Error ? e.message : "Enhancement failed";
    setTimeout(() => { enhanceError.value = null; }, 4000);
  }
}
</script>

<style scoped>
.enhance-error-enter-active { transition: all 0.15s ease-out; }
.enhance-error-leave-active { transition: all 0.15s ease-in; }
.enhance-error-enter-from,
.enhance-error-leave-to { opacity: 0; transform: translateY(0.25rem); }
</style>
