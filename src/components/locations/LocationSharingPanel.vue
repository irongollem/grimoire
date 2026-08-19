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
      <ToggleSwitch
        :model-value="isDescriptionShared"
        aria-label="Share full description"
        @update:model-value="$emit('update:isDescriptionShared', $event)"
      />
    </label>

    <!-- Share linked NPCs -->
    <label
      class="inline-flex items-center justify-between gap-3 cursor-pointer"
    >
      <span class="font-cinzel text-xs text-foreground"
        >Share linked NPCs</span
      >
      <ToggleSwitch
        :model-value="isNpcsShared"
        aria-label="Share linked NPCs"
        @update:model-value="$emit('update:isNpcsShared', $event)"
      />
    </label>

    <!-- Share inventory (store / tavern / inn only) -->
    <label
      v-if="showInventoryToggle"
      class="inline-flex items-center justify-between gap-3 cursor-pointer"
    >
      <span class="font-cinzel text-xs text-foreground"
        >Share inventory with players</span
      >
      <ToggleSwitch
        :model-value="isInventoryShared"
        aria-label="Share inventory with players"
        @update:model-value="$emit('update:isInventoryShared', $event)"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";

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
