<template>
  <div>
    <label class="block text-label-lg font-semibold text-muted-foreground mb-1">
      DESTINATION
    </label>
    <EntityCombobox
      :model-value="linkedLocationId"
      :options="locations"
      placeholder="Pick a location…"
      @update:model-value="emit('update:linkedLocationId', $event)"
    >
      <template #option="{ opt }">
        <span class="flex-1 truncate">{{ opt.name }}</span>
        <span class="text-xs text-muted-foreground shrink-0 font-cinzel">{{ LOCATION_TYPE_LABELS[opt.location_type as LocationType] }}</span>
      </template>
    </EntityCombobox>
  </div>

  <div v-if="party.length">
    <label class="block text-label-lg font-semibold text-muted-foreground mb-1">
      TRAVELERS
      <span class="font-fell normal-case tracking-normal text-muted-foreground">(updates their current location)</span>
    </label>
    <div class="flex flex-wrap gap-2">
      <label
        v-for="m in party"
        :key="m.id"
        class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-xs font-cinzel font-semibold"
        :class="travelPartyMemberIds.includes(m.id)
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-muted text-muted-foreground hover:border-primary/50'"
      >
        <input
          type="checkbox"
          class="sr-only"
          :checked="travelPartyMemberIds.includes(m.id)"
          @change="toggleTraveler(m.id)"
        />
        {{ m.name }}
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { LOCATION_TYPE_LABELS, type LocationType } from "@/types/location.types";

interface Location {
  id: string;
  name: string;
  location_type: string;
}

interface PartyMember {
  id: string;
  name: string;
}

const {
  linkedLocationId,
  travelPartyMemberIds,
  locations,
  party,
} = defineProps<{
  linkedLocationId: string;
  travelPartyMemberIds: string[];
  locations: Location[];
  party: PartyMember[];
}>();

const emit = defineEmits<{
  "update:linkedLocationId": [value: string];
  "update:travelPartyMemberIds": [value: string[]];
}>();

function toggleTraveler(memberId: string) {
  const idx = travelPartyMemberIds.indexOf(memberId);
  const updated = idx === -1
    ? [...travelPartyMemberIds, memberId]
    : travelPartyMemberIds.filter((id) => id !== memberId);
  emit("update:travelPartyMemberIds", updated);
}
</script>
