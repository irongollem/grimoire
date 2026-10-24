<template>
  <button
    type="button"
    class="kin torn flex min-w-0 items-center gap-2 border border-border bg-card text-left text-foreground"
    :class="[compact ? 'px-2 py-1.5' : 'px-2.5 py-2', dimmed ? 'opacity-40' : '', dead ? 'text-muted-foreground' : '']"
    :data-dead="dead || undefined"
    :data-pc="person.isPc || undefined"
    :data-focus="focus || undefined"
    :data-married-in="marriedIn || undefined"
    :data-compact="compact || undefined"
    :aria-current="focus ? 'true' : undefined"
    :aria-label="ariaLabel"
  >
    <span
      class="grid shrink-0 place-items-center overflow-hidden bg-muted font-cinzel text-muted-foreground"
      :class="compact ? 'size-8 text-label' : 'size-10 text-body'"
      aria-hidden="true"
    >
      <img v-if="person.portraitUrl" :src="person.portraitUrl" alt="" class="size-full object-cover" loading="lazy" />
      <template v-else>{{ initial }}</template>
    </span>
    <span class="flex min-w-0 flex-col">
      <span class="kin-name truncate font-semibold" :class="[compact ? 'text-label-lg' : 'text-body', dead ? 'line-through' : '']">
        {{ person.name }}
      </span>
      <span v-if="meta" class="kin-meta truncate font-fell text-caption italic text-muted-foreground">{{ meta }}</span>
    </span>
    <span
      v-if="rank !== null"
      class="kin-rank absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-primary text-label font-semibold text-primary-foreground"
      aria-hidden="true"
    >{{ rank }}</span>
  </button>
</template>

<script setup lang="ts">
/**
 * One person on the tree (frames 04, 07b). One button: the tree reads row by row in DOM order, and Enter selects. The state lives in data attributes so
 * the ring styles below and the tests read the same facts: dead is muted with a
 * struck name, a PC wears a gilt ring, the centred person an oxblood one.
 */
import { computed } from "vue";
import { kinLifeMeta } from "@/components/kinship/kinLifeMeta";
import { useKinClock } from "@/composables/kinship/useKinClock";
import type { KinPersonView } from "@/composables/kinship/useKinGraph";

const { person, focus = false, marriedIn = false, rank = null, dimmed = false, compact = false } = defineProps<{
  person: KinPersonView;
  focus?: boolean;
  marriedIn?: boolean;
  rank?: number | null;
  dimmed?: boolean;
  compact?: boolean;
}>();

const clock = useKinClock();

const dead = computed(() => person.dead);
const initial = computed(() => person.name.trim().charAt(0).toUpperCase() || "?");

// The years when there are any to show ("1428 – 1491", "born 1462 · 33"); otherwise, as for a
// player's source, which has no dates, the subtitle rather than nothing.
const life = computed(() => kinLifeMeta(person, clock.value).join(" · ") || person.subtitle);
const meta = computed(() => [life.value, marriedIn ? "married in" : null].filter(Boolean).join(" · "));
const ariaLabel = computed(() => [person.name, person.dead ? "dead" : null, meta.value || null].filter(Boolean).join(", "));
</script>

<style scoped>
.kin {
  position: relative;
}
.kin[data-pc] {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
/* After the PC rule on purpose: the centred person's ring wins when both apply. */
.kin[data-focus] {
  outline: 2px solid var(--live-ink, var(--color-destructive));
  outline-offset: 2px;
}
</style>
