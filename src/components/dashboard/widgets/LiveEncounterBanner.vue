<template>
  <!-- Kept alongside the sidebar's session rail rather than folded into it: at
       barnav widths there is no sidebar, so this is the only place on the
       dashboard that says combat is live. -->
  <RouterLink
    v-if="anyRunning && firstRunning"
    :to="`/encounters/${firstRunning.encounter_id}/run`"
    class="flex items-center gap-3 rounded-lg border border-tone-success/40 bg-tone-success/10 px-4 py-3 hover:bg-tone-success/15 transition-colors"
  >
    <IconLive class="h-4 w-4 text-tone-success animate-pulse shrink-0" />
    <span class="font-cinzel text-sm font-semibold text-tone-success tracking-wide">Encounter in progress</span>
    <span class="text-caption text-tone-success/70 italic flex-1">Round {{ firstRunning.current_round }}</span>
    <span class="text-label text-tone-success">Resume →</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconLive } from "@/lib/icons";
import { useRunningEncounters } from "@/composables/encounters/useEncounterLive";

const { anyRunning, firstRunning } = useRunningEncounters();
</script>
