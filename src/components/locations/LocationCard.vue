<template>
  <RouterLink
    :to="`/locations/${loc.id}`"
    class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
    :class="outOfEra && 'opacity-60'"
  >
    <!-- Type colour bar -->
    <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] }" />

    <div class="p-3 flex flex-col gap-2 flex-1">
      <!-- Title row: avatar + name/parent + type badge top-right -->
      <div class="flex items-start gap-2.5">
        <div
          class="h-14 w-14 shrink-0 rounded-md overflow-hidden"
          :style="loc.image_url ? {} : { backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] }"
        >
          <FocalImage
            :src="loc.image_url"
            :alt="loc.name"
            format="portrait"
            :render-width="200"
            :focal-point="null"
            placeholder="/assets/placeholders/location.webp"
            class="w-full h-full object-cover"
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-1">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2">
              {{ loc.name || "Unnamed Location" }}
            </h3>
            <span
              class="shrink-0 px-1.5 py-0.5 rounded text-label font-bold capitalize"
              :style="{
                backgroundColor: LOCATION_TYPE_COLORS[loc.location_type] + '22',
                color: LOCATION_TYPE_COLORS[loc.location_type],
              }"
            >
              {{ LOCATION_TYPE_LABELS[loc.location_type] }}
            </span>
          </div>
          <span v-if="parentName" class="text-caption text-muted-foreground italic">
            in {{ parentName }}
          </span>
          <span v-if="outOfEra" class="flex items-center gap-1 text-caption text-muted-foreground italic">
            <IconClock class="h-3 w-3 shrink-0" />{{ eraLabel }}
          </span>
        </div>
      </div>

      <!-- Description preview -->
      <p v-if="description" class="text-caption text-muted-foreground italic line-clamp-2 flex-1">
        {{ description }}
      </p>
      <div v-else class="flex-1" />

      <!-- Tags -->
      <div v-if="loc.tags.length" class="flex flex-wrap gap-1 mt-auto">
        <span
          v-for="tag in loc.tags.slice(0, 3)"
          :key="tag"
          class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { IconClock } from "@/lib/icons";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const props = defineProps<{
  loc: Location;
  parentName: string;
  description: string;
  outOfEra: boolean;
}>();

const eraLabel = computed(() => {
  const { era_start, era_end } = props.loc;
  if (era_start && era_end) return `${era_start}–${era_end}`;
  if (era_start) return `From ${era_start}`;
  if (era_end) return `Until ${era_end}`;
  return "";
});
</script>
