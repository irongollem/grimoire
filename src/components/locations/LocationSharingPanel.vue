<template>
  <div class="flex flex-col gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
    <span
      class="text-label-lg font-semibold text-muted-foreground"
      >Player Sharing</span
    >

    <!-- Player summary (always shown to players who can see this location) -->
    <div class="flex flex-col gap-1">
      <label
        class="text-label text-muted-foreground"
        >Summary (always visible)</label
      >
      <AppInput
        v-model="playerSummaryModel"
        size="body"
        placeholder="A short description players always see when they discover this location…"
      />
    </div>

    <!-- Share description -->
    <label
      class="inline-flex items-center justify-between gap-3 cursor-pointer"
    >
      <span class="font-cinzel text-xs text-foreground"
        >Share full description</span
      >
      <button
        type="button"
        class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
        :class="isDescriptionShared ? 'bg-primary' : 'bg-muted-foreground/30'"
        @click="$emit('update:isDescriptionShared', !isDescriptionShared)"
      >
        <span
          class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
          :class="isDescriptionShared ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </label>

    <!-- Share linked NPCs -->
    <label
      class="inline-flex items-center justify-between gap-3 cursor-pointer"
    >
      <span class="font-cinzel text-xs text-foreground"
        >Share linked NPCs</span
      >
      <button
        type="button"
        class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
        :class="isNpcsShared ? 'bg-primary' : 'bg-muted-foreground/30'"
        @click="$emit('update:isNpcsShared', !isNpcsShared)"
      >
        <span
          class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
          :class="isNpcsShared ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </label>

    <!-- Share inventory (store / tavern / inn only) -->
    <label
      v-if="showInventoryToggle"
      class="inline-flex items-center justify-between gap-3 cursor-pointer"
    >
      <span class="font-cinzel text-xs text-foreground"
        >Share inventory with players</span
      >
      <button
        type="button"
        class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
        :class="isInventoryShared ? 'bg-primary' : 'bg-muted-foreground/30'"
        @click="$emit('update:isInventoryShared', !isInventoryShared)"
      >
        <span
          class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
          :class="isInventoryShared ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";

const {
  playerSummary,
  isDescriptionShared,
  isNpcsShared,
  isInventoryShared,
  showInventoryToggle = false,
} = defineProps<{
  playerSummary: string;
  isDescriptionShared: boolean;
  isNpcsShared: boolean;
  isInventoryShared: boolean;
  showInventoryToggle?: boolean;
}>();

const emit = defineEmits<{
  'update:playerSummary': [value: string];
  'update:isDescriptionShared': [value: boolean];
  'update:isNpcsShared': [value: boolean];
  'update:isInventoryShared': [value: boolean];
}>();

const playerSummaryModel = computed<string>({
  get: () => playerSummary,
  set: (value) => emit('update:playerSummary', value),
});
</script>
