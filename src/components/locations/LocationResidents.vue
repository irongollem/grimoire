<template>
  <!-- NPCs at this location -->
  <template v-if="locationNpcs?.length">
    <div class="flex items-center justify-between mt-2">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
        People in the Area
        <span class="font-fell font-normal text-muted-foreground"
          >({{ locationNpcs.length }})</span
        >
      </h2>
      <button
        v-if="locationNpcs.length > 3"
        type="button"
        class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors tracking-wider"
        @click="npcsExpanded = !npcsExpanded"
      >
        {{ npcsExpanded ? "Show less" : `Show all ${locationNpcs.length}` }}
      </button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <RouterLink
        v-for="npc in npcsExpanded ? locationNpcs : locationNpcs.slice(0, 3)"
        :key="npc.id"
        :to="`/npcs/${npc.id}`"
        class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
      >
        <div class="flex-1 min-w-0">
          <p
            class="font-cinzel text-sm font-semibold text-foreground truncate"
          >
            {{ npc.name }}
          </p>
          <p
            v-if="npc.occupation || npc.race"
            class="font-fell text-xs text-muted-foreground italic truncate"
          >
            {{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
          </p>
          <p
            v-if="npc.location_id && npc.location_id !== locationId"
            class="font-cinzel text-[10px] text-muted-foreground/60 tracking-wide truncate mt-0.5"
          >
            {{ allLocationsMap.get(npc.location_id)?.name ?? "" }}
          </p>
        </div>
        <IconChevronRight
          class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
        />
      </RouterLink>
    </div>
  </template>

  <!-- Encounters at this location -->
  <template v-if="locationEncounters?.length">
    <div class="flex items-center justify-between mt-2">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
        Encounters Here
        <span class="font-fell font-normal text-muted-foreground"
          >({{ locationEncounters.length }})</span
        >
      </h2>
    </div>
    <div class="flex flex-col gap-2">
      <RouterLink
        v-for="enc in locationEncounters"
        :key="enc.id"
        :to="`/encounters/${enc.id}`"
        class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
      >
        <span
          class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate"
          >{{ enc.name }}</span
        >
        <span
          v-if="enc.is_finished"
          class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
          >Done</span
        >
        <IconChevronRight
          class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
        />
      </RouterLink>
    </div>
  </template>

  <!-- Party members currently here -->
  <div class="flex items-center justify-between mt-2">
    <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
      Currently Here
      <span
        v-if="membersHere.length"
        class="font-fell font-normal text-muted-foreground"
        >({{ membersHere.length }})</span
      >
    </h2>
  </div>

  <div v-if="membersHere.length" class="flex flex-wrap gap-2">
    <div
      v-for="m in membersHere"
      :key="m.id"
      class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
    >
      <RouterLink
        :to="`/party/${m.id}`"
        class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors"
      >
        {{ m.name }}
      </RouterLink>
      <span
        v-if="m.class"
        class="font-fell text-[10px] text-muted-foreground italic"
        >{{ m.class }}</span
      >
      <button
        type="button"
        class="text-muted-foreground hover:text-destructive transition-colors text-sm leading-none ml-1"
        title="Remove from this location"
        @click="removeMember(m.id)"
      >
        ×
      </button>
    </div>
  </div>
  <p v-else class="font-fell text-xs text-muted-foreground italic">
    No party members currently here.
  </p>

  <!-- Add member to location -->
  <div class="flex items-center gap-2">
    <EntityCombobox
      v-model="newResidentId"
      :options="availableMembers"
      placeholder="Move a party member here…"
    />
    <button
      type="button"
      :disabled="!newResidentId || movingMember"
      class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
      @click="addMember"
    >
      Move here
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IconChevronRight } from '@/lib/icons';
import EntityCombobox from '@/components/common/EntityCombobox.vue';
import { useParty, useUpdatePartyMember } from '@/composables/useParty';
import { useNpcsByLocations } from '@/composables/useNpcs';
import { useEncountersByLocation } from '@/composables/useEncounters';
import type { Location } from '@/types/location.types';

const { locationId, npcLocationIds, allLocations } = defineProps<{
  locationId: string;
  /** flat list of location id + all descendant ids — for NPC query */
  npcLocationIds: string[];
  allLocations: Location[];
}>();

// ── NPC data ──────────────────────────────────────────────────────────────────
const { data: locationNpcs } = useNpcsByLocations(computed(() => npcLocationIds));
const { data: locationEncounters } = useEncountersByLocation(locationId);

const allLocationsMap = computed<Map<string, Location>>(() => {
  const m = new Map<string, Location>();
  for (const l of allLocations) m.set(l.id, l);
  return m;
});

const npcsExpanded = ref(false);

// ── Party members ─────────────────────────────────────────────────────────────
const { data: allPartyMembers } = useParty();
const { mutateAsync: updatePartyMember, isPending: movingMember } = useUpdatePartyMember();

const membersHere = computed(() =>
  (allPartyMembers.value ?? []).filter((m) => m.current_location_id === locationId),
);

const availableMembers = computed(() =>
  (allPartyMembers.value ?? []).filter((m) => m.current_location_id !== locationId),
);

const newResidentId = ref('');

async function addMember() {
  if (!newResidentId.value) return;
  await updatePartyMember({
    id: newResidentId.value,
    update: { current_location_id: locationId },
  });
  newResidentId.value = '';
}

async function removeMember(memberId: string) {
  await updatePartyMember({ id: memberId, update: { current_location_id: null } });
}
</script>
