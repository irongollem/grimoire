<template>
  <PageHeader title="Book Nook" description="Pictures that breathe, for the locations in your Atlas.">
    <template #actions>
      <ListActionButton variant="primary" :icon="IconAdd" label="New nook" mobile-label="Nook" @click="creating = true" />
    </template>

    <ListSkeleton v-if="isLoading" variant="text" :columns="4" :count="8" />

    <EntityCollection
      v-else-if="nooks?.length"
      :items="nooks"
      :item-key="nookKey"
      layout="grid"
      :grid-columns="columns"
      :grid-row-estimate="GRID_ROW_PX"
    >
      <template #card="{ item }">
        <BookNookCard :nook="item" :place-name="placeNames.get(item.id)?.name ?? null" :place-id="placeNames.get(item.id)?.id ?? null" />
      </template>
    </EntityCollection>

    <EmptyState
      v-else
      title="No nooks yet"
      description="A nook is a picture of a room that moves a little: its flames flicker, its curtains stir. Start one from a location's picture in your Atlas, or from a picture of your own."
    >
      <template #icon>
        <IconNavBookNook class="h-16 w-16" />
      </template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Make your first nook" @click="creating = true" />
      </template>
    </EmptyState>

    <NewNookDialog :open="creating" @close="creating = false" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BookNookCard from "@/components/bookNook/BookNookCard.vue";
import NewNookDialog from "@/components/bookNook/NewNookDialog.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import { useBookNooks } from "@/composables/bookNook/useBookNooks";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { IconAdd, IconNavBookNook } from "@/lib/icons";
import type { BookNook } from "@/types/bookNook.types";

const { data: nooks, isLoading } = useBookNooks();
const { data: locations } = useAllLocations();
const creating = ref(false);

// Mirrors `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
const columns = useBreakpointColumns({ base: 1, sm: 2, md: 3, lg: 4 });
const nookKey = (n: BookNook) => n.id;
// A card before it is measured: 2 border + 16:9 still at ~17rem wide (~9.5rem) + 4.5rem body.
const GRID_ROW_PX = 240;

/** nook id -> the place that shows it. */
const placeNames = computed(() => {
  const names = new Map<string, { id: string; name: string }>();
  for (const l of locations.value ?? []) if (l.book_nook_id) names.set(l.book_nook_id, { id: l.id, name: l.name });
  return names;
});
</script>
