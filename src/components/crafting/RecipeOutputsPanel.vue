<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">OUTPUTS</span>
      <span class="text-caption text-muted-foreground italic">At least one required</span>
    </div>
    <div class="p-4 flex flex-col gap-2">
      <!-- Existing outputs -->
      <div
        v-for="(out, idx) in outputs"
        :key="idx"
        class="flex items-center gap-2"
      >
        <span class="flex-1 text-body text-foreground truncate">
          {{ itemById(out.item_id)?.name ?? "Unknown item" }}
        </span>
        <AppInput
          v-model.number="out.quantity"
          type="number"
          min="1"
          tone="filled"
          size="body-xs"
          align="center"
          :block="false"
          class="w-16"
        />
        <span class="text-caption text-muted-foreground">×</span>
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          :icon="IconDelete"
          aria-label="Remove output"
          @click="emit('remove', idx)"
        />
      </div>

      <!-- Search -->
      <div class="relative mt-1">
        <IconSearch
          class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
        />
        <AppInput
          v-model="searchModel"
          tone="filled"
          size="body"
          placeholder="Add output item…"
          class="pl-9"
        />
      </div>
      <div
        v-if="search.length > 1"
        class="max-h-40 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border"
      >
        <AppButton
          v-for="item in filteredItems"
          :key="item.id"
          variant="menu"
          size="body"
          block
          @click="emit('add', item.id)"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground flex-1 truncate">{{ item.name }}</span>
          <span class="text-caption-sm text-muted-foreground capitalize shrink-0">{{ item.item_type.replace(/_/g, " ") }}</span>
        </AppButton>
        <p v-if="filteredItems.length === 0" class="px-3 py-2 text-caption text-muted-foreground italic">
          No items found.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconDelete, IconSearch } from "@/lib/icons";
import type { Item } from "@/types/item.types";

interface OutputEntry {
  item_id: string;
  quantity: number;
}

const {
  outputs = [],
  filteredItems = [],
  search = "",
} = defineProps<{
  outputs?: OutputEntry[];
  filteredItems?: Item[];
  search?: string;
  itemById: (id: string) => Item | undefined;
}>();

const emit = defineEmits<{
  add: [itemId: string];
  remove: [idx: number];
  "update:search": [value: string];
}>();

const searchModel = computed({
  get: () => search,
  set: (value: string) => emit("update:search", value),
});
</script>
