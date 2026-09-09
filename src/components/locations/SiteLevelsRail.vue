<template>
  <div class="flex w-full flex-col gap-1.5 lg:w-40 lg:shrink-0" role="list" aria-label="Levels">
    <h3 class="font-cinzel text-label-lg font-semibold tracking-wide text-muted-foreground">Levels</h3>
    <AppButton
      v-for="(level, i) in levels"
      :key="level.id"
      variant="ghost"
      size="sm"
      block
      role="listitem"
      :active="level.id === activeId"
      :aria-current="level.id === activeId ? 'true' : undefined"
      class="min-w-0 justify-start gap-2 rounded-md border border-transparent px-2 py-1.5"
      :class="level.id === activeId ? 'border-primary/60 bg-primary/10' : 'hover:border-primary/40'"
      @click="$emit('select', level.id)"
    >
      <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        <img v-if="level.mapUrl" :src="level.mapUrl" alt="" class="h-full w-full object-cover" />
        <IconMap v-else class="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-left font-cinzel text-xs font-semibold text-foreground">{{ i + 1 }} · {{ level.name }}</p>
        <p class="truncate text-left text-caption-sm text-muted-foreground">{{ subtitle(level) }}</p>
      </div>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
/**
 * The levels rail (#868, frame 06): "not a new table — it lists this site's
 * children that are themselves sites, ordered by `sort_order`." Purely
 * presentational; `AtlasPlacePane` decides WHICH site's children to show
 * (this site's own, when it has any; otherwise its parent's, marking this
 * one active) because that decision needs the Atlas index, which this
 * component has no business holding.
 */
import AppButton from "@/components/common/AppButton.vue";
import { IconMap } from "@/lib/icons";

export interface SiteLevelSummary {
  id: string;
  name: string;
  mapUrl: string | null;
  roomCount: number;
  clearedCount: number;
  exploredCount: number;
}

const { levels } = defineProps<{
  /** Already in display order (`compareSiblings`). */
  levels: SiteLevelSummary[];
  activeId: string | null;
}>();

defineEmits<{ select: [id: string] }>();

function subtitle(level: SiteLevelSummary): string {
  if (!level.mapUrl) return "No map yet";
  if (!level.roomCount) return "No rooms yet";
  if (level.clearedCount > 0) return `${level.roomCount} rooms · cleared ${level.clearedCount}`;
  if (level.exploredCount === 0) return `${level.roomCount} rooms · unexplored`;
  return `${level.roomCount} rooms`;
}
</script>
