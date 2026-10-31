<template>
  <aside
    v-if="open"
    data-slip
    data-testid="play-tools-sheet"
    class="absolute inset-y-0 right-0 z-30 flex w-[min(24rem,100%)] flex-col border-l border-border bg-popover shadow-2xl"
    aria-label="Combat tools"
  >
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <h2 class="text-heading-sm font-bold text-foreground">Combat tools</h2>
      <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Close combat tools" @click="open = false" />
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <RunnerToolsContent
        with-boss
        :encounter-id="encounterId"
        :selected-trap-id="selectedTrapId"
        @update:selected-trap-id="onPickTrap"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconClose } from "@/lib/icons";
import RunnerToolsContent from "../RunnerToolsContent.vue";

/**
 * Surprise, lair and legendary mechanics, events and traps, spawning and the DM's note: everything
 * that used to sit around the runner's list now sits behind the bar's Tools button, so the map has
 * the screen (#1125 decision 9). Picking a trap closes the sheet so its detail is what shows next.
 */
defineProps<{ encounterId: string; selectedTrapId: string | null }>();
const emit = defineEmits<{ "update:selectedTrapId": [id: string | null] }>();
const open = defineModel<boolean>("open", { required: true });

useHotkeys(
  () => [{ combo: "escape", description: "Close combat tools", hidden: true, handler: () => (open.value = false) }],
  { layer: "overlay", enabled: () => open.value },
);

function onPickTrap(id: string | null) {
  emit("update:selectedTrapId", id);
  if (id !== null) open.value = false;
}
</script>
