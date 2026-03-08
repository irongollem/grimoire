<template>
  <div class="relative">
    <input
      ref="inputEl"
      :value="modelValue"
      v-bind="$attrs"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
      @focus="refreshSuggestions"
    />

    <!-- Autocomplete dropdown -->
    <Transition name="dice-drop">
      <div
        v-if="suggestions.length"
        class="absolute top-full left-0 z-30 mt-1 rounded-md border border-border bg-card shadow-lg overflow-hidden min-w-36"
      >
        <button
          v-for="(s, i) in suggestions"
          :key="s"
          type="button"
          class="w-full px-3 py-1.5 text-left font-fell text-sm capitalize transition-colors"
          :class="
            i === activeIdx
              ? 'bg-primary/20 text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          @mousedown.prevent="select(s)"
        >
          <span class="text-primary font-semibold">{{ s.slice(0, activeWord?.word.length) }}</span
          >{{ s.slice(activeWord?.word.length) }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import { DAMAGE_TYPES } from "@/types/damage.types";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const inputEl = ref<HTMLInputElement | null>(null);
const suggestions = ref<string[]>([]);
const activeIdx = ref(0);

interface WordMatch {
  word: string;
  start: number;
  end: number;
}
const activeWord = ref<WordMatch | null>(null);

/** Find the letter-only word the cursor is currently inside / at the end of. */
function getActiveWord(text: string, cursor: number): WordMatch | null {
  let start = cursor;
  while (start > 0 && !/[\s+·]/.test(text[start - 1])) start--;
  const word = text.slice(start, cursor);
  // Only trigger for letter-only tokens (not dice like "2d6", not numbers)
  if (/^[a-z]+$/i.test(word) && word.length >= 1) {
    return { word: word.toLowerCase(), start, end: cursor };
  }
  return null;
}

function refreshSuggestions() {
  const el = inputEl.value;
  if (!el) return;
  const cursor = el.selectionStart ?? props.modelValue.length;
  const match = getActiveWord(props.modelValue, cursor);
  activeWord.value = match;
  if (match) {
    suggestions.value = (DAMAGE_TYPES as readonly string[]).filter(
      (t) => t.startsWith(match.word) && t !== match.word, // hide exact match
    );
  } else {
    suggestions.value = [];
  }
  activeIdx.value = 0;
}

function onInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  emit("update:modelValue", val);
  nextTick(refreshSuggestions);
}

function select(type: string) {
  const el = inputEl.value;
  if (!el || !activeWord.value) return;
  const { start, end } = activeWord.value;
  const before = props.modelValue.slice(0, start);
  const after = props.modelValue.slice(end);
  const newVal = before + type + after;
  emit("update:modelValue", newVal);
  suggestions.value = [];
  activeWord.value = null;
  nextTick(() => {
    const pos = start + type.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  });
}

function onKeydown(e: KeyboardEvent) {
  if (!suggestions.value.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIdx.value = (activeIdx.value + 1) % suggestions.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIdx.value = (activeIdx.value - 1 + suggestions.value.length) % suggestions.value.length;
  } else if (e.key === "Enter" || e.key === "Tab") {
    if (suggestions.value[activeIdx.value]) {
      e.preventDefault();
      select(suggestions.value[activeIdx.value]);
    }
  } else if (e.key === "Escape") {
    suggestions.value = [];
  }
}

function onBlur() {
  // Small delay so mousedown on a suggestion fires first
  setTimeout(() => {
    suggestions.value = [];
  }, 120);
}
</script>

<style scoped>
.dice-drop-enter-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.dice-drop-leave-active {
  transition: opacity 0.08s ease;
}
.dice-drop-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.dice-drop-leave-to {
  opacity: 0;
}
</style>
