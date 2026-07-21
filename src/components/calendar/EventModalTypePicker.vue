<template>
  <div>
    <label class="block text-label-lg font-semibold text-muted-foreground mb-1">
      TYPE
    </label>
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: color }" />
      <select
        :value="eventType"
        class="flex-1 bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="emit('update:eventType', ($event.target as HTMLSelectElement).value as CalendarEventType)"
      >
        <option value="campaign">Campaign Event</option>
        <option value="world">World Event</option>
        <option value="festival">Festival</option>
        <option value="deadline">Deadline</option>
        <option value="quest">Quest</option>
        <option value="player_death">💀 Player Death</option>
        <option value="boss_fight">⚔ Boss Fight</option>
        <option value="discovery">🔍 Discovery</option>
        <option value="npc_death">🗡 NPC Death</option>
        <option value="travel">🗺 Travel</option>
      </select>
      <p class="font-fell text-xs text-muted-foreground italic mt-1">
        Session events are created automatically from
        <RouterLink to="/notes" class="text-primary hover:underline" @click="emit('close')">session notes</RouterLink>.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { CalendarEventType } from "@/types/calendar.types";

const { eventType, color } = defineProps<{
  eventType: CalendarEventType;
  color: string;
}>();

const emit = defineEmits<{
  "update:eventType": [value: CalendarEventType];
  close: [];
}>();
</script>
