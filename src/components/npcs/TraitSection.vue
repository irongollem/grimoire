<template>
  <div>
    <p class="text-label-lg font-semibold text-muted-foreground mb-2">
      {{ label.toUpperCase() }}
    </p>
    <div v-for="(entry, i) in model" :key="keys[i]" class="flex gap-2 mb-2 items-start">
      <div class="flex-1 space-y-1">
        <label class="block">
          <span class="sr-only">{{ label }} name</span>
          <input
            :value="entry.name"
            placeholder="Name"
            class="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="update(i, 'name', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <RichTextEditor
          :model-value="entry.description"
          placeholder="Description…"
          @update:model-value="update(i, 'description', $event)"
        />
      </div>
      <button
        type="button"
        class="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1 text-lg leading-none"
        @click="remove(i)"
      >
        ✕
      </button>
    </div>
    <button
      type="button"
      class="font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
      @click="add"
    >
      + Add {{ label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";

defineProps<{ label: string }>();

const model = defineModel<Array<{ name: string; description: string }>>({ default: [] });

/**
 * Stable per-item keys so Vue never reuses a Tiptap editor instance for a
 * different item when an item is deleted. Using index as key caused the first
 * item's name to disappear and the last item's description to vanish on delete.
 */
let _counter = 0;
const nextKey = () => ++_counter;

const keys = ref<number[]>(model.value.map(() => nextKey()));

let ownUpdate = false;

// Fires when the array REFERENCE changes. Our own emits (via ownUpdate) are
// skipped; only external replacements (navigation, template apply) rebuild keys.
watch(model, () => {
  if (ownUpdate) { ownUpdate = false; return; }
  keys.value = model.value.map(() => nextKey());
});

function add() {
  keys.value.push(nextKey());
  ownUpdate = true;
  model.value = [...model.value, { name: "", description: "" }];
}

function remove(i: number) {
  keys.value.splice(i, 1);
  ownUpdate = true;
  const arr = [...model.value];
  arr.splice(i, 1);
  model.value = arr;
}

function update(i: number, key: "name" | "description", value: string) {
  // Spread only the changed item; unchanged items keep the same object reference
  // so Vue skips re-rendering their children (prevents sibling Tiptap editors
  // from being disturbed, which caused scroll/blur issues with sticky toolbars).
  ownUpdate = true;
  const arr = [...model.value];
  arr[i] = { ...arr[i], [key]: value };
  model.value = arr;
}
</script>
