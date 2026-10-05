<template>
  <MobileSheet v-model:open="open" title="Sort and filter">
    <div class="space-y-5 pb-2">
      <section class="space-y-2">
        <h3 class="text-eyebrow font-bold uppercase text-muted-foreground">Sort by</h3>
        <PeopleSortControl v-model:sort-by="sortBy" v-model:dir="ui.playerPeopleSortDir" :options="sortOptions" />
      </section>

      <section class="space-y-2">
        <h3 class="text-eyebrow font-bold uppercase text-muted-foreground">How they regard you</h3>
        <SegmentedControl v-model="ui.playerPeopleFilterRelationship" :options="relationshipOptions" wrap gap="loose" />
      </section>

      <section class="space-y-2">
        <h3 class="text-eyebrow font-bold uppercase text-muted-foreground">Status</h3>
        <SegmentedControl v-model="ui.playerPeopleFilterStatus" :options="STATUS_OPTIONS" wrap gap="loose" />
      </section>

      <section v-if="places.length" class="space-y-2">
        <h3 class="text-eyebrow font-bold uppercase text-muted-foreground">Place</h3>
        <SegmentedControl
          v-model="ui.playerPeopleFilterLocation"
          :options="placeOptions"
          orientation="vertical"
          block
        />
      </section>
    </div>

    <template #footer>
      <div class="flex items-center gap-3">
        <AppButton variant="subtle" label="Clear" :disabled="!ui.playerPeopleHasActiveFilters" @click="ui.resetPlayerPeopleFilters()" />
        <AppButton
          class="flex-1"
          variant="primary"
          :label="`Show ${resultCount} ${resultCount === 1 ? 'person' : 'people'}`"
          @click="open = false"
        />
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import PeopleSortControl from "@/components/play/people/PeopleSortControl.vue";
import type { PeoplePlace } from "@/composables/play/usePlayerPeople";
import type { PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";
import { useUiStore } from "@/stores/ui";
import { NPC_RELATIONSHIP_LABELS, type NpcRelationship } from "@/types/npc.types";

/** The phone's "Sort and filter" sheet. It does not exist from md up, where the toolbar carries the filters inline. */
const { places } = defineProps<{
  sortOptions: ReadonlyArray<{ value: PlayerNpcSortField; label: string }>;
  places: PeoplePlace[];
  resultCount: number;
}>();

const open = defineModel<boolean>("open", { required: true });
const sortBy = defineModel<PlayerNpcSortField>("sortBy", { required: true });
const ui = useUiStore();

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
  { value: "missing", label: "Missing" },
  { value: "unknown", label: "Unknown" },
] as const;

const relationshipOptions = computed(() => [
  { value: "all" as NpcRelationship | "all", label: "All" },
  ...(Object.entries(NPC_RELATIONSHIP_LABELS) as [NpcRelationship, string][]).map(([value, label]) => ({
    value,
    label,
  })),
]);

const placeOptions = computed(() => [
  { value: "", label: "Anywhere" },
  ...places.map((p) => ({ value: p.id, label: `${p.name} (${p.count})` })),
]);
</script>
