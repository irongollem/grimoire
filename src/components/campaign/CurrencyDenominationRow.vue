<template>
  <div class="rounded-md border border-border bg-card p-3 space-y-2">
    <div class="grid grid-cols-[1fr_5rem] sm:grid-cols-[1fr_6rem_7rem] gap-2">
      <label class="block min-w-0">
        <span class="block text-eyebrow text-muted-foreground uppercase mb-1">Name</span>
        <AppInput v-model="name" tone="filled" size="body-xs" placeholder="Gold" />
      </label>
      <label class="block min-w-0">
        <span class="block text-eyebrow text-muted-foreground uppercase mb-1">Short</span>
        <AppInput v-model="abbr" tone="filled" size="body-xs" placeholder="gp" />
      </label>
      <label class="block min-w-0 col-span-2 sm:col-span-1">
        <span class="block text-eyebrow text-muted-foreground uppercase mb-1">Worth</span>
        <AppInput v-model.number="value" type="number" min="1" step="1" tone="filled" size="body-xs" />
      </label>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label class="flex items-center gap-2 text-caption text-muted-foreground cursor-pointer">
        <span
          class="relative h-5 w-5 rounded-full border border-border/50 overflow-hidden"
          :style="{ backgroundColor: modelValue.color }"
        >
          <input
            type="color"
            :value="modelValue.color"
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            :aria-label="`Colour of ${modelValue.name || 'this coin'}`"
            @input="(e) => patch({ color: (e.target as HTMLInputElement).value })"
          />
        </span>
        Colour
      </label>
      <AppCheckbox v-model="makesChange" size="sm" label="Used for change" />
      <AppButton
        class="ml-auto"
        variant="ghost"
        size="sm"
        tone="danger"
        :icon="IconDelete"
        label="Remove"
        collapse-label-on-mobile
        @click="emit('remove')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/** One coin of the campaign's currency, edited in place (#934). The key is not shown: it is fixed by the tab. */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconDelete } from "@/lib/icons";
import type { Denomination } from "@/lib/currency/currency";

const { modelValue } = defineProps<{ modelValue: Denomination }>();
const emit = defineEmits<{
  "update:modelValue": [value: Denomination];
  remove: [];
}>();

function patch(change: Partial<Denomination>) {
  emit("update:modelValue", { ...modelValue, ...change });
}

function field<K extends keyof Denomination>(key: K) {
  return computed<Denomination[K]>({
    get: () => modelValue[key],
    set: (v) => patch({ [key]: v }),
  });
}

const name = field("name");
const abbr = field("abbr");
const value = field("value");
const makesChange = field("makes_change");
</script>
