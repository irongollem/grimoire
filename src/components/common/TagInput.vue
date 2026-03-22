<template>
  <div class="flex flex-wrap items-center gap-1 min-h-9.5 bg-card border border-border rounded-md px-2 py-1">
    <span
      v-for="tag in modelValue"
      :key="tag"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] text-muted-foreground tracking-wider"
    >
      {{ tag }}
      <button type="button" class="hover:text-destructive transition-colors leading-none text-sm" @click="remove(tag)">×</button>
    </span>
    <input
      v-model="inputVal"
      :placeholder="modelValue.length ? '' : placeholder"
      class="bg-transparent border-none outline-none font-fell text-sm text-foreground placeholder:text-muted-foreground/60 min-w-24 flex-1"
      @keydown.enter.prevent="add"
      @keydown.comma.prevent="add"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(defineProps<{
  modelValue: string[];
  placeholder?: string;
}>(), {
  placeholder: "Add tag…",
});

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const inputVal = ref("");

function add() {
  const val = inputVal.value.replace(/,\s*$/, "").trim();
  if (val && !props.modelValue.includes(val)) {
    emit("update:modelValue", [...props.modelValue, val]);
  }
  inputVal.value = "";
}

function remove(tag: string) {
  emit("update:modelValue", props.modelValue.filter((t) => t !== tag));
}
</script>
