<template>
  <!-- The card a room's click opens on the Map tab (#1125, frame 03): what the
       party has done here, the fight staged in it, and the way into the room
       itself. Clicking a room used to dive straight into it; now the dive is
       one deliberate button. -->
  <section
    class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2.5"
    :aria-label="`${room.name}`"
  >
    <h3 class="min-w-0 flex-1 truncate text-heading-sm font-bold text-foreground">{{ room.name }}</h3>

    <ul v-if="chips.length" class="flex flex-wrap items-center gap-1.5" aria-label="Room state">
      <li
        v-for="chip in chips"
        :key="chip.fact"
        class="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
      >
        <component :is="chip.icon" class="h-3 w-3 shrink-0" aria-hidden="true" />
        {{ chip.label }}
      </li>
    </ul>

    <div class="flex items-center gap-1.5">
      <AppButton
        v-if="stagedFight"
        variant="outline"
        size="sm"
        :icon="IconEncounter"
        label="Fight here"
        :tooltip="`Run ${stagedFight.name}`"
        :to="`/encounters/${stagedFight.id}/run`"
      />
      <AppButton variant="primary" size="sm" label="Open the room" @click="emit('open', room.id)" />
      <AppButton variant="ghost" size="icon-xs" :icon="IconClose" tooltip="Close" aria-label="Close room card" @click="emit('close')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useEncountersByLocation } from "@/composables/encounters/useEncounters";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { IconClose, IconEncounter, IconLoot, IconScan, IconShieldCheck } from "@/lib/icons";
import { LOCATION_STATE_FACT_LABELS, LOCATION_STATE_FACTS, type LocationStateFact } from "@/types/locationState.types";

const { room } = defineProps<{ room: { id: string; name: string } }>();

const emit = defineEmits<{ open: [id: string]; close: [] }>();

const ICONS: Record<LocationStateFact, Component> = {
  explored: IconScan,
  cleared: IconShieldCheck,
  looted: IconLoot,
};

const roomIds = computed(() => [room.id]);
const { stateOf } = useLocationStateForRooms(roomIds);

// Only a positive assertion draws a chip: "unknown" and an explicit false read
// the same here, as in the Rooms list.
const chips = computed(() =>
  LOCATION_STATE_FACTS.filter((fact) => stateOf(room.id, fact)?.value).map((fact) => ({
    fact,
    label: LOCATION_STATE_FACT_LABELS[fact],
    icon: ICONS[fact],
  })),
);

const { data: encounters } = useEncountersByLocation(computed(() => room.id));
/** The newest encounter staged in this room that has not been fought. */
const stagedFight = computed(() => encounters.value?.find((e) => !e.is_finished) ?? null);
</script>
