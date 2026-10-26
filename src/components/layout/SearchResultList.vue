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
        <div
          v-for="(item, i) in group.items"
          :key="`${group.type}:${item.id}`"
          class="flex flex-wrap items-stretch"
          :class="[density === 'touch' ? 'border-b border-border/30' : '']"
        >
          <component
            :is="selectable ? 'button' : RouterLink"
            v-bind="selectable ? { type: 'button' } : { to: item.route }"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left text-body text-foreground transition-colors hover:bg-secondary/60"
            :class="[padding, density === 'touch' ? 'min-h-11' : '', { 'bg-secondary/60': offsets[g] + i === focusedIndex }]"
            @click="selectable ? emit('pick', { kind: kindOf(item, group.type), id: item.id, name: item.name }) : emit('navigate')"
            @mouseenter="emit('hover', offsets[g] + i)"
          >
            <!-- Only people and creatures have a face worth a thumbnail; the plate
                 stays when art is missing so every row's text lines up. -->
            <span
              v-if="hasThumbnail(kindOf(item, group.type))"
              class="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-label-lg text-muted-foreground"
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
              <!-- A tie reads towards the name that was asked about; a person says what they do and where. -->
              <span v-if="item.tie" class="truncate text-caption text-muted-foreground">{{ item.tie }}</span>
              <span v-else-if="item.detail" class="truncate text-caption text-muted-foreground">{{ item.detail }}</span>
              <!-- Why a meaning hit answered. Words, not a glyph or a colour, and the
                   sr-only lead-in is what a screen reader hears in place of the italics. -->
              <span v-if="item.matchedBy === 'meaning'" class="truncate text-caption italic text-muted-foreground">
                <span class="sr-only">Found by meaning: </span>{{ reason(item) }}
              </span>
            </span>
          </component>
          <SearchDrillIn
            v-if="isDrillInKind(kindOf(item, group.type))"
            :kind="kindOf(item, group.type) as DrillInKind"
            :id="item.id"
            :selectable="selectable"
            :padding="padding"
            :exclude="exclude"
            @navigate="emit('navigate')"
            @pick="emit('pick', $event)"
          />
        </div>
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
 * A location or faction row opens in place to the people it holds
 * (`SearchDrillIn`), and the "Ties" group (#1084) lists the far ends of a tie
 * the query asked for in words. In `selectable` mode, which the connection
 * picker uses, rows and drill-in people emit `pick` instead of navigating.
 *
 * With no groups it renders only the upsell row, so a host can mount it below
 * its own state messages unconditionally: the Pro nudge also belongs under an
 * empty search.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import SearchDrillIn from "@/components/layout/SearchDrillIn.vue";
import SearchProUpsellRow from "@/components/layout/SearchProUpsellRow.vue";
import { isDrillInKind, type DrillInKind } from "@/composables/connections/useConnectionDrillIn";
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
  selectable = false,
  exclude = null,
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
  /** Picker mode: a row is picked rather than followed, and emits `pick`. */
  selectable?: boolean;
  /** Picker mode: a person to leave out of the drilled-in lists. */
  exclude?: { kind: string; id: string } | null;
}>();

const emit = defineEmits<{
  navigate: [];
  dismissUpsell: [];
  hover: [index: number];
  pick: [ref: { kind: string; id: string; name: string }];
}>();

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

/** What a row stands for: its own kind (a tie's far end), else its group's. */
function kindOf(item: SearchHit, groupType: string): string {
  return item.kind ?? groupType;
}

function hasThumbnail(kind: string): boolean {
  return kind === "npc" || kind === "monster";
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** A meaning hit always explains itself; with no descriptor the words say how it was found. */
function reason(item: SearchHit): string {
  return item.descriptor ? item.descriptor : "found by meaning";
}
</script>
