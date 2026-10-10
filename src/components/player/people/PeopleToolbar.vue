<template>
  <div class="space-y-2.5">
    <div class="flex items-center gap-2">
      <div class="relative min-w-0 flex-1">
        <IconSearch class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <AppInput v-model="ui.playerPeopleSearch" tone="card" size="body" placeholder="Search people…" class="pl-8" />
      </div>
      <SegmentedControl
        v-model="ui.playerPeopleView"
        :options="VIEW_OPTIONS"
        aria-label="View"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <PeopleSortControl v-model:sort-by="sortBy" v-model:dir="ui.playerPeopleSortDir" :options="sortOptions" />

      <!-- Below md the filters live in a sheet; from md up they sit inline. -->
      <AppButton
        class="md:hidden"
        variant="subtle"
        size="sm"
        :icon="IconMixer"
        :label="activeFilterCount ? `Filter (${activeFilterCount})` : 'Filter'"
        @click="emit('openFilters')"
      />
      <div class="hidden flex-wrap items-center gap-2 md:flex">
        <AppSelect v-model="ui.playerPeopleFilterRelationship" size="body" weight="normal">
          <option value="all">All relations</option>
          <option v-for="(label, value) in NPC_RELATIONSHIP_LABELS" :key="value" :value="value">{{ label }}</option>
        </AppSelect>
        <AppSelect v-model="ui.playerPeopleFilterStatus" size="body" weight="normal">
          <option value="all">All statuses</option>
          <option value="alive">Alive</option>
          <option value="dead">Dead</option>
          <option value="missing">Missing</option>
          <option value="unknown">Unknown</option>
        </AppSelect>
        <AppSelect v-if="places.length" v-model="ui.playerPeopleFilterLocation" size="body" weight="normal">
          <option value="">All locations</option>
          <option v-for="p in places" :key="p.id" :value="p.id">{{ p.name }}</option>
        </AppSelect>
        <AppButton
          v-if="ui.playerPeopleHasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          @click="ui.resetPlayerPeopleFilters()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import PeopleSortControl from "@/components/player/people/PeopleSortControl.vue";
import type { PeoplePlace } from "@/composables/player/usePlayerPeople";
import { IconMixer, IconSearch } from "@/lib/icons";
import type { PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";
import { useUiStore } from "@/stores/ui";
import { NPC_RELATIONSHIP_LABELS } from "@/types/npc.types";

/** Search, view, sort and (from md up) the filters of the People page. Filter state lives in `useUiStore`. */
defineProps<{
  sortOptions: ReadonlyArray<{ value: PlayerNpcSortField; label: string }>;
  places: PeoplePlace[];
  activeFilterCount: number;
}>();

const emit = defineEmits<{ openFilters: [] }>();

const sortBy = defineModel<PlayerNpcSortField>("sortBy", { required: true });
const ui = useUiStore();

const VIEW_OPTIONS = [
  { value: "ledger", label: "Ledger" },
  { value: "portraits", label: "Portraits" },
] as const;
</script>
