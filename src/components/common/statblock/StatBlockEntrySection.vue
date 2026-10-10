<template>
  <div>
    <p class="text-label-lg font-semibold text-muted-foreground mb-2">
      {{ label.toUpperCase() }}
    </p>
    <div v-for="(entry, i) in model" :key="keys[i]" class="flex gap-2 mb-3 items-start">
      <div class="flex-1 space-y-1 min-w-0">
        <label class="block">
          <span class="sr-only">{{ label }} name</span>
          <AppInput
            :model-value="entry.name"
            tone="filled"
            size="body"
            placeholder="Name"
            @update:model-value="(v) => update(i, 'name', v)"
          />
        </label>
        <RichTextEditor
          :model-value="entry.description"
          placeholder="Description…"
          @update:model-value="update(i, 'description', $event)"
        />

        <!-- What the runner will roll for this entry -->
        <div
          v-if="entry.name.trim() || entry.description.trim()"
          class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption"
          data-test="rolls-as"
        >
          <span class="font-semibold text-muted-foreground">Rolls as</span>
          <template v-if="reviewOf(entry)">
            <span class="text-tone-caution">Couldn't read the numbers: {{ reviewOf(entry) }}</span>
          </template>
          <template v-else-if="describe(entry).options">
            <span class="text-foreground">One of</span>
          </template>
          <template v-else-if="describe(entry).summary">
            <span class="text-foreground" data-test="rolls-as-summary">{{ describe(entry).summary }}</span>
          </template>
          <span v-else class="text-muted-foreground">Not rolled · read at the table</span>
          <span
            v-for="badge in describe(entry).badges"
            :key="badge"
            class="rounded-full border border-border px-2 text-muted-foreground"
          >{{ badge }}</span>
          <span v-if="entry.structured.source === 'manual'" class="text-muted-foreground italic">Set by hand</span>
          <span class="flex items-center gap-3 ml-auto">
            <AppButton
              v-if="reviewOf(entry) && editing !== keys[i]"
              variant="link"
              size="inline-xs"
              label="Set by hand"
              @click="editing = keys[i]"
            />
            <AppButton
              v-else-if="editing !== keys[i]"
              variant="link"
              size="inline-xs"
              label="Edit roll"
              @click="editing = keys[i]"
            />
            <AppButton
              v-if="entry.structured.source === 'manual'"
              variant="link"
              size="inline-xs"
              label="Reset to parsed"
              @click="reset(i)"
            />
          </span>
        </div>
        <ul v-if="!reviewOf(entry) && describe(entry).options" class="text-caption flex flex-col gap-0.5 pl-4" data-test="rolls-as-options">
          <li v-for="opt in describe(entry).options" :key="opt.name">
            <span class="font-semibold text-foreground">{{ opt.name }}</span>
            <span class="text-muted-foreground"> · {{ opt.summary }}</span>
          </li>
        </ul>
        <StatBlockEntryRollEditor
          v-if="editing === keys[i]"
          :structure="entry.structured"
          :show-cost="list === 'legendary_actions'"
          @save="(s) => setByHand(i, s)"
          @cancel="editing = null"
        />
      </div>
      <AppButton
        variant="ghost"
        tone="danger"
        size="inline-xs"
        icon-size="md"
        :icon="IconClose"
        class="shrink-0 mt-1"
        :aria-label="`Remove ${label.toLowerCase()}`"
        @click="remove(i)"
      />
    </div>
    <AppButton variant="link" size="inline" :label="`+ Add ${label}`" @click="add" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import StatBlockEntryRollEditor from "@/components/common/statblock/StatBlockEntryRollEditor.vue";
import { describeStructure } from "@/lib/statBlock/describeStructure";
import { IconClose } from "@/lib/icons";
import type { StatBlockListKey } from "@/rules/statBlock/parseAction";
import { structureEntry } from "@/rules/statBlock/structureEntry";
import type { ActionStructure, StatBlockEntry } from "@/types/statBlock.types";

const { label, list, siblings } = defineProps<{
  label: string;
  list: StatBlockListKey;
  /** Names of every entry across all of the stat block's lists, for Multiattack. */
  siblings: string[];
}>();

/**
 * A stat block's entry list (#1017): name + description like a trait list, plus
 * the structure the runner rolls from. Every edit re-reads the prose, except
 * that a structure a DM set by hand is kept until they reset it.
 */
const model = defineModel<StatBlockEntry[]>({ default: () => [] });

/**
 * Stable per-item keys so Vue never reuses a Tiptap editor instance for a
 * different item when an item is deleted. Using index as key caused the first
 * item's name to disappear and the last item's description to vanish on delete.
 */
let _counter = 0;
const nextKey = () => ++_counter;

const keys = ref<number[]>(model.value.map(() => nextKey()));
const editing = ref<number | null>(null);

let ownUpdate = false;

// Fires when the array REFERENCE changes. Our own emits (via ownUpdate) are
// skipped; only external replacements (navigation, template apply) rebuild keys.
watch(model, () => {
  if (ownUpdate) { ownUpdate = false; return; }
  keys.value = model.value.map(() => nextKey());
  editing.value = null;
});

function structure(entry: Pick<StatBlockEntry, "name" | "description"> & { structured?: ActionStructure }): ActionStructure {
  return structureEntry(entry, { list, siblings });
}

function describe(entry: StatBlockEntry) {
  return describeStructure(entry.structured);
}

function reviewOf(entry: StatBlockEntry): string | undefined {
  return entry.structured.review;
}

function replaceAt(i: number, entry: StatBlockEntry) {
  ownUpdate = true;
  const arr = [...model.value];
  arr[i] = entry;
  model.value = arr;
}

function add() {
  keys.value.push(nextKey());
  ownUpdate = true;
  model.value = [...model.value, { name: "", description: "", structured: { kind: "other", source: "parsed" } }];
}

function remove(i: number) {
  keys.value.splice(i, 1);
  editing.value = null;
  ownUpdate = true;
  const arr = [...model.value];
  arr.splice(i, 1);
  model.value = arr;
}

function update(i: number, key: "name" | "description", value: string) {
  // Spread only the changed item; unchanged items keep the same object reference
  // so Vue skips re-rendering their children (prevents sibling Tiptap editors
  // from being disturbed, which caused scroll/blur issues with sticky toolbars).
  const next = { ...model.value[i], [key]: value };
  replaceAt(i, { ...next, structured: structure(next) });
}

function setByHand(i: number, structured: ActionStructure) {
  replaceAt(i, { ...model.value[i], structured });
  editing.value = null;
}

function reset(i: number) {
  const { name, description } = model.value[i];
  replaceAt(i, { name, description, structured: structure({ name, description }) });
}
</script>
