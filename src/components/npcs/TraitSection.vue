<template>
  <div>
    <p class="text-label-lg font-semibold text-muted-foreground mb-2">
      {{ label.toUpperCase() }}
    </p>
    <div v-for="(entry, i) in model" :key="keys[i]" class="flex gap-2 mb-2 items-start">
      <div class="flex-1 space-y-1">
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
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose } from "@/lib/icons";

defineProps<{ label: string }>();

const model = defineModel<Array<{ name: string; description: string }>>({ default: () => [] });

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
