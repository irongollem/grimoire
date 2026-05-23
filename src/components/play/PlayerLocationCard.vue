<template>
  <div
    class="rounded-lg border bg-card overflow-hidden"
    :class="isFavourite ? 'border-amber-400/40' : 'border-border'"
    :style="depth ? { marginLeft: `${depth * 16}px` } : undefined"
  >
    <!-- Header row -->
    <div class="w-full flex items-stretch">
      <!-- Main bar: toggle children when present, otherwise open details (favourites are flat). -->
      <button
        type="button"
        class="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left min-w-0"
        @click="onMainClick"
      >
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :style="{ backgroundColor: locColor }"
        />
        <EntityNewDot :is-new="isNew" title="New" />
        <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ loc.name }}</span>
        <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider shrink-0">
          {{ locLabel }}
        </span>
        <IconChevronDown
          v-if="hasChildren"
          class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0"
          :class="childrenOpen ? 'rotate-180' : ''"
        />
      </button>

      <!-- Star: toggle favourite (style differs in fav section vs. main list) -->
      <button
        type="button"
        class="shrink-0 flex items-center gap-1.5 px-3 hover:bg-muted/30 transition-colors border-l border-border"
        :class="isFavourite ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground hover:text-amber-400'"
        :title="isFavourite ? 'Remove from favourites' : 'Add to favourites'"
        @click.stop="$emit('toggle-favourite', loc.id)"
      >
        <IconStar class="h-3.5 w-3.5 shrink-0" :class="isFavourite ? 'fill-current' : ''" />
      </button>

      <!-- Details toggle -->
      <button
        type="button"
        class="shrink-0 flex items-center gap-1.5 px-3 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-l border-border"
        :class="detailOpen ? 'text-foreground' : ''"
        :title="detailOpen ? 'Hide details' : 'Show details'"
        @click="$emit('toggle-detail', loc.id)"
      >
        <IconReveal class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden sm:inline font-cinzel text-2xs md:text-sm tracking-wider">Details</span>
      </button>
    </div>

    <!-- Detail panel (rendered by parent via slot to keep expand state there) -->
    <slot name="detail" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconChevronDown, IconReveal, IconStar } from '@/lib/icons';
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { LOCATION_TYPE_COLORS, LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { loc, isNew = false, isFavourite = false, hasChildren = false, childrenOpen = false, detailOpen = false, depth = 0 } = defineProps<{
  loc: Location;
  isNew?: boolean;
  isFavourite?: boolean;
  hasChildren?: boolean;
  childrenOpen?: boolean;
  detailOpen?: boolean;
  depth?: number;
}>();

const emit = defineEmits<{
  'toggle-children': [id: string];
  'toggle-favourite': [id: string];
  'toggle-detail': [id: string];
}>();

const locColor = computed(() => LOCATION_TYPE_COLORS[loc.location_type]);
const locLabel = computed(() => LOCATION_TYPE_LABELS[loc.location_type]);

function onMainClick() {
  if (hasChildren) emit('toggle-children', loc.id);
  else emit('toggle-detail', loc.id);
}
</script>
