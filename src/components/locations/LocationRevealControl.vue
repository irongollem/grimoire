<template>
  <!--
    A location's reveal, in the app's one reveal control.

    Locations have an unusually rich "what": a player who can see a place does
    not automatically see its description, its inhabitants, its stock or its
    map. Those four switches lived only inside the full editor, so glancing at
    a place and revealing it meant opening an edit form — the thing this exists
    to avoid.
  -->
  <RevealControl
    :adapter="adapter"
    :entity-name="location.name"
    :form="form"
  >
    <template #what>
      <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
        THEY ALSO SEE
      </p>
      <div class="flex flex-col gap-1">
        <AppButton
          v-for="option in shareOptions"
          :key="option.key"
          variant="ghost"
          size="sm"
          block
          class="justify-start gap-2 rounded px-2 hover:bg-muted"
          @click="toggleShare(option.key)"
        >
          <span
            class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors"
            :class="draft[option.key] ? 'border-primary bg-primary' : 'border-border'"
          >
            <IconCheck v-if="draft[option.key]" class="h-2.5 w-2.5 text-primary-foreground" />
          </span>
          <span class="truncate text-left">{{ option.label }}</span>
        </AppButton>
      </div>
    </template>
  </RevealControl>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import RevealControl from "@/components/common/RevealControl.vue";
import { useParty } from "@/composables/useParty";
import { useUpdateLocation } from "@/composables/useLocations";
import { IconCheck } from "@/lib/icons";
import { arrayRevealAdapter } from "@/lib/reveal";
import { STORE_LOCATION_TYPES } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { location, form = "button" } = defineProps<{
  location: Location;
  form?: "button" | "overlay";
}>();

type ShareKey = "is_description_shared" | "is_npcs_shared" | "is_inventory_shared" | "is_map_shared";

const { mutate: updateLocation } = useUpdateLocation();
const { data: partyData } = useParty();

/**
 * Local optimistic state synced from the row, so a toggle lands instantly and
 * the control does not wait for a refetch to redraw. Same pattern as
 * ItemDetailPanel.
 */
const visibleTo = ref<string[]>([...location.player_visible_to]);
const draft = ref<Record<ShareKey, boolean>>({
  is_description_shared: location.is_description_shared,
  is_npcs_shared: location.is_npcs_shared,
  is_inventory_shared: location.is_inventory_shared,
  is_map_shared: location.is_map_shared,
});

watch(
  () => location,
  (next) => {
    visibleTo.value = [...next.player_visible_to];
    draft.value = {
      is_description_shared: next.is_description_shared,
      is_npcs_shared: next.is_npcs_shared,
      is_inventory_shared: next.is_inventory_shared,
      is_map_shared: next.is_map_shared,
    };
  },
);

// Saving is passed to the adapter rather than done in a watcher on `visibleTo`:
// the save refetches, the refetch pushes a new array into the ref, and a
// watcher would treat that changed identity as another edit — writing forever,
// with an embedding call behind every write.
const adapter = arrayRevealAdapter(
  visibleTo,
  () => (partyData.value ?? []).map((m) => m.id),
  (next) => updateLocation({ id: location.id, update: { player_visible_to: next } }),
);

/** Stock only means something where a location can hold any. */
const shareOptions = computed(() => {
  const options: Array<{ key: ShareKey; label: string }> = [
    { key: "is_description_shared", label: "Full description" },
    { key: "is_npcs_shared", label: "People here" },
  ];
  if (location.map_url && !location.is_battle_map) {
    options.push({ key: "is_map_shared", label: "Map" });
  }
  if (STORE_LOCATION_TYPES.has(location.location_type)) {
    options.push({ key: "is_inventory_shared", label: "Wares" });
  }
  return options;
});

function toggleShare(key: ShareKey) {
  draft.value = { ...draft.value, [key]: !draft.value[key] };
  updateLocation({ id: location.id, update: { [key]: draft.value[key] } });
}
</script>
