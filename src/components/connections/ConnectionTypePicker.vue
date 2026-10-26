<template>
  <div ref="triggerRef" class="inline-flex">
    <AppButton
      variant="link"
      size="inline-caption"
      class="max-md:min-h-11"
      :style="{ color }"
      :label="word"
      :tooltip="`Change how ${otherName} is tied to ${subjectName}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="type-word"
      @click="toggle"
    />
  </div>

  <!-- Teleported: a slip clips overflow, which would cut the list off. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      class="z-300 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
      role="menu"
      :aria-label="`${otherName} is…`"
      data-testid="type-picker"
      @keydown="onKeydown"
    >
      <div v-if="expanded" class="px-2 pb-1">
        <AppInput
          v-model="filter"
          type="search"
          block
          size="caption"
          placeholder="Find a type…"
          aria-label="Find a type"
          data-testid="type-filter"
        />
      </div>

      <div v-for="c in shown" :key="optionKey(c)">
        <AppButton
          variant="menu"
          size="md"
          block
          class="rounded-none max-md:min-h-11"
          role="menuitemradio"
          :aria-checked="isCurrent(c)"
          :active="isCurrent(c)"
          :label="c.word"
          :data-type-option="optionKey(c)"
          @click="pick(c)"
        />
        <p v-if="noteFor(c)" class="px-3 pb-1.5 text-caption italic text-muted-foreground" data-testid="type-note">{{ noteFor(c) }}</p>
      </div>
      <p v-if="shown.length === 0" class="px-3 py-2 text-caption italic text-muted-foreground">No type matches.</p>

      <AppButton
        v-if="!expanded && more.length > 0"
        variant="menu"
        size="md"
        block
        class="rounded-none border-t border-border max-md:min-h-11"
        label="more…"
        data-testid="type-more"
        @click="expanded = true"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The type word of a connection, as a picker (#1084: every type word is a
 * picker, nothing is re-added). Common types first, the rest behind "more…"
 * with a filter; a type that lives in another record says where choosing it
 * moves the tie, and a record that holds one value says what it replaces.
 * Arrow keys, Home and End move between the entries, Escape closes and hands
 * focus back to the word.
 */
import { computed, nextTick, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { choiceHomeNote, splitChoices } from "@/components/connections/connectionRows";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import type { TypeChoice } from "@/lib/worldLinks/connections";

const { choices, isCurrent, replaces = () => null } = defineProps<{
  word: string;
  /** A CSS colour for the word: its family's token. */
  color: string;
  subjectName: string;
  otherName: string;
  choices: readonly TypeChoice[];
  isCurrent: (choice: TypeChoice) => boolean;
  /** What a single-valued record would replace ("Replaces Thane's Crossing"). */
  replaces?: (choice: TypeChoice) => string | null;
}>();
const emit = defineEmits<{ pick: [choice: TypeChoice] }>();

const open = ref(false);
const expanded = ref(false);
const filter = ref("");
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

const split = computed(() => splitChoices(choices));
const more = computed(() => split.value.more);
/** The chosen type stays visible even when it is not a common one. */
const common = computed(() => [...split.value.common, ...split.value.more.filter((c) => isCurrent(c))]);
const shown = computed(() => {
  const list = expanded.value ? choices : common.value;
  const q = filter.value.trim().toLowerCase();
  return q ? list.filter((c) => c.word.toLowerCase().includes(q)) : list;
});

function optionKey(c: TypeChoice): string {
  return `${c.key}:${c.subjectIsFrom}:${c.home ?? "link"}`;
}

function noteFor(c: TypeChoice): string | null {
  const parts = [choiceHomeNote(c), c.single ? replaces(c) : null].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(". ") : null;
}

function items(): HTMLButtonElement[] {
  return floatingRef.value ? [...floatingRef.value.querySelectorAll<HTMLButtonElement>("button:not([disabled])")] : [];
}

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  expanded.value = false;
  filter.value = "";
  // Wait for the panel to mount, then put focus on the current type (or the first entry).
  await nextTick();
  const all = items();
  (all.find((b) => b.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
}

function close(refocus: boolean) {
  open.value = false;
  if (refocus) triggerRef.value?.querySelector("button")?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    close(true);
    return;
  }
  const all = items();
  if (all.length === 0) return;
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | null = null;
  if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % all.length;
  else if (e.key === "ArrowUp") next = at <= 0 ? all.length - 1 : at - 1;
  // Home and End belong to the filter's text caret while it has focus.
  else if (e.key === "Home" && at >= 0) next = 0;
  else if (e.key === "End" && at >= 0) next = all.length - 1;
  if (next === null) return;
  e.preventDefault();
  all[next]?.focus();
}

function pick(c: TypeChoice) {
  close(true);
  if (!isCurrent(c)) emit("pick", c);
}
</script>
