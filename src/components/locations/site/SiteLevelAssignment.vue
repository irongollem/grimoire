<template>
  <!-- Wraps rather than squeezing: a long parent name on a phone would
       otherwise fold each segment's label onto two lines. -->
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
    <span class="flex min-w-0 items-center gap-2 text-muted-foreground">
      <IconLayers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      In {{ parentName }}, this is
    </span>
    <SegmentedControl
      class="shrink-0 whitespace-nowrap"
      :model-value="choice"
      :options="options"
      size="xs"
      :disabled="saving"
      @update:model-value="onChange"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Whether this place is a floor of its parent site, assigned by the DM
 * rather than inferred (migration `20260928195128`). Only mounted in Build,
 * and only for a site-tier place whose parent is also site-tier — the two
 * ends `guard_location_room_parent` allows the flag on at all.
 *
 * A store, tavern or inn is not automatically excluded here: a department
 * store's own floors are stores, so the choice is offered to every eligible
 * pair and left entirely to the DM (that guess is exactly what this control
 * replaces — see `src/lib/locations/levels.ts`).
 */
import { computed, ref, watch } from "vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { IconLayers } from "@/lib/icons";
import type { Location } from "@/types/location.types";

const { location, parentName } = defineProps<{
  location: Location;
  /** The site-tier parent's name, for the lead-in and the two tooltips. */
  parentName: string;
}>();

type Choice = "place" | "level";

// The two answers differ in where the place shows up, so that is what each
// one says. "Level" is the word the rail and "Add a level" already use.
const options = computed<SegmentedOption<Choice>[]>(() => [
  { value: "place", label: "A place", tooltip: `Listed among what is inside ${parentName}` },
  { value: "level", label: "A level", tooltip: `One of the floors of ${parentName}, with its own map` },
]);

const toast = useToast();
const { mutateAsync: updateLocation, isPending: saving } = useUpdateLocation();

// Optimistic, like LocationRevealControl: flips instantly rather than
// waiting on the refetch the mutation's own invalidation kicks off, and
// rolls back if the write fails.
const draft = ref(location.is_level);
watch(() => location.is_level, (next) => { draft.value = next; });

const choice = computed<Choice>(() => (draft.value ? "level" : "place"));

async function onChange(next: Choice): Promise<void> {
  const nextIsLevel = next === "level";
  if (nextIsLevel === draft.value) return;
  const previous = draft.value;
  draft.value = nextIsLevel;
  try {
    await updateLocation({ id: location.id, update: { is_level: nextIsLevel } });
  } catch (e) {
    draft.value = previous;
    toast.error(toast.fromError(e));
  }
}
</script>
