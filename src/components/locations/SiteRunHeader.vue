<template>
  <header class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
    <div class="min-w-0 flex-1">
      <h1 class="truncate font-cinzel text-base font-bold text-foreground">{{ siteName }}</h1>
      <p class="text-caption text-muted-foreground">Running<template v-if="questTitle"> · {{ questTitle }}</template></p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="partyRoomName"
        class="inline-flex items-center gap-1.5 rounded bg-tone-info/15 px-2 py-1 text-label uppercase text-ink-info"
      >
        <span class="relative flex h-1.5 w-1.5">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-tone-info opacity-75" />
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-tone-info" />
        </span>
        Party in {{ partyRoomName }}
      </span>
      <AppButton v-if="backToBeat" variant="subtle" size="sm" :icon="IconQuest" label="Back to the beat" :to="backToBeat" />
      <AppButton variant="ghost" size="sm" :icon="IconClose" label="Stop Running" @click="emit('stop')" />
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * Frame 08's header — the site's own name, the "Running" caption, the party's
 * pulsing chip, and the two ways to leave: to the beat that opened this room
 * (when one is staged here), or out of run mode entirely.
 *
 * `questTitle` and `backToBeat` are handed down already resolved rather than
 * derived here — `SiteRunSurface` already knows which staged beat (if any) is
 * current, and this header has no business re-deriving that itself. The
 * frame's own example names a beat position ("beat 4 of...") and a session
 * number ("session 12"); both are omitted here rather than guessed — beat
 * position needs the full graph walk `story_order` does server-side for
 * players only, and there is no session-number column at all
 * (`campaign_session_state` only knows running/not-running) — see
 * `SiteRunSurface`'s own comment on the same choice.
 *
 * The pulsing dot is the same idiom `QuestRunBeatCard` and `QuestSiteHandoff`
 * already use for "party is here" — small enough (four lines of Tailwind)
 * that lifting it into its own component would trade three call sites for
 * one prop-only wrapper, not remove a duplicated recipe.
 */
import AppButton from "@/components/common/AppButton.vue";
import { IconClose, IconQuest } from "@/lib/icons";
import type { RouteLocationRaw } from "vue-router";

defineProps<{
  siteName: string;
  questTitle: string | null;
  partyRoomName: string | null;
  backToBeat: RouteLocationRaw | null;
}>();
const emit = defineEmits<{ stop: [] }>();
</script>
