<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="explore-room-card">
    <template v-if="room">
      <header class="flex flex-col gap-1">
        <p class="text-eyebrow uppercase text-muted-foreground">{{ entering ? "The room ahead" : "The party is here" }}</p>
        <h2 class="text-heading font-bold text-foreground">{{ room.name }}</h2>
      </header>

      <SiteRunRoomStack
        compact
        :site-id="siteId"
        :room="room"
        :regions="regions"
        :doors="doors"
        :door-state="doorState"
        :loot="loot"
        :campaign-id="campaignId"
      />

      <LocationStateControls :location-id="room.id" />

      <section v-if="waiting.length" class="flex flex-col gap-2" aria-label="Waiting here">
        <h3 class="text-eyebrow uppercase text-muted-foreground">Waiting here</h3>
        <div v-for="fight in waiting" :key="fight.id" class="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <span class="min-w-0 flex-1 truncate text-label-lg font-semibold text-foreground">{{ fight.name }}</span>
          <AppButton variant="live" size="sm" :icon="IconEncounter" label="Fight here" :to="`/encounters/${fight.id}/run`" />
        </div>
      </section>

      <SiteRunBeatCard v-if="beat" :beat="beat" />

      <SiteRunWaysOut :site-id="siteId" :room-id="room.id" :room-name="room.name" :doors="doors" :door-state="doorState" />
    </template>
    <p v-else class="text-body text-muted-foreground">The party is not in a room of this site yet. Walk them into one on the map, or pick it in the list.</p>

    <p class="mt-auto text-caption text-muted-foreground">
      A fight starts on this same screen: initiative slides in on the left and the room card becomes the turn card.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import LocationStateControls from "@/components/locations/place/LocationStateControls.vue";
import SiteRunBeatCard from "@/components/locations/run/SiteRunBeatCard.vue";
import SiteRunRoomStack from "@/components/locations/run/SiteRunRoomStack.vue";
import SiteRunWaysOut from "@/components/locations/run/SiteRunWaysOut.vue";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import { useEncountersByLocation } from "@/composables/encounters/useEncounters";
import { IconEncounter } from "@/lib/icons";
import type { Location } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { DoorStateFact, LocationState } from "@/types/locationState.types";
import type { StagedQuestBeat } from "@/composables/quests/useBeatsStagedAt";
import type { LootPlacement } from "@/types/quest.types";

/**
 * The right column of exploring (#1125 frame 09): the room the party is stepping into, or the one it stands in.
 * Everything in it is a piece the old site runner already had (read-aloud, state, ways out, the staged beat);
 * what is new is "Waiting here", the fights staged in the room, one click from starting.
 */
const { room } = defineProps<{
  siteId: string;
  room: Location | null;
  /** The party is stepping into this room rather than standing in it. */
  entering: boolean;
  regions: LocationMapRegion[];
  doors: SiteDoorWithSpaces[];
  doorState: (doorId: string, fact: DoorStateFact) => LocationState | undefined;
  loot: LootPlacement[];
  campaignId: string | null;
  beat: StagedQuestBeat | null;
}>();

const roomId = computed(() => room?.id ?? "");
const { data: encounters } = useEncountersByLocation(roomId);
const waiting = computed(() => (encounters.value ?? []).filter((e) => !e.is_finished));
</script>
