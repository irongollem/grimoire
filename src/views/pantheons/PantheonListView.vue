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
        :has-active-filters="ui.pantheonsHasActiveFilters"
        @clear="ui.resetPantheonsFilters()"
      >
        <ListSearchInput v-model="ui.pantheonsSearch" placeholder="Filter pantheons…" />
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      title="No pantheons yet"
      description="Create a pantheon to group your deities — Faerûnian, Olympian, or wholly homebrew."
    >
      <template #icon><IconNavPantheon class="h-16 w-16" /></template>
    </EmptyState>

    <template v-else>
    <!--
      Paged and position-restoring like the NPC and monster grids. No mobile
      card swap, though, and that is deliberate rather than unfinished:
      `EntityMobileCard`'s "rows" layout is this row, and it is a `RouterLink`
      wrapper — so adopting it would trade a working reveal control for a
      read-only eye at exactly the width where the control is hardest to reach
      another way. `EntityListRow` uses the link-overlay trick precisely so it
      can hold a button, and it already reflows to one column.
    -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <EntityListRow
          v-for="pantheon in visibleItems"
          :key="pantheon.id"
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
      </div>
    </template>

    <div ref="sentinelRef" />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="pantheons" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconFire, IconNavPantheon, IconSun } from '@/lib/icons';
import { useAllPantheons, useAllDeities, useUpdatePantheon } from "@/composables/useDeities";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import EntityListRow from "@/components/common/EntityListRow.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const { data: pantheons, isLoading } = useAllPantheons();
const { data: deities } = useAllDeities();
const { mutate: updatePantheon } = useUpdatePantheon();

function revealPantheon(id: string, playerVisibleTo: string[]) {
  updatePantheon({ id, update: { player_visible_to: playerVisibleTo } });
}

const { showPaywall, handleNew } = useCreateGate("pantheons", "/pantheons/new");

const filtered = computed(() => {
  const q = ui.pantheonsSearch.trim().toLowerCase();
  return (pantheons.value ?? []).filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

// `sentinelRef` must stay destructured — the template binds it as a plain
// `ref="sentinelRef"` string, which is never typechecked, so dropping it leaves
// the ref null and the list silently capped at 48 with every gate green.
const { savedCount, linkCount } = useScrollRestore("pantheons");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

function deityCount(pantheonId: string): number {
  return (deities.value ?? []).filter((d) => d.pantheon_id === pantheonId).length;
}
</script>
