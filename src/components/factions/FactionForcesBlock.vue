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
    <CanonAddRow v-if="adding" placeholder="What it is doing, the summoning, the long march…" input-label="A new force" label="Add force" :create="addForce" />
    <AppButton v-else variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Add a force" class="self-start" data-testid="add-a-force" @click="adding = true" />
  </section>
</template>

<script setup lang="ts">
/** The reading half of FactionForces: the forces `about` this faction, each with what it wants and where its clock stands, and an Add a force that starts one already about it (#1258 item 16). */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonAddRow from "@/components/canon/CanonAddRow.vue";
import { IconAdd } from "@/lib/icons";
import { useCanonEntries, useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useConnections, useCreateConnection } from "@/composables/connections/useConnections";
import { useAllFactions } from "@/composables/factions/useFactions";
import { toast } from "@/lib/toast";
import { typeChoices } from "@/lib/worldLinks/connections";
import { factionForces } from "./forcesAboutFaction";

const { factionId } = defineProps<{ factionId: string }>();

const { data: connections } = useConnections("faction", () => factionId);
const { data: entries } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const forceCount = computed(() => (entries.value ?? []).filter((e) => e.part === "force").length);
// Transient UI state: whether the add form is open.
const adding = ref(false);
const { data: factions } = useAllFactions();
const { mutateAsync: createForce } = useCreateCanonEntry();
const { mutateAsync: connect } = useCreateConnection();

/** Makes the force and ties it `about` this faction; the title is the plan, never a copy of the faction's name. */
async function addForce(title: string) {
  const faction = factions.value?.find((row) => row.id === factionId);
  const choice = typeChoices("canon", "faction").find((entry) => entry.key === "about" && entry.subjectIsFrom);
  if (!faction || !choice) throw new Error("A force cannot be linked to a faction.");
  const created = await createForce({ part: "force", title, sort_order: forceCount.value });
  try {
    await connect({ subject: { kind: "canon", id: created.id }, other: { kind: "faction", id: faction.id, name: faction.name }, choice });
  } catch (error) {
    toast.error(`Force saved, but the faction could not be linked. ${toast.fromError(error)}`);
  }
  adding.value = false;
}
const rows = computed(() => factionForces(connections.value ?? [], entries.value ?? [], forceData.value?.ticks ?? []));
</script>
