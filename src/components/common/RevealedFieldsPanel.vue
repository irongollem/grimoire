<template>
  <div
    v-if="visibleTo.length > 0"
    class="mb-4 border border-primary/20 rounded-lg px-4 py-3 bg-primary/5 space-y-3"
  >
    <p class="font-cinzel text-[10px] font-semibold tracking-widest text-muted-foreground">REVEALED FIELDS</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
      <label
        v-for="f in fields"
        :key="f.key"
        class="flex items-center gap-2 cursor-pointer"
      >
        <input
          type="checkbox"
          class="rounded border-border accent-primary"
          :checked="modelValue.includes(f.key)"
          @change="toggleField(f.key)"
        />
        <span class="font-fell text-xs text-foreground">{{ f.label }}</span>
      </label>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
export interface RevealableField {
  key: string;
  label: string;
}

const { modelValue } = defineProps<{
  modelValue: string[];
  fields: ReadonlyArray<RevealableField>;
  visibleTo: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

function toggleField(key: string) {
  const set = new Set(modelValue);
  if (set.has(key)) set.delete(key); else set.add(key);
  emit("update:modelValue", Array.from(set));
}
</script>
