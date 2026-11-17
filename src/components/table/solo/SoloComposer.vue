<template>
  <div class="mx-auto flex w-full max-w-160 flex-col gap-2">
    <!-- One voice at a time: while an answer is coming the box is locked and Say and Do become one Stop (Turn, 04). -->
    <label data-slip class="flex items-end gap-2.5 py-2.5 pr-2.5 pl-3.5">
      <span class="sr-only">What {{ character }} says or does, or your question to the Dungeon Master</span>
      <textarea
        ref="field"
        v-model="draft"
        data-hand
        rows="1"
        maxlength="4000"
        :readonly="running"
        :placeholder="running ? 'The Dungeon Master is answering…' : `What does ${character} say or do…`"
        class="solo-hand field-sizing-content max-h-40 min-h-7 flex-1 resize-none bg-transparent text-[1.1875rem] leading-7 text-foreground placeholder:font-fell placeholder:text-base placeholder:italic placeholder:text-muted-foreground focus:outline-none"
        @keydown="onKeydown"
      />
      <AppButton v-if="running" variant="outline" size="md" :icon="IconStop" label="Stop" @click="emit('stop')" />
      <template v-else>
        <AppButton variant="ghost" size="md" label="Ask the Dungeon Master" :disabled="!canSend" data-testid="solo-ask" @click="submit('ask')">
          <span>Ask</span><span class="ml-1.5 hidden text-caption text-muted-foreground sm:inline">Ctrl Enter</span>
        </AppButton>
        <AppButton variant="outline" size="md" label="Do" :disabled="!canSend" @click="submit('do')">
          <span>Do</span><span class="ml-1.5 hidden text-caption text-muted-foreground sm:inline">Alt Enter</span>
        </AppButton>
        <AppButton variant="primary" size="md" label="Say" :disabled="!canSend" @click="submit('say')">
          <span>Say</span><span class="ml-1.5 hidden text-caption opacity-75 sm:inline">Enter</span>
        </AppButton>
      </template>
    </label>
    <p class="hidden text-caption text-muted-foreground sm:block">
      <template v-if="running">Stop ends the answer where it is. What was already said stays, and is what you pay for.</template>
      <template v-else>Enter says it aloud. Alt+Enter does it. Ctrl+Enter asks the Dungeon Master a question that is yours, not your character's. Shift+Enter starts a new line. A turn costs a fraction of a credit; you are charged a whole credit at a time.</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconStop } from "@/lib/icons";
import { composerKeyAction } from "@/lib/table/composerKeys";
import type { PlayMode } from "@/lib/table/soloTypes";

const { character, running } = defineProps<{ character: string; running: boolean }>();
const emit = defineEmits<{ submit: [mode: PlayMode, text: string]; stop: [] }>();

const draft = ref("");
const field = ref<HTMLTextAreaElement | null>(null);
const canSend = computed(() => draft.value.trim() !== "");

function submit(mode: PlayMode): void {
  // Locked while a turn runs; nothing to send when nothing is typed. The text stays in the box until it is sent.
  if (running || !canSend.value) return;
  const text = draft.value.trim();
  draft.value = "";
  emit("submit", mode, text);
}

function onKeydown(event: KeyboardEvent): void {
  const mode = composerKeyAction(event);
  if (mode === null) return;
  event.preventDefault();
  submit(mode);
}

defineExpose({ focus: () => field.value?.focus() });
</script>

<style scoped>
:root[data-theme^="vellum"] .solo-hand {
  font-family: "Fondamento", var(--vl-serif);
  color: var(--vl-hand-ink);
}
:root[data-theme^="vellum"] .solo-hand::placeholder {
  font-family: var(--vl-serif);
}
</style>
