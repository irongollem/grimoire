<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div class="flex items-center justify-between px-3 pt-3">
      <h2 class="text-eyebrow uppercase text-muted-foreground">The party</h2>
      <AppButton
        v-if="members.length > 1"
        variant="link"
        size="inline-xs"
        label="Move everyone"
        data-testid="explore-select-party"
        @click="emit('select-party')"
      />
    </div>
    <ul class="flex flex-col gap-0.5 p-2" aria-label="The party">
      <li v-for="c in members" :key="c.instance_id">
        <AppButton variant="ghost" size="well" block :active="selection.has(c.instance_id) && selection.size === 1" @click="emit('select-one', c.instance_id)">
          <span class="flex w-full items-center gap-2">
            <PlayPortrait :combatant="c" :factions="DEFAULT_FACTIONS" />
            <span class="flex min-w-0 flex-1 flex-col gap-1 text-left">
              <span class="truncate text-label-lg">{{ c.name }}</span>
              <span class="h-1 overflow-hidden rounded-full bg-secondary" role="img" :aria-label="`${c.hp} of ${c.max_hp} hit points`">
                <span class="block h-full rounded-full" :class="hpTone(c)" :style="{ width: hpPercent(c) + '%' }"></span>
              </span>
            </span>
          </span>
        </AppButton>
      </li>
    </ul>

    <h2 class="px-3 pt-2 text-eyebrow uppercase text-muted-foreground">Rooms</h2>
    <p v-if="!rooms.length" class="px-3 py-2 text-caption italic text-muted-foreground">No rooms yet. Add some on the site's Overview.</p>
    <ul class="flex flex-col gap-0.5 p-2" aria-label="Rooms">
      <li v-for="room in rooms" :key="room.id">
        <AppButton variant="ghost" size="well" block :aria-current="room.state === 'entering' ? 'true' : undefined" @click="emit('go', room.id)">
          <span class="flex w-full items-center justify-between gap-2">
            <span class="truncate text-label-lg" :class="room.state === 'hidden' ? 'text-muted-foreground' : 'text-foreground'">{{ room.name }}</span>
            <span class="shrink-0 text-label" :class="STATE_TONE[room.state]" :data-state="room.state">{{ STATE_LABEL[room.state] }}</span>
          </span>
        </AppButton>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import PlayPortrait from "@/components/encounters/play/PlayPortrait.vue";
import { hpPercent } from "@/components/encounters/play/playHp";
import type { RoomExploreState } from "@/lib/locations/explore";
import { DEFAULT_FACTIONS, type RunCombatant } from "@/types/encounter.types";

/** The left column of exploring (#1125 frame 09): who is in the party, and which rooms the site has and how far along each is. */
defineProps<{
  members: RunCombatant[];
  selection: ReadonlySet<string>;
  rooms: readonly { id: string; name: string; state: RoomExploreState }[];
}>();

const emit = defineEmits<{ "select-party": []; "select-one": [instanceId: string]; go: [roomId: string] }>();

const STATE_LABEL: Record<RoomExploreState, string> = { explored: "explored", entering: "entering", hidden: "hidden" };
const STATE_TONE: Record<RoomExploreState, string> = {
  explored: "text-ink-success",
  entering: "text-ink-caution font-semibold",
  hidden: "text-muted-foreground",
};

function hpTone(c: RunCombatant): string {
  const pct = hpPercent(c);
  if (pct > 50) return "bg-tone-success";
  return pct > 25 ? "bg-tone-caution" : "bg-tone-danger";
}
</script>
