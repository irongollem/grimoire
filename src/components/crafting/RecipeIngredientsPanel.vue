<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">INGREDIENTS</span>
      <span class="text-caption text-muted-foreground italic">First ingredient = primary (ruined on critical fail)</span>
    </div>
    <div class="p-4 flex flex-col gap-2">
      <!-- Existing ingredients -->
      <div
        v-for="(ing, idx) in ingredients"
        :key="idx"
        class="flex items-center gap-2"
      >
        <span
          v-if="idx === 0"
          class="font-cinzel text-[0.5625rem] text-primary tracking-wider shrink-0 w-10"
          >PRIMARY</span
        >
        <span v-else class="w-10 shrink-0" />
        <span class="flex-1 text-body text-foreground truncate">
          <span v-if="ing.item_id">{{ itemById(ing.item_id)?.name ?? "Unknown item" }}</span>
          <span v-else class="italic text-muted-foreground">
            any
            <template v-if="ing.tags && ing.tags.length === 1">"{{ ing.tags[0] }}"</template>
            <template v-else-if="ing.tags">{{ ing.tags.join(" + ") }}</template>
          </span>
        </span>
        <input
          v-model.number="ing.quantity"
          type="number"
          min="1"
          class="w-16 bg-muted border border-border rounded px-2 py-1 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
        />
        <span class="text-caption text-muted-foreground">×</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive transition-colors"
          @click="emit('remove', idx)"
        >
          <IconDelete class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Add by specific item -->
      <div class="relative mt-1">
        <IconSearch
          class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
        />
        <input
          :value="itemSearch"
          placeholder="Add specific item…"
          class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="emit('update:itemSearch', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div
        v-if="itemSearch.length > 1"
        class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border"
      >
        <button
          v-for="item in filteredItems"
          :key="item.id"
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
          @click="emit('addItem', item.id)"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground flex-1 truncate">{{ item.name }}</span>
          <span class="text-caption-sm text-muted-foreground capitalize shrink-0">{{ item.item_type.replace(/_/g, " ") }}</span>
        </button>
        <p v-if="filteredItems.length === 0" class="px-3 py-2 text-caption text-muted-foreground italic">
          No items found.
        </p>
      </div>

      <!-- Add by tag -->
      <div class="flex items-center gap-2 mt-1">
        <div class="relative flex-1">
          <IconTag
            class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
          />
          <input
            :value="tagInput"
            placeholder='Add by tag(s), e.g. "meat" or "glass, container"…'
            class="w-full bg-muted border border-border rounded-md pl-9 pr-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="emit('update:tagInput', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('addTag')"
          />
        </div>
        <button
          type="button"
          :disabled="!tagInput.trim()"
          class="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-md bg-muted border border-border font-cinzel text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          @click="emit('addTag')"
        >
          <IconAdd class="h-3.5 w-3.5" />
          Add tag
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconAdd, IconDelete, IconSearch, IconTag } from "@/lib/icons";
import type { Item } from "@/types/item.types";

interface IngredientEntry {
  item_id: string | null;
  tags: string[] | null;
  quantity: number;
}

const {
  ingredients = [],
  filteredItems = [],
  itemSearch = "",
  tagInput = "",
} = defineProps<{
  ingredients?: IngredientEntry[];
  filteredItems?: Item[];
  itemSearch?: string;
  tagInput?: string;
  itemById: (id: string) => Item | undefined;
}>();

const emit = defineEmits<{
  addItem: [itemId: string];
  addTag: [];
  remove: [idx: number];
  "update:itemSearch": [value: string];
  "update:tagInput": [value: string];
}>();
</script>
