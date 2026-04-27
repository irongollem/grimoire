<template>
  <div class="flex flex-col gap-2">
    <!-- Selected chips -->
    <div v-if="modelValue.length" class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
      <span
        v-for="(tag, idx) in modelValue"
        :key="tag"
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-cinzel text-[10px] tracking-wide"
        :class="variant === 'primary'
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-muted/50 text-foreground'"
      >
        {{ tag }}
        <button
          type="button"
          class="leading-none hover:text-destructive transition-colors ml-0.5"
          @click="remove(idx)"
        >×</button>
      </span>
    </div>

    <!-- Search input -->
    <div class="relative">
      <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
      <input
        ref="inputRef"
        v-model="query"
        :placeholder="placeholder"
        class="w-full bg-muted border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @keydown.enter.prevent="onEnter"
        @keydown.escape="query = ''"
      />
    </div>

    <!-- Suggestion list -->
    <div class="rounded-md border border-border bg-card overflow-hidden">
      <!-- Filtered flat list when searching -->
      <template v-if="query.trim()">
        <div class="max-h-52 overflow-y-auto p-2 flex flex-wrap gap-1">
          <button
            v-for="item in filteredItems"
            :key="item"
            type="button"
            class="rounded-full border px-2.5 py-1 font-cinzel text-[10px] tracking-wide transition-colors"
            :class="isSelected(item)
              ? (variant === 'primary' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted text-foreground opacity-50 cursor-default')
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'"
            :disabled="isSelected(item)"
            @click="add(item)"
          >
            {{ item }}
          </button>
          <button
            v-if="canAddCustom"
            type="button"
            class="rounded-full border border-dashed border-primary/40 bg-transparent px-2.5 py-1 font-cinzel text-[10px] tracking-wide text-primary hover:bg-primary/10 transition-colors"
            @click="addCustom"
          >
            + Add "{{ query.trim() }}"
          </button>
          <p v-if="filteredItems.length === 0 && !canAddCustom" class="font-fell text-xs text-muted-foreground italic px-1 py-1">
            Already added.
          </p>
        </div>
      </template>

      <!-- Grouped full list when not searching -->
      <template v-else>
        <div class="max-h-64 overflow-y-auto">
          <div v-for="group in groups" :key="group.name" class="p-2 pb-1">
            <p class="font-cinzel text-[9px] font-semibold text-muted-foreground tracking-wider uppercase mb-1.5 px-0.5">
              {{ group.name }}
            </p>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="item in group.items"
                :key="item"
                type="button"
                class="rounded-full border px-2.5 py-1 font-cinzel text-[10px] tracking-wide transition-colors"
                :class="isSelected(item)
                  ? (variant === 'primary' ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border bg-muted text-foreground font-semibold')
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'"
                @click="toggle(item)"
              >
                <span v-if="isSelected(item)" class="mr-0.5 opacity-70">✓</span>{{ item }}
              </button>
            </div>
          </div>
        </div>
        <div class="border-t border-border px-2 py-1.5">
          <p class="font-fell text-[10px] text-muted-foreground/60 italic">
            Type above to search or add a custom entry
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search } from "lucide-vue-next";
import type { ProficiencyGroup } from "@/lib/proficiency-lists";

const props = withDefaults(defineProps<{
  modelValue: string[];
  groups: ProficiencyGroup[];
  placeholder?: string;
  variant?: "primary" | "default";
}>(), {
  placeholder: "Search…",
  variant: "default",
});

const emit = defineEmits<{ "update:modelValue": [string[]] }>();

const query = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

const allItems = computed(() => props.groups.flatMap((g) => g.items));

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return allItems.value.filter((item) => item.toLowerCase().includes(q));
});

const canAddCustom = computed(() => {
  const q = query.value.trim();
  if (!q) return false;
  const already = props.modelValue.some((v) => v.toLowerCase() === q.toLowerCase());
  const exact = allItems.value.some((v) => v.toLowerCase() === q.toLowerCase());
  return !already && !exact;
});

function isSelected(item: string) {
  return props.modelValue.includes(item);
}

function add(item: string) {
  if (!isSelected(item)) {
    emit("update:modelValue", [...props.modelValue, item]);
  }
  query.value = "";
}

function addCustom() {
  const val = query.value.trim();
  if (val && !isSelected(val)) {
    emit("update:modelValue", [...props.modelValue, val]);
  }
  query.value = "";
}

function toggle(item: string) {
  if (isSelected(item)) {
    emit("update:modelValue", props.modelValue.filter((v) => v !== item));
  } else {
    emit("update:modelValue", [...props.modelValue, item]);
  }
}

function remove(idx: number) {
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit("update:modelValue", next);
}

function onEnter() {
  // If there's exactly one filtered result, add it; otherwise add custom
  if (filteredItems.value.length === 1 && !isSelected(filteredItems.value[0])) {
    add(filteredItems.value[0]);
  } else if (canAddCustom.value) {
    addCustom();
  }
}
</script>
