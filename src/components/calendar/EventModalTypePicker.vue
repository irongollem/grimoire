<template>
  <div>
    <!-- A `<span>`, not a `<label>`: it wraps no control and carries no `for`,
         so as a label it named nothing. The select carries its own aria-label. -->
    <span class="block text-label-lg font-semibold text-muted-foreground mb-1">TYPE</span>
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: color }" />
      <AppSelect
        :model-value="eventType"
        size="body"
        tone="muted"
        weight="normal"
        block
        aria-label="Event type"
        class="flex-1"
        @update:model-value="(value: CalendarEventType) => emit('update:eventType', value)"
      >
        <option v-for="option in TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </AppSelect>
    </div>
    <!--
      Beneath the row, not inside it. This used to be a third flex child beside
      the swatch and the select, wearing an `mt-1` that a `flex items-center`
      row ignores — so the sentence sat alongside the control it explains and
      squeezed it.
    -->
    <p class="mt-1 text-caption text-muted-foreground italic">
      Session events are created automatically from
      <RouterLink to="/notes" class="text-primary hover:underline" @click="emit('close')"
        >session notes</RouterLink
      >.
    </p>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppSelect from "@/components/common/AppSelect.vue";
import type { CalendarEventType } from "@/types/calendar.types";

/**
 * Ten of `CalendarEventType`'s thirteen values, and the three that are absent
 * are absent on purpose:
 *
 * - **`session`** is written by `NoteEditor` when a session note is saved
 *   (`NoteEditor.vue:497`), which is what the line under the control says.
 * - **`encounter`** and **`location`** are not created by anything in the app
 *   at all. They exist in the union and in `EVENT_TYPE_COLORS`, but no code
 *   path sets either — an event reaches them only by being linked to an
 *   encounter or a location, which `linkedEntityType()` derives from the
 *   `linked_*_id` columns rather than from `event_type`. Offering them here
 *   would invent a way to create something the rest of the app has no notion
 *   of.
 *
 * The list is spelled out as data rather than as markup so the count and the
 * reasoning above stay next to each other.
 */
const TYPE_OPTIONS = [
  { value: "campaign", label: "Campaign Event" },
  { value: "world", label: "World Event" },
  { value: "festival", label: "Festival" },
  { value: "deadline", label: "Deadline" },
  { value: "quest", label: "Quest" },
  { value: "player_death", label: "💀 Player Death" },
  { value: "boss_fight", label: "⚔ Boss Fight" },
  { value: "discovery", label: "🔍 Discovery" },
  { value: "npc_death", label: "🗡 NPC Death" },
  { value: "travel", label: "🗺 Travel" },
] as const satisfies readonly { value: CalendarEventType; label: string }[];

const { eventType, color } = defineProps<{
  eventType: CalendarEventType;
  color: string;
}>();

const emit = defineEmits<{
  "update:eventType": [value: CalendarEventType];
  close: [];
}>();
</script>
