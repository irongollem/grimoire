<template>
  <section class="flex flex-col gap-2" aria-label="What it is moving" data-testid="faction-forces">
    <h3 class="m-0 text-label-lg font-semibold uppercase text-muted-foreground">What it is moving</h3>
    <ul v-if="rows.length > 0" class="flex flex-col gap-2">
      <li v-for="row in rows" :key="row.entryId" class="flex min-w-0 flex-col" data-testid="faction-force">
        <span class="flex flex-wrap items-baseline gap-x-2">
          <RouterLink :to="{ path: '/canon', query: { entry: row.entryId } }" class="text-body font-semibold text-foreground hover:underline">{{ row.title }}</RouterLink>
          <span v-if="row.status !== null" class="text-label text-muted-foreground" data-testid="faction-force-status">{{ row.status }}</span>
        </span>
        <span v-if="row.wants !== null" class="text-caption text-muted-foreground"><span class="font-bold text-foreground">Wants</span> {{ row.wants }}</span>
      </li>
    </ul>
    <RouterLink v-else to="/canon" class="self-start text-caption text-muted-foreground underline-offset-2 hover:underline" data-testid="name-a-force">Name a force</RouterLink>
  </section>
</template>

<script setup lang="ts">
/** The reading half of FactionForces: the forces `about` this faction, each with what it wants and where its clock stands. */
import { computed } from "vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useConnections } from "@/composables/connections/useConnections";
import { factionForces } from "./forcesAboutFaction";

const { factionId } = defineProps<{ factionId: string }>();

const { data: connections } = useConnections("faction", () => factionId);
const { data: entries } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const rows = computed(() => factionForces(connections.value ?? [], entries.value ?? [], forceData.value?.ticks ?? []));
</script>
