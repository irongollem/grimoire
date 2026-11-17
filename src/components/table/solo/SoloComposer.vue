<template>
  <div class="mx-auto flex w-full max-w-176 flex-col">
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
        <!-- What a fight's turn still allows, in a few words beside the buttons: a paragraph under the box took the
             story's room. -->
        <span v-if="fight && !running" class="mr-auto text-caption text-muted-foreground" data-testid="solo-turn-note">{{ fightNote }}</span>
        <AppButton v-if="running" variant="outline" size="sm" :icon="IconStop" label="Stop" @click="emit('stop')" />
        <template v-else>
          <!-- Nothing typed is a choice too: the character waits and the world goes on. Not in a fight, where
               passing is ending the turn on the board. -->
          <AppButton v-if="canPass" variant="ghost" size="sm" class="mr-auto" label="Go on" title="Say and do nothing: let things happen" data-testid="solo-pass" @click="pass()" />
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
  </div>
</template>

<script lang="ts">
import { ref as sharedRef } from "vue";
// The last lines sent, kept for as long as the page is loaded, so leaving the table and sitting down again still
// has them.
const sentLines = sharedRef<string[]>([]);
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import { IconStop } from "@/lib/icons";
import { remembered, stepHistory, type HistoryWalk } from "@/lib/table/composerHistory";
import { composerKeyAction } from "@/lib/table/composerKeys";
import { SPOKEN_WORDS_PER_TURN, wordCount } from "@/lib/table/fight/turnBudget";
import type { PlayMode } from "@/lib/table/soloTypes";

const { character, running, fight = null } = defineProps<{
  character: string;
  running: boolean;
  /** In a fight on the board: whether it is your turn, whether your one short line aloud is still unsaid, and whether the turn can still pay for a deed. Null outside a fight. */
  fight?: { yours: boolean; words: boolean; canAct: boolean } | null;
}>();
const emit = defineEmits<{ submit: [mode: PlayMode, text: string]; pass: []; stop: [] }>();

const draft = ref("");
const sent = sentLines;
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
  if (!fight.yours) return "Not your turn: you can still ask";
  const say = fight.words ? `${words.value} of ${SPOKEN_WORDS_PER_TURN} words aloud` : "You have said your piece";
  return fight.canAct ? say : `${say} · no deed left this turn`;
});

function submit(mode: PlayMode): void {
  // Locked while a turn runs; nothing to send when nothing is typed. The text stays in the box until it is sent.
  if (running || !canSend.value) return;
  if ((mode === "say" && !canSay.value) || (mode === "do" && !canDo.value)) return;
  const text = draft.value.trim();
  draft.value = "";
  sent.value = remembered(sent.value, text);
  walk.value = { at: null, draft: "" };
  emit("submit", mode, text);
}

// What was sent before comes back with the up arrow, like a shell's history. Only when the caret is on the first
// line going up, or the last going down, so the arrows still move through a draft of several lines.
const walk = ref<HistoryWalk>({ at: null, draft: "" });
function walkHistory(event: KeyboardEvent): boolean {
  if (running || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
  const box = field.value;
  if (!box) return false;
  const up = event.key === "ArrowUp";
  const onEdgeLine = up ? !draft.value.slice(0, box.selectionStart).includes("\n") : !draft.value.slice(box.selectionEnd).includes("\n");
  if (!onEdgeLine) return false;
  const step = stepHistory(sent.value, walk.value, draft.value, up ? -1 : 1);
  if (step === null) return false;
  walk.value = step.walk;
  draft.value = step.text;
  return true;
}

const canPass = computed(() => fight === null && !canSend.value);
function pass(): void {
  if (running || !canPass.value) return;
  emit("pass");
}

function onKeydown(event: KeyboardEvent): void {
  if (walkHistory(event)) {
    event.preventDefault();
    return;
  }
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
