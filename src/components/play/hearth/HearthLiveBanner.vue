<template>
  <section class="hearth-band torn" aria-label="Session in progress">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div class="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <p class="hearth-eyebrow flex items-center gap-2">
          <span class="hearth-live-dot" aria-hidden="true" />
          Live now
        </p>
        <p class="hearth-title truncate">{{ title }}</p>
        <p class="text-caption opacity-85">{{ since }}</p>
      </div>
      <div v-if="turn" class="flex flex-wrap items-center gap-x-3 gap-y-2" role="status">
        <div class="flex flex-col">
          <span v-if="turn.round > 0" class="hearth-eyebrow">Round {{ turn.round }}</span>
          <span class="text-body font-semibold">{{ turn.text }}</span>
        </div>
        <AppButton variant="primary" size="md" :to="{ name: 'player-encounter' }" label="Join the fight" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useIntervalFn, useNow } from "@vueuse/core";
import AppButton from "@/components/common/AppButton.vue";
import { formatSessionElapsed } from "@/composables/campaign/useCampaignSession";
import { useSessionProposals } from "@/composables/calendar/useScheduling";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { useNeedsInitiativeRoll } from "@/composables/encounters/useNeedsInitiativeRoll";
import { liveState } from "@/composables/encounters/useEncounterLive";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { todaysScheduledSession } from "@/lib/sessions/sessionPrefill";
import { combatTurnLine } from "@/lib/hearth/turnLine";

/**
 * The oxblood band across the top of the table layout: the session is running,
 * for how long, and where the player stands in combat. It words the session the
 * way the layout's own live chip does ("Running for 1:47" / "The table is
 * sitting"), and names it by its number and title, or by the confirmed proposal dated today. Joining the
 * fight is the one action: the encounter has its own page.
 */
const { startedAt, memberId, number, title: sessionTitle } = defineProps<{
  startedAt: string | null;
  memberId: string | null;
  /** The session's own number and title, when the DM gave it either. */
  number: number | null;
  title: string | null;
}>();

// Read the shared state, never subscribe again: the channel is module-level and
// PlayerLayout keeps it open, so a second subscriber's unmount (this banner
// leaves when the session ends) would close the layout's channel with it.

// Minute resolution is all an "H:MM" clock needs.
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60_000) });
const since = computed(() => {
  const elapsed = formatSessionElapsed(startedAt, now.value.getTime());
  return elapsed ? `Running for ${elapsed}` : "The table is sitting";
});

const { data: proposals } = useSessionProposals();
const today = useLocalToday();
// The session's own name wins; an unnamed one falls back to today's confirmed
// proposal, then to the plain fact.
const title = computed(() => {
  if (number !== null || sessionTitle) return sessionLabel({ number, title: sessionTitle });
  return todaysScheduledSession(proposals.value ?? [], today.value)?.title ?? "The session is underway";
});

const needsRoll = useNeedsInitiativeRoll(() => liveState.value?.combatants_live, () => memberId);
const turn = computed(() => {
  const line = combatTurnLine(liveState.value, memberId);
  if (!line) return null;
  const text = {
    lobby: needsRoll.value ? "Roll for initiative" : "Combat is about to begin",
    "your-turn": "It's your turn",
    "up-next": "You're up next",
    waiting: line.afterName ? `You're up after ${line.afterName}` : "Waiting for your turn",
  }[line.status];
  return { round: line.round, text };
});
</script>

<style scoped>
/* Oxblood fill with the classic themes' gilt as fallback, and the foreground
   that goes with each. */
.hearth-band {
  padding: 0.875rem 1rem;
  border-radius: var(--radius-lg, 0.5rem);
  background: var(--live, var(--primary));
  color: var(--live-foreground, var(--primary-foreground));
  box-shadow: inset 0 0 0 1px var(--live-edge, transparent), 0 1px 0 rgb(43 32 25 / 0.2);
}

/* In Vellum the band is torn paper like every other panel: the torn layer
   (vellum.css) paints the oxblood, so the box itself steps aside. Not
   :global(): Vue compiles `:global(x) .y` to the bare `x`, which would set
   --torn-fill on :root and paint every torn card oxblood. */
:root[data-theme^="vellum"] .hearth-band {
  --torn-fill: var(--live);
  --torn-edge: var(--live-edge);
  background: transparent;
  box-shadow: none;
}

.hearth-eyebrow {
  font-family: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.9;
}

.hearth-title {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.2;
}

/* Still, not pulsing: Vellum's rule is that nothing scales, pulses or glows. */
.hearth-live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: currentColor;
}
</style>
