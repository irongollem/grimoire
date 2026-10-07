<template>
  <button
    type="button"
    class="flex min-h-19 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-accent/40"
    :class="selected && 'bg-primary-fill/15 shadow-[inset_0.1875rem_0_0_var(--primary-fill)]'"
    :aria-current="selected ? 'true' : undefined"
    @click="emit('open')"
  >
    <span class="relative h-14 w-11 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
      <FocalImage
        v-if="portraitVisible && portrait"
        :src="portrait"
        :alt="displayName"
        format="portrait"
        :focal-point="focalPoint"
        :class="dead && 'grayscale opacity-60'"
      />
      <span
        v-else-if="!portraitVisible"
        class="people-unknown flex h-full w-full items-center justify-center text-heading-xs text-muted-foreground"
        aria-hidden="true"
      >?</span>
      <span v-else class="flex h-full w-full items-center justify-center text-muted-foreground/40" aria-hidden="true">
        <IconUser class="h-5 w-5" />
      </span>
    </span>

    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-2">
        <span
          class="truncate text-body font-bold text-foreground"
          :class="[nameVisible ? '' : 'people-nameless font-cinzel tracking-widest', dead && 'line-through decoration-1']"
        >{{ displayName }}</span>
        <EntityNewDot :is-new="isNew" size="sm" />
      </span>
      <span class="block truncate text-caption italic text-muted-foreground">{{ subtitle }}</span>
    </span>

    <span class="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <RelationshipMark :relationship="npc.relationship" />
      <span v-if="status" class="text-caption italic text-muted-foreground">{{ status }}</span>
      <span
        v-if="rating > 0"
        class="flex text-caption leading-none text-ink-caution"
        :aria-label="`Your rating: ${rating} of 5`"
      >
        <span v-for="n in rating" :key="n" aria-hidden="true">★</span>
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import RelationshipMark from "@/components/common/RelationshipMark.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { IconUser } from "@/lib/icons";
import {
  getNpcDisplayFocalPoint,
  getNpcDisplayName,
  getNpcDisplayPortrait,
} from "@/lib/npcDisplay";
import { statusWord } from "@/lib/npcs/peopleLedger";
import type { PlayerNpc } from "@/types/npc.types";

/**
 * One person in the player's ledger: portrait plate, name, what they are, how
 * they regard the party, and a status only when it is not "alive". The dead are
 * struck through over a greyed portrait.
 */
const {
  npc,
  rating = 0,
  isNew = false,
  selected = false,
} = defineProps<{
  npc: PlayerNpc;
  /** The player's own 1 to 5 relevance rating; 0 means unrated. */
  rating?: number;
  isNew?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{ open: [] }>();

const visible = (field: string) => npc.player_visible_fields.includes(field);
const nameVisible = computed(() => visible("name"));
const portraitVisible = computed(() => visible("portrait"));
const displayName = computed(() => (nameVisible.value ? (getNpcDisplayName(npc) ?? "???") : "???"));
const portrait = computed(() => getNpcDisplayPortrait(npc));
const focalPoint = computed(() => getNpcDisplayFocalPoint(npc));
const dead = computed(() => npc.status === "dead");
const status = computed(() => statusWord(npc.status));

const subtitle = computed(() => {
  const what = [visible("race") ? npc.race : null, visible("occupation") ? npc.occupation : null]
    .filter((part): part is string => !!part)
    .join(" · ");
  if (what) return what;
  return nameVisible.value ? "" : "Name not yet known to you";
});
</script>

<style scoped>
.people-unknown {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0 0.375rem,
    color-mix(in oklab, var(--muted-foreground) 14%, transparent) 0.375rem 0.75rem
  );
}
</style>
