<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">Locations</h2>

    <div v-if="entries?.length" class="flex flex-col gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <IconLocation class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <RouterLink :to="`/locations/${e.location.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1 truncate">
          {{ e.location.name }}
        </RouterLink>
        <span class="font-cinzel text-2xs text-muted-foreground tracking-wider shrink-0">{{ LOCATION_TYPE_LABELS[e.location.location_type] }}</span>
        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none" @click="remove(e)">×</button>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <EntityCombobox v-model="newLocationId" :options="availableLocations" placeholder="Add location…" />
      <button
        type="button"
        :disabled="!newLocationId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="add"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconLocation } from '@/lib/icons';
import {
  useFactionLocations,
  useAddFactionLocation,
  useRemoveFactionLocation,
  type FactionLocationWithLocation,
} from "@/composables/useFactions";
import { useAllLocations } from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

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
