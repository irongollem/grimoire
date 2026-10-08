<template>
  <div>
    <template v-if="groups.length > 0">
      <template v-for="(group, g) in groups" :key="group.type">
        <div
          class="border-b border-border/50 bg-secondary/30 py-1.5 text-eyebrow uppercase text-muted-foreground/60"
          :class="padding"
        >
          {{ group.label }}
        </div>
        <RouterLink
          v-for="(item, i) in group.items"
          :key="item.id"
          :to="item.route"
          class="flex cursor-pointer items-center gap-3 py-2 text-body text-foreground transition-colors hover:bg-secondary/60"
          :class="[padding, density === 'touch' ? 'min-h-11 border-b border-border/30' : '', { 'bg-secondary/60': offsets[g] + i === focusedIndex }]"
          @click="emit('navigate')"
          @mouseenter="emit('hover', offsets[g] + i)"
        >
          <!-- Only people and creatures have a face worth a thumbnail; the plate
               stays when art is missing so every row's text lines up. -->
          <span
            v-if="hasThumbnail(group.type)"
            class="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted font-cinzel text-label-lg text-muted-foreground"
            :class="density === 'touch' ? 'size-10' : 'size-9'"
            aria-hidden="true"
          >
            <FocalImage
              v-if="thumbnails[item.id]"
              :src="thumbnails[item.id].src"
              alt=""
              format="square"
              :focal-point="thumbnails[item.id].focalPoint"
              :render-width="200"
            />
            <template v-else>{{ initial(item.name) }}</template>
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate">{{ item.name }}</span>
            <!-- Why a meaning hit answered. Words, not a glyph or a colour, and the
                 sr-only lead-in is what a screen reader hears in place of the italics. -->
            <span v-if="item.matchedBy === 'meaning'" class="truncate text-caption italic text-muted-foreground">
              <span class="sr-only">Found by meaning: </span>{{ reason(item) }}
            </span>
          </span>
        </RouterLink>
      </template>
      <!-- Last rows, after the keyword results, so nothing above them moves when they go -->
      <div v-if="isSemanticPending" class="flex items-center gap-2 py-2 text-caption text-muted-foreground" :class="padding">
        <BannerLoader class="h-3.5" />
        Searching by meaning…
      </div>
      <div v-if="failedMessage" class="py-2 text-caption text-muted-foreground" :class="padding">
        {{ failedMessage }}
      </div>
    </template>

    <SearchProUpsellRow v-if="showProUpsell" :inset="inset" @dismiss="emit('dismissUpsell')" @navigate="emit('navigate')" />
  </div>
</template>

<script setup lang="ts">
/**
 * The result rows of the campaign search, shared by the ⌘K dropdown, the phone
 * overlay and the Jump to… card (#1031). They each hand-rendered this list and
 * drifted; now a surface keeps its frame, input and its loading, empty and
 * error states, and this owns everything from the first group header down.
 *
 * With no groups it renders only the upsell row, so a host can mount it below
 * its own state messages unconditionally: the Pro nudge also belongs under an
 * empty search.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import SearchProUpsellRow from "@/components/layout/SearchProUpsellRow.vue";
import type { SearchGroup, SearchHit, SearchThumbnails } from "@/composables/useGlobalSearch";

const {
  groups,
  thumbnails,
  isSemanticPending = false,
  failedMessage = null,
  showProUpsell = false,
  density = "compact",
  inset = "sm",
  focusedIndex = -1,
} = defineProps<{
  groups: SearchGroup[];
  thumbnails: SearchThumbnails;
  isSemanticPending?: boolean;
  failedMessage?: string | null;
  showProUpsell?: boolean;
  /** `touch` is the phone overlay: rows at least 2.75rem tall. */
  density?: "compact" | "touch";
  /** Horizontal padding, 0.75rem or 1rem, matching the host's frame. */
  inset?: "sm" | "md";
  /** Flat index of the keyboard-highlighted row across all groups (dropdown only). */
  focusedIndex?: number;
}>();

const emit = defineEmits<{ navigate: []; dismissUpsell: []; hover: [index: number] }>();

const padding = computed(() => (inset === "md" ? "px-4" : "px-3"));

/** Flat index of each group's first row: the numbering ↑/↓/Enter walk in `GlobalSearch`. */
const offsets = computed(() => {
  let total = 0;
  return groups.map((group) => {
    const start = total;
    total += group.items.length;
    return start;
  });
});

function hasThumbnail(type: string): boolean {
  return type === "npc" || type === "monster";
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** A meaning hit always explains itself; with no descriptor the words say how it was found. */
function reason(item: SearchHit): string {
  return item.descriptor ? item.descriptor : "found by meaning";
}
</script>
