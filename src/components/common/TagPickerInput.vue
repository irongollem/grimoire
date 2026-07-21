<template>
  <div class="flex flex-col gap-2">
    <!-- Selected chips — no height cap, flow naturally so nothing is hidden -->
    <div v-if="model.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="(tag, idx) in model"
        :key="tag"
        class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 font-cinzel text-2xs tracking-wide text-foreground"
      >
        {{ tag }}
        <button
          type="button"
          class="ml-0.5 leading-none transition-colors hover:text-destructive"
          @click="remove(idx)"
        >×</button>
      </span>
    </div>

    <!-- IconSearch input -->
    <div class="relative">
      <IconSearch class="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      <input
        ref="inputRef"
        v-model="query"
        :placeholder="placeholder"
        class="w-full rounded-md border border-border bg-muted py-1.5 pl-8 pr-3 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @focus="open = true"
        @blur="onBlur"
        @keydown.enter.prevent="onEnter"
        @keydown.escape="close"
      />
    </div>

    <!-- Suggestion panel — only shown while the input is focused -->
    <div v-if="open" class="overflow-hidden rounded-md border border-border bg-card">
      <!-- Filtered results while typing -->
      <template v-if="query.trim()">
        <div class="flex max-h-52 flex-wrap gap-1 overflow-y-auto p-2">
          <button
            v-for="item in filteredItems"
            :key="item"
            type="button"
            class="rounded-full border px-2.5 py-1 font-cinzel text-2xs tracking-wide transition-colors"
            :class="isSelected(item)
              ? 'cursor-default border-border bg-muted text-foreground opacity-50'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'"
            :disabled="isSelected(item)"
            @mousedown.prevent
            @click="add(item)"
          >
            {{ item }}
          </button>
          <button
            v-if="canAddCustom"
            type="button"
            class="rounded-full border border-dashed border-primary/40 bg-transparent px-2.5 py-1 font-cinzel text-2xs tracking-wide text-primary transition-colors hover:bg-primary/10"
            @mousedown.prevent
            @click="addCustom"
          >
            + Add "{{ query.trim() }}"
          </button>
          <p v-if="filteredItems.length === 0 && !canAddCustom" class="px-1 py-1 text-caption italic text-muted-foreground">
            Already added.
          </p>
        </div>
      </template>

      <!-- Full grouped list when search is empty -->
      <template v-else>
        <div class="max-h-64 overflow-y-auto">
          <div v-for="group in groups" :key="group.name" class="p-2 pb-1">
            <p class="mb-1.5 px-0.5 font-cinzel text-[0.5625rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {{ group.name }}
            </p>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="item in group.items"
                :key="item"
                type="button"
                class="rounded-full border px-2.5 py-1 font-cinzel text-2xs tracking-wide transition-colors"
                :class="isSelected(item)
                  ? 'border-border bg-muted font-semibold text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'"
                @mousedown.prevent
                @click="toggle(item)"
              >
                <span v-if="isSelected(item)" class="mr-0.5 opacity-70">✓</span>{{ item }}
              </button>
            </div>
          </div>
        </div>
        <div class="border-t border-border px-2 py-1.5">
          <p class="text-caption-sm italic text-muted-foreground/60">
            Type above to search or add a custom entry
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconSearch } from '@/lib/icons';
import type { ProficiencyGroup } from "@/lib/proficiency-lists";

const model = defineModel<string[]>({ required: true });
const { groups, placeholder = "IconSearch…" } = defineProps<{
  groups: ProficiencyGroup[];
  placeholder?: string;
}>();

const query = ref("");
const open = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const allItems = computed(() => groups.flatMap((g) => g.items));

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return allItems.value.filter((item) => item.toLowerCase().includes(q));
});

const canAddCustom = computed(() => {
  const q = query.value.trim();
  if (!q) return false;
  const already = model.value.some((v) => v.toLowerCase() === q.toLowerCase());
  const exact = allItems.value.some((v) => v.toLowerCase() === q.toLowerCase());
  return !already && !exact;
});

function isSelected(item: string) {
  return model.value.includes(item);
}

function add(item: string) {
  if (!isSelected(item)) model.value = [...model.value, item];
  query.value = "";
}

function addCustom() {
  const val = query.value.trim();
  if (val && !isSelected(val)) model.value = [...model.value, val];
  query.value = "";
}

function toggle(item: string) {
  model.value = isSelected(item)
    ? model.value.filter((v) => v !== item)
    : [...model.value, item];
}

function remove(idx: number) {
  const next = [...model.value];
  next.splice(idx, 1);
  model.value = next;
}

function onEnter() {
  if (filteredItems.value.length === 1 && !isSelected(filteredItems.value[0])) {
    add(filteredItems.value[0]);
  } else if (canAddCustom.value) {
    addCustom();
  }
}

function close() {
  query.value = "";
  open.value = false;
}

function onBlur() {
  // Delay so @mousedown.prevent on panel buttons fires before the blur closes the panel.
  // Without this, clicking a chip button would close the dropdown before the click registers.
  setTimeout(close, 150);
}
</script>
