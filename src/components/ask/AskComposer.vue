<template>
  <div class="flex shrink-0 flex-col gap-1.5 border-t border-border px-3 py-2.5">
    <div class="flex items-end gap-2">
      <label class="flex min-w-0 flex-1">
        <span class="sr-only">Ask Grimoire</span>
        <textarea
          ref="field"
          v-model="draft"
          data-hand
          rows="1"
          maxlength="4000"
          placeholder="Ask about your campaign, or ask for something to be made"
          class="ask-composer field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent text-base leading-6 text-foreground placeholder:font-fell placeholder:italic placeholder:text-muted-foreground focus:outline-none"
          data-testid="ask-input"
          @keydown="onKeydown"
        />
      </label>
      <AppButton variant="primary" size="icon-sm" :icon="IconSend" aria-label="Send" :disabled="!canSend" data-testid="ask-send" @click="submit" />
    </div>
    <p class="text-caption text-muted-foreground" data-testid="ask-allowance">{{ line }}</p>
  </div>
</template>

<script setup lang="ts">
/** The DM's box: Enter sends, Shift+Enter breaks the line, and the one line under it says what a question costs. */
import { computed, ref } from "vue";
import { IconSend } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";

const { running = false, line = "" } = defineProps<{ running?: boolean; line?: string }>();
const emit = defineEmits<{ send: [text: string] }>();

const draft = ref("");
const field = ref<HTMLTextAreaElement | null>(null);
const canSend = computed(() => draft.value.trim() !== "" && !running);

function submit() {
  if (!canSend.value) return;
  emit("send", draft.value.trim());
  draft.value = "";
}

function onKeydown(event: KeyboardEvent) {
  // `isComposing`: Enter that commits an IME candidate is not a send.
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}

defineExpose({ focus: () => field.value?.focus() });
</script>

<style scoped>
:root[data-theme^="vellum"] .ask-composer {
  font-family: "Fondamento", var(--vl-serif);
  color: var(--vl-hand-ink);
}
:root[data-theme^="vellum"] .ask-composer::placeholder {
  font-family: var(--vl-serif);
}
</style>
