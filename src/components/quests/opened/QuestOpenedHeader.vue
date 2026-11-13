<template>
  <header class="flex flex-wrap items-center gap-x-3 gap-y-2 max-md:hidden">
    <AppButton :icon="IconChevronLeft" label="Flow" size="xs" variant="subtle" @click="emit('collapse')" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-label uppercase text-muted-foreground">{{ eyebrow }}</p>
      <h2 class="flex flex-wrap items-center gap-2 text-heading font-bold text-foreground">
        <span class="min-w-0 truncate">{{ title || "Untitled beat" }}</span>
        <span
          v-if="partyHere"
          class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-label uppercase"
          :class="[tone.bg, tone.text]"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full" :class="tone.dot" />
          Party is here
        </span>
      </h2>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <template v-if="site">
        <AppButton
          :icon="IconImages"
          :label="site.mapShared ? 'Hide map from players' : 'Show map to players'"
          size="sm"
          variant="subtle"
          :loading="site.toggling"
          @click="emit('toggle-map')"
        />
        <AppButton v-if="site.entered" label="Leave site" size="sm" variant="subtle" @click="emit('leave-site')" />
        <AppButton v-else label="Enter site" :icon="IconDoor" size="sm" variant="subtle" @click="emit('enter-site')" />
      </template>
      <QuestOpenedActions :party-here="partyHere" :can-advance="canAdvance" :busy="busy" @undo="emit('undo')" @advance="emit('advance')" @put-here="emit('put-here')" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { IconChevronLeft, IconDoor, IconImages } from "@/lib/icons";
import type { ThreadTone } from "@/lib/quests/threads";
import AppButton from "@/components/common/controls/AppButton.vue";
import QuestOpenedActions from "./QuestOpenedActions.vue";

/**
 * The opened beat's header row (#1183, frame 04): collapse back to the flow,
 * the eyebrow, the title, who stands here, then the moves. The site's "Show map
 * to players" and "Leave site" sit here rather than in the site's own panel.
 * Below md the title is the phone top bar's and the moves are the bottom bar's.
 */
defineProps<{
  eyebrow: string;
  title: string;
  partyHere: boolean;
  tone: ThreadTone;
  canAdvance: boolean;
  busy: boolean;
  /** Present when the beat is staged at a site with rooms. */
  site: { mapShared: boolean; toggling: boolean; entered: boolean } | null;
}>();
const emit = defineEmits<{
  collapse: [];
  undo: [];
  advance: [];
  "put-here": [];
  "toggle-map": [];
  "leave-site": [];
  "enter-site": [];
}>();
</script>
