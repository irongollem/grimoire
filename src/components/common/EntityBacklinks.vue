<template>
  <div class="flex flex-col gap-2">
    <h2 :class="headingClass">Mentioned in</h2>

    <p v-if="!backlinks?.length" class="text-body text-muted-foreground italic">
      Not mentioned anywhere yet.
    </p>
    <div v-else class="flex flex-wrap gap-2">
      <RouterLink
        v-for="link in backlinks"
        :key="`${link.kind}-${link.id}`"
        :to="link.to"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 transition-colors hover:border-primary/50"
      >
        <component :is="KIND_ICONS[link.kind]" class="h-3 w-3 shrink-0 text-muted-foreground" />
        <span class="max-w-48 truncate text-caption text-foreground">{{ link.title }}</span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { RouterLink } from "vue-router";
import { IconNote, IconNavNpcs, IconNavAtlas, IconNavFactions, IconNavQuests, IconNavParty } from "@/lib/icons";
import { useEntityBacklinks, type BacklinkKind } from "@/composables/notes/useEntityBacklinks";

/**
 * "Mentioned in" — everywhere this entity is `@mentioned` across the
 * campaign (epic #932, stories 1 and 3): session notes, NPC lore fields,
 * location/faction descriptions, quest beats, and party member persona
 * fields. Always renders its section heading, with a single muted line for
 * the empty state (matching `EntityCalendarSection`'s "No dates pinned
 * yet.") rather than hiding entirely, so its presence next to sibling
 * detail sections is consistent whether or not any mention exists yet.
 *
 * The kind cue reuses the app's own nav iconography per source area
 * (`IconNavNpcs`, `IconNavAtlas` for locations, `IconNavFactions`,
 * `IconNavQuests`, `IconNavParty`) so a "Mentioned in" chip reads as the
 * same kind of thing the sidebar already taught the DM to recognise.
 * `useEntityBacklinks` sorts notes first, then by kind, then by title.
 */
const KIND_ICONS: Record<BacklinkKind, Component> = {
  note: IconNote,
  npc: IconNavNpcs,
  location: IconNavAtlas,
  faction: IconNavFactions,
  "quest-beat": IconNavQuests,
  "party-member": IconNavParty,
};

const {
  entityId,
  headingClass = "text-heading-sm font-bold text-foreground",
} = defineProps<{
  entityId: string;
  /** The heading idiom of the sections it sits among, which differs per surface; the default is the Atlas place pane's. */
  headingClass?: string;
}>();

const { data: backlinks } = useEntityBacklinks(() => entityId);
</script>
