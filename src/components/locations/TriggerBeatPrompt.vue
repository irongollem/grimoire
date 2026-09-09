<template>
  <div class="flex items-center gap-3 rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3">
    <IconNavigate class="h-4 w-4 shrink-0 text-ink-caution" aria-hidden="true" />
    <p class="flex-1 text-caption text-foreground">
      <span class="font-cinzel font-bold">{{ beat.title || "This beat" }}</span> is staged on this floor — advance?
    </p>
    <AppButton size="xs" variant="tinted" tone="caution" label="Advance" @click="emit('advance')" />
    <AppButton size="xs" variant="ghost" label="Dismiss" @click="emit('dismiss')" />
  </div>
</template>

<script setup lang="ts">
/**
 * Frame 07 ("Entering fires something: an encounter, a quest beat, a
 * reveal. In run mode the room list shows it as a pending prompt, never as
 * an automatic action") and frame 15's own quoted line, "'Beat 5 is staged
 * on this floor — advance?' as a prompt in Run" (#868). Pulled out of
 * `QuestSiteHandoff` so `SiteRunSurface` (the Atlas Run action) shows the
 * identical prompt rather than growing a second copy that can drift.
 *
 * Deliberately dumb: this component doesn't know which room the party is
 * in, whether a trigger zone actually names this beat, or what "advance"
 * does once clicked (resolve inline from the cockpit, or navigate there from
 * the Atlas) — every caller decides that, including the per-room dismissal
 * bookkeeping, which stays a `watch(currentRoomId, ...)` on the caller's own
 * side rather than moving in here.
 */
import AppButton from "@/components/common/AppButton.vue";
import { IconNavigate } from "@/lib/icons";

export interface TriggerBeatSummary {
  title: string | null;
}

const { beat } = defineProps<{ beat: TriggerBeatSummary }>();

const emit = defineEmits<{ advance: []; dismiss: [] }>();
</script>
