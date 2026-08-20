<template>
  <div
    class="rounded-lg border bg-card overflow-hidden"
    :class="[isFavourite ? 'border-amber-400/40' : 'border-border', outOfEra && 'opacity-60']"
    :style="depth ? { marginLeft: `${depth * 16}px` } : undefined"
  >
    <!-- Header row -->
    <div class="w-full flex items-stretch">
      <!-- Main bar: toggle children when present, otherwise open details (favourites are flat). -->
      <AppButton
        variant="menu"
        size="lg"
        class="flex-1 min-w-0"
        @click="onMainClick"
      >
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :style="{ backgroundColor: locColor }"
        />
        <EntityNewDot :is-new="isNew" title="New" />
        <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ loc.name }}</span>
        <span class="text-label md:text-sm text-muted-foreground shrink-0">
          {{ locLabel }}
        </span>
        <IconChevronDown
          v-if="hasChildren"
          class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 shrink-0"
          :class="childrenOpen ? 'rotate-180' : ''"
        />
      </AppButton>

      <!-- Star: toggle favourite (style differs in fav section vs. main list) -->
      <!--
        The selected state is the glyph's colour, not a box. `:active` would be
        the obvious prop and is deliberately not used: it paints a background
        tint, and a favourite star never had one — a chip appearing behind the
        star is a different control. AppButton has no "selected without a box"
        state (15 sites across the app want one), so the state colour is the one
        token this call site overrides, which is the sanctioned case; the box
        itself still comes entirely from the primitive.
      -->
      <AppButton
        variant="ghost"
        fill="muted"
        size="sm"
        class="shrink-0 border-l border-border"
        :class="isFavourite ? 'text-amber-400 hover:text-amber-300' : 'hover:text-amber-400'"
        :tooltip="isFavourite ? 'Remove from favourites' : 'Add to favourites'"
        @click.stop="$emit('toggle-favourite', loc.id)"
      >
        <template #icon>
          <IconStar class="h-3.5 w-3.5 shrink-0" :class="isFavourite ? 'fill-current' : ''" />
        </template>
      </AppButton>

      <!-- Details toggle -->
      <AppButton
        variant="ghost"
        fill="muted"
        size="sm"
        :icon="IconReveal"
        :class="['shrink-0 border-l border-border', detailOpen ? 'text-foreground' : '']"
        :tooltip="detailOpen ? 'Hide details' : 'Show details'"
        @click="$emit('toggle-detail', loc.id)"
      >
        <span class="hidden sm:inline text-label md:text-sm">Details</span>
      </AppButton>
    </div>

    <!-- Detail panel (rendered by parent via slot to keep expand state there) -->
    <slot name="detail" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconChevronDown, IconReveal, IconStar } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import { LOCATION_TYPE_COLORS, LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { loc, isNew = false, isFavourite = false, hasChildren = false, childrenOpen = false, detailOpen = false, depth = 0, outOfEra = false } = defineProps<{
  loc: Location;
  isNew?: boolean;
  isFavourite?: boolean;
  hasChildren?: boolean;
  childrenOpen?: boolean;
  detailOpen?: boolean;
  depth?: number;
  outOfEra?: boolean;
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
