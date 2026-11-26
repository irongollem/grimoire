<template>
  <section v-if="lines.length > 0 || planLine || planned.length > 0" class="flex flex-col gap-2 rounded-lg border bg-card p-3" aria-label="Tonight" data-testid="canon-next-session">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="m-0 text-heading-xs font-semibold text-foreground">Tonight</h2>
      <span v-if="dateLabel" class="text-label text-muted-foreground" data-testid="next-session-date">{{ dateLabel }}</span>
    </div>
    <p v-if="planLine" class="m-0 text-body italic text-foreground" data-testid="next-session-plan">{{ planLine }}</p>
    <p v-if="planned.length > 0" class="m-0 text-label text-muted-foreground" data-testid="next-session-pinned">{{ plural(planned.length, "thing", "things") }} pinned for it</p>
    <p v-if="lines.length > 0" class="m-0 text-label text-muted-foreground">What the canon has waiting for it:</p>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="line in lines" :key="line" class="text-body text-foreground" data-testid="next-session-line">{{ line }}</li>
    </ul>
    <AppButton to="/canon/tonight" size="sm" variant="outline" label="Open Tonight" class="self-start" />
  </section>
</template>

<script setup lang="ts">
/**
 * The card under the Canon's contents: the next session's date, when one is planned, and up to three lines of what the
 * canon has waiting for it, with the DM's plan line and how many things they pinned when there are any. It reads `useTonight`, the same gathering the Tonight page draws, so the two never disagree.
 * Absent when nothing waits (or while the reads are still loading).
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { useSessionCadence, useSessionProposals } from "@/composables/calendar/useScheduling";
import { useTonight } from "@/composables/canon/useTonight";
import { pickNextSession } from "@/lib/calendar/nextSession";

const { plan, planLine, planned } = useTonight();
const today = useLocalToday();
const { data: proposals } = useSessionProposals();
const { data: cadence } = useSessionCadence();

const next = computed(() => (proposals.value ? pickNextSession(cadence.value, proposals.value, today.value) : null));
const dateLabel = computed(() => {
  if (next.value === null) return "";
  const [y, m, d] = next.value.date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
});

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lines = computed(() => {
  if (plan.value === null) return [];
  const out: string[] = [];
  const lore = plan.value.lore.reduce((n, g) => n + g.items.length, 0);
  if (lore > 0) out.push(`${plural(lore, "lore passage", "lore passages")} to tell`);
  const clues = plan.value.clues.reduce((n, g) => n + g.items.length, 0);
  if (clues > 0) out.push(`${plural(clues, "clue", "clues")} not yet found`);
  const close = plan.value.forces.find((f) => f.clock !== null && !f.clock.full && f.clock.size - f.clock.filled === 1);
  const moving = close ?? plan.value.forces[0];
  if (moving !== undefined) out.push(close ? `${close.title} is one tick from full` : `${moving.title} is moving`);
  return out;
});
</script>
