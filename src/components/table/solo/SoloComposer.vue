<template>
  <div class="mx-auto flex w-full max-w-160 flex-col gap-2">
    <!-- One voice at a time: while an answer is coming the box is locked and Say and Do become one Stop (Turn, 04). -->
    <!-- The words get the whole width; the three ways to send them sit in a row underneath, each with its key. -->
    <div data-slip class="flex flex-col gap-2 px-3.5 pt-2.5 pb-2">
      <label class="flex">
        <span class="sr-only">What {{ character }} says or does, or your question to the Dungeon Master</span>
        <textarea
          ref="field"
          v-model="draft"
          data-hand
          rows="1"
          maxlength="4000"
          :readonly="running"
          :placeholder="placeholder"
          class="solo-hand field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent text-base leading-6 text-foreground placeholder:font-fell placeholder:italic placeholder:text-muted-foreground focus:outline-none"
          @keydown="onKeydown"
        />
      </label>
      <div class="flex flex-wrap items-center justify-end gap-1.5">
        <AppButton v-if="running" variant="outline" size="sm" :icon="IconStop" label="Stop" @click="emit('stop')" />
        <template v-else>
          <AppButton variant="ghost" size="sm" aria-label="Ask the Dungeon Master" :disabled="!canSend" data-testid="solo-ask" @click="submit('ask')">
            <span>Ask</span><span class="ml-1.5 hidden items-center gap-0.5 sm:inline-flex"><KeyCap>Ctrl</KeyCap><KeyCap>Enter</KeyCap></span>
          </AppButton>
          <AppButton variant="outline" size="sm" aria-label="Do" :disabled="!canSend || !canDo" @click="submit('do')">
            <span>Do</span><span class="ml-1.5 hidden items-center gap-0.5 sm:inline-flex"><KeyCap>Alt</KeyCap><KeyCap>Enter</KeyCap></span>
          </AppButton>
          <AppButton variant="primary" size="sm" aria-label="Say" :disabled="!canSend || !canSay" @click="submit('say')">
            <span>Say</span><span class="ml-1.5 hidden sm:inline-flex"><KeyCap>Enter</KeyCap></span>
          </AppButton>
        </template>
      </div>
    </div>
    <p class="hidden text-caption text-muted-foreground sm:block">
      <template v-if="running">Stop ends the answer where it is. What was already said stays, and is what you pay for.</template>
      <!-- In a fight a turn is about six seconds: the composer says what it still holds (frame 15). -->
      <template v-else-if="fight">{{ fightNote }}</template>
      <template v-else>Say is your character speaking, Do is what they do, Ask is your own question to the Dungeon Master. Shift+Enter starts a new line. A turn costs a fraction of a credit; you are charged a whole credit at a time.</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import { IconStop } from "@/lib/icons";
import { composerKeyAction } from "@/lib/table/composerKeys";
import { SPOKEN_WORDS_PER_TURN, wordCount } from "@/lib/table/fight/turnBudget";
import type { PlayMode } from "@/lib/table/soloTypes";

const { character, running, fight = null } = defineProps<{
  character: string;
  running: boolean;
  /** In a fight on the board: whether it is your turn, whether your one short line aloud is still unsaid, and whether the turn can still pay for a deed. Null outside a fight. */
  fight?: { yours: boolean; words: boolean; canAct: boolean } | null;
}>();
const emit = defineEmits<{ submit: [mode: PlayMode, text: string]; stop: [] }>();

const draft = ref("");
const field = ref<HTMLTextAreaElement | null>(null);
const canSend = computed(() => draft.value.trim() !== "");

// One turn pays for the board and the story alike. Asking the Dungeon Master is the player's own question and is
// always open; saying and doing are the character's, and only on their turn.
const words = computed(() => wordCount(draft.value));
const canSay = computed(() => fight === null || (fight.yours && fight.words && words.value <= SPOKEN_WORDS_PER_TURN));
const canDo = computed(() => fight === null || (fight.yours && fight.canAct));
const placeholder = computed(() => {
  if (running) return "The Dungeon Master is answering…";
  if (fight && !fight.yours) return "The others are acting. You can still ask the Dungeon Master…";
  return `What does ${character} say or do…`;
});
const fightNote = computed(() => {
  if (fight === null) return "";
  if (!fight.yours) return "It is not your turn. Ask is your own question to the Dungeon Master and is always open.";
  const say = !fight.words
    ? "You have said your piece this turn."
    : `Aloud: one short line, about ${SPOKEN_WORDS_PER_TURN} words (${words.value} so far).`;
  const act = fight.canAct ? "Trying something costs your Action." : "Your turn cannot pay for another deed.";
  return `A turn is about six seconds. ${say} ${act}`;
});

function submit(mode: PlayMode): void {
  // Locked while a turn runs; nothing to send when nothing is typed. The text stays in the box until it is sent.
  if (running || !canSend.value) return;
  if ((mode === "say" && !canSay.value) || (mode === "do" && !canDo.value)) return;
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
