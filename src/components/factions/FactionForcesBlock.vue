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
    <ForceAddForm v-if="adding" :faction-id="factionId" :sort-order="forceCount" @added="adding = false" />
    <AppButton v-else variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Add a force" class="self-start" data-testid="add-a-force" @click="adding = true" />
  </section>
</template>

<script setup lang="ts">
/** The reading half of FactionForces: the forces `about` this faction, each with what it wants and where its clock stands, and an Add a force that starts one already about it (#1258 item 16). */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ForceAddForm from "@/components/canon/ForceAddForm.vue";
import { IconAdd } from "@/lib/icons";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useConnections } from "@/composables/connections/useConnections";
import { factionForces } from "./forcesAboutFaction";

const { factionId } = defineProps<{ factionId: string }>();

const { data: connections } = useConnections("faction", () => factionId);
const { data: entries } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const forceCount = computed(() => (entries.value ?? []).filter((e) => e.part === "force").length);
// Transient UI state: whether the add form is open.
const adding = ref(false);
const rows = computed(() => factionForces(connections.value ?? [], entries.value ?? [], forceData.value?.ticks ?? []));
</script>
