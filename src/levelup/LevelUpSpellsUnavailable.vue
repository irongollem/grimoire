<template>
  <div class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-1">
    <p class="text-body font-semibold text-foreground">No spells available to choose from</p>
    <p class="text-body text-muted-foreground">
      This level needs {{ requirement }}, but no spell library is available here.
      Ask your DM to enable a spell source for this campaign (Reliquary → Sources),
      then reopen this page.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Shown when a level-up requires spell or cantrip choices the library cannot
 * supply — an empty campaign source list, or a campaign whose enabled sources
 * carry no spells for its ruleset (a 2024 campaign with only srd-2014 enabled
 * is the live example). `apply_level_up` rejects a short submission, so Confirm
 * genuinely cannot enable; without this the player is left clicking a dead
 * button with no explanation (#736).
 */
import { computed } from "vue";

const { spellsNeeded, cantripsNeeded } = defineProps<{
  spellsNeeded: number;
  cantripsNeeded: number;
}>();

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const requirement = computed(() =>
  [
    spellsNeeded > 0 ? plural(spellsNeeded, "spell") : "",
    cantripsNeeded > 0 ? plural(cantripsNeeded, "cantrip") : "",
  ]
    .filter(Boolean)
    .join(" and "),
);
</script>
