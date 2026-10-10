<template>
  <ListPageLayout title="Pantheons" description="Named groups of deities and their divine hierarchies">
    <template #actions>
      <ListActionButton
        :icon="IconSun"
        label="All Deities"
        mobile-label="Deities"
        to="/deities"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Pantheon"
        mobile-label="Pantheon"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="deitiesUi.pantheonsHasActiveFilters"
        @clear="deitiesUi.resetPantheonsFilters()"
      >
        <ListSearchInput v-model="deitiesUi.pantheonsSearch" placeholder="Filter pantheons…" />
      </ListFilterBar>
    </template>

    <!-- Mirrors EntityListRow (emblem tile, name, deity count) in its grid. -->
    <ListSkeleton v-if="isLoading" variant="tiles" :columns="3" :count="9" />

    <EmptyState
      v-else-if="!filtered.length"
      title="No pantheons yet"
      description="Create a pantheon to group your deities: Faerûnian, Olympian, or wholly homebrew."
    >
      <template #icon><IconNavPantheon class="h-16 w-16" /></template>
    </EmptyState>

    <template v-else>
    <!--
      Windowed and position-restoring like the NPC and monster grids. No mobile
      card swap, though, and that is deliberate rather than unfinished:
      `EntityMobileCard`'s "rows" layout is this row, and it is a `RouterLink`
      wrapper — so adopting it would trade a working reveal control for a
      read-only eye at exactly the width where the control is hardest to reach
      another way. `EntityListRow` uses the link-overlay trick precisely so it
      can hold a button, and it already reflows to one column.
    -->
      <VirtualGrid
        :items="filtered"
        :item-key="pantheonKey"
        :columns="columns"
        :estimate-row-height="ROW_PX"
      >
        <template #default="{ item: pantheon }">
        <EntityListRow
          :to="`/pantheons/${pantheon.id}`"
          :title="pantheon.name"
          :subtitle="`${deityCount(pantheon.id)} ${deityCount(pantheon.id) === 1 ? 'deity' : 'deities'}`"
          :image-url="pantheon.emblem_url"
          :fallback-icon="IconFire"
          :tags="pantheon.tags"
        >
          <template #actions>
            <AudienceRevealControl
              :name="pantheon.name"
              :visible-to="pantheon.player_visible_to"
              form="inline"
              @change="(next) => revealPantheon(pantheon.id, next)"
            />
          </template>
        </EntityListRow>
        </template>
      </VirtualGrid>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="pantheons" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconFire, IconNavPantheon, IconSun } from '@/lib/icons';
import { useAllPantheons, useAllDeities, useUpdatePantheon } from "@/composables/deities/useDeities";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import EntityListRow from "@/components/common/EntityListRow.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import { useDeitiesUiStore } from "@/stores/ui/deities";

const deitiesUi = useDeitiesUiStore();
const { data: pantheons, isLoading } = useAllPantheons();
const { data: deities } = useAllDeities();
const { mutate: updatePantheon } = useUpdatePantheon();

function revealPantheon(id: string, playerVisibleTo: string[]) {
  updatePantheon({ id, update: { player_visible_to: playerVisibleTo } });
}

const { showPaywall, handleNew } = useCreateGate("pantheons", "/pantheons/new");

const filtered = computed(() => {
  const q = deitiesUi.pantheonsSearch.trim().toLowerCase();
  return (pantheons.value ?? []).filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

// The whole filtered list is in hand, so only the scroll position needs
// restoring; VirtualGrid windows what is mounted.
useScrollRestore("pantheons");

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3 });
const pantheonKey = (pantheon: { id: string }) => pantheon.id;

// Row height before a row is measured (px): 86px measured at a 390px
// phone, 8 Oct 2026. It decides where a restored scroll lands, since coming
// back from a detail re-renders every unmeasured row above the viewport.
const ROW_PX = 86;

function deityCount(pantheonId: string): number {
  return (deities.value ?? []).filter((d) => d.pantheon_id === pantheonId).length;
}
</script>
