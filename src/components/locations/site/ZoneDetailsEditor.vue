<template>
  <div class="flex flex-wrap items-center gap-2 border-t border-border pt-1.5">
    <template v-if="zone.zone_kind === 'terrain'">
      <AppSelect
        :model-value="zone.zone_payload.movement_cost ?? 1"
        :model-modifiers="{ number: true }"
        size="xs"
        tone="card"
        @update:model-value="updatePayload({ movement_cost: $event as number })"
      >
        <option v-for="cost in TERRAIN_MOVEMENT_COSTS" :key="cost.value" :value="cost.value">{{ cost.label }}</option>
      </AppSelect>
      <AppInput
        :model-value="zone.zone_payload.depth_ft ?? null"
        :model-modifiers="{ number: true, lazy: true }"
        type="number"
        tone="card"
        size="xs"
        placeholder="Depth (ft)"
        class="w-28"
        @update:model-value="updatePayload({ depth_ft: ($event as number | null) ?? undefined })"
      />
    </template>

    <template v-else-if="zone.zone_kind === 'light'">
      <AppSelect
        :model-value="zone.zone_payload.light_level ?? 'dim'"
        size="xs"
        tone="card"
        @update:model-value="updatePayload({ light_level: $event as ZonePayload['light_level'] })"
      >
        <option v-for="level in LIGHT_LEVELS" :key="level.value" :value="level.value">{{ level.label }}</option>
      </AppSelect>
    </template>

    <template v-else-if="zone.zone_kind === 'hazard'">
      <!-- `?? ''` is the same edit-boundary translation
           `PlacementNoteInput` documents: `trap_id` is a genuinely
           optional domain field, `EntityCombobox`'s model is not
           nullable. `|| undefined` mirrors it back on the way out. -->
      <EntityCombobox
        :model-value="zone.zone_payload.trap_id ?? ''"
        :options="traps ?? []"
        placeholder="Link a trap…"
        class="w-48"
        @update:model-value="updatePayload({ trap_id: $event || undefined })"
      />
    </template>

    <template v-else-if="zone.zone_kind === 'trigger'">
      <EntityCombobox
        :model-value="zone.zone_payload.encounter_id ?? ''"
        :options="encounters ?? []"
        placeholder="Prompt an encounter…"
        class="w-48"
        @update:model-value="updatePayload({ encounter_id: $event || undefined })"
      />
      <!-- A zone can also name a beat (#868 S12): Run shows "Beat N is
           staged on this floor — advance?" when the party enters it.
           Quest first, then beat — there's no campaign-wide beat list
           to search directly. `triggerQuestId` primes from the zone's
           own `beat_id` the first time its editor opens, so reopening
           one that already names a beat doesn't ask the DM to re-find
           which quest it lives in. -->
      <EntityCombobox
        v-model="triggerQuestId"
        :options="questOptions"
        placeholder="Which quest…"
        class="w-40"
      />
      <EntityCombobox
        :model-value="zone.zone_payload.beat_id ?? ''"
        :options="triggerBeatOptions"
        :placeholder="triggerQuestId ? 'Prompt a beat…' : 'Choose a quest first…'"
        class="w-48"
        @update:model-value="updatePayload({ beat_id: $event || undefined })"
      />
    </template>

    <span v-else-if="zone.zone_kind === 'entrance'" class="text-caption text-muted-foreground italic">
      The party walks in here when you explore this site.
    </span>

    <span v-else class="text-caption text-muted-foreground italic">
      Geometry with no mechanics: the honest default for cover, a ritual circle, anything read-aloud only.
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * The mechanics of one zone, only the fields its kind reads (`ZonePayload`'s own docstring: hints for the renderer
 * and the run surface, never enforced). Lifted out of the old zone list when Zoning became one list (#1125).
 */
import { computed, ref, watch } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { dmEdit, useUpdateLocationMapRegion } from "@/composables/locations/useLocationMapRegions";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useTrapIndex } from "@/composables/dungeon-features/useTraps";
import { useQuests } from "@/composables/quests/useQuests";
import { useQuestBeat, useQuestBeats } from "@/composables/quests/useQuestFlow";
import { LIGHT_LEVELS, TERRAIN_MOVEMENT_COSTS } from "@/lib/locations/zones";
import type { LocationMapRegion, ZonePayload } from "@/types/locationMapRegion.types";

const { zone } = defineProps<{ zone: LocationMapRegion }>();

const updateRegion = useUpdateLocationMapRegion();
// A zone may link a library trap too (its slug lands in the jsonb payload).
const { data: traps } = useTrapIndex();
const { data: encounters } = useEncounters();

// A trigger zone can also name a beat (#868 S12): Run shows "Beat N is staged on this floor, advance?" when the
// party enters it. Quest first, then beat: there is no campaign-wide beat list to search directly.
const { data: quests } = useQuests();
const questOptions = computed(() => (quests.value ?? []).map((quest) => ({ id: quest.id, name: quest.title })));
const triggerQuestId = ref("");
// Primes the quest picker from the beat the zone already names, so reopening a configured trigger zone does not
// ask the DM to re-find which quest it lives in.
const { data: primingBeat } = useQuestBeat(computed(() => zone.zone_payload.beat_id ?? ""));
watch(primingBeat, (beat) => { if (beat && !triggerQuestId.value) triggerQuestId.value = beat.quest_id; }, { immediate: true });
const { data: triggerBeats } = useQuestBeats(triggerQuestId);
const triggerBeatOptions = computed(() => (triggerBeats.value ?? []).map((beat) => ({ id: beat.id, name: beat.title || "Untitled beat" })));

/** Merges into the existing payload rather than replacing it: a hazard's `trap_id` and a terrain's `movement_cost`
 *  are independent fields, and a field-at-a-time editor that replaced the object would drop the others. */
function updatePayload(patch: Partial<ZonePayload>): void {
  updateRegion.mutate({ id: zone.id, update: dmEdit({ zone_payload: { ...zone.zone_payload, ...patch } }) });
}
</script>
