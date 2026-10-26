<template>
  <MenuPopover :label="`${otherName} is…`" data-testid="type-picker" @open="reset">
    <template #trigger="{ toggle, open }">
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
    </template>

    <template #default="{ close }">
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
          @click="pick(c, close)"
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
    </template>
  </MenuPopover>
</template>

<script setup lang="ts">
/**
 * The type word of a connection, as a picker (#1084: every type word is a
 * picker, nothing is re-added). Common types first, the rest behind "more…"
 * with a filter; a type that lives in another record says where choosing it
 * moves the tie, and a record that holds one value says what it replaces.
 * The popover shell and its keys are `MenuPopover`.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import { choiceHomeNote, splitChoices } from "@/components/connections/connectionRows";
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

const expanded = ref(false);
const filter = ref("");

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

function reset() {
  expanded.value = false;
  filter.value = "";
}

function pick(c: TypeChoice, close: (refocus: boolean) => void) {
  close(true);
  if (!isCurrent(c)) emit("pick", c);
}
</script>
