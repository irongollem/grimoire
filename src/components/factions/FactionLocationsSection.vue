<template>
  <EntityLinkSection
    v-model="newLocationId"
    :entries="entries ?? []"
    :options="availableLocations"
    heading="Locations"
    placeholder="Add location…"
    :adding="adding"
    remove-label="location"
    @add="add"
    @remove="remove"
  >
    <template #entry="{ entry }">
      <IconLocation class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <RouterLink :to="`/locations/${entry.location.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1 truncate">
        {{ entry.location.name }}
      </RouterLink>
      <span class="text-label text-muted-foreground shrink-0">{{ LOCATION_TYPE_LABELS[entry.location.location_type] }}</span>
    </template>
  </EntityLinkSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconLocation } from '@/lib/icons';
import {
  useFactionLocations,
  useAddFactionLocation,
  useRemoveFactionLocation,
  type FactionLocationWithLocation,
} from "@/composables/factions/useFactions";
import { useAllLocations } from "@/composables/locations/useLocations";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import EntityLinkSection from "@/components/common/EntityLinkSection.vue";

const props = defineProps<{ factionId: string }>();

const { data: entries }     = useFactionLocations(props.factionId);
const { data: allLocations } = useAllLocations();
const addMut    = useAddFactionLocation();
const removeMut = useRemoveFactionLocation();

const linkedIds = computed(() => new Set((entries.value ?? []).map((e) => e.location_id)));
const availableLocations = computed(() =>
  (allLocations.value ?? []).filter((l) => !linkedIds.value.has(l.id)),
);

const newLocationId = ref("");
const adding        = ref(false);

async function add() {
  if (!newLocationId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: props.factionId, location_id: newLocationId.value });
    newLocationId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(e: FactionLocationWithLocation) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id });
}
</script>
