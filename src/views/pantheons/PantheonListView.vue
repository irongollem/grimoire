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
      <ListLayoutToggle v-model="layout" />
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
    <ListSkeleton v-if="isLoading" :variant="skeletonVariant" :columns="3" :count="9" />

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
      <EntityCollection
        :items="filtered"
        :item-key="pantheonKey"
        :layout="layout"
        :grid-columns="columns"
        :grid-row-estimate="GRID_ROW_PX"
        :row-estimate="ROW_PX"
        :row-columns="columns"
        :ledger="LEDGER"
      >
        <template #card="{ item: pantheon }">
          <EntityGridCard
            :to="`/pantheons/${pantheon.id}`"
            :title="pantheon.name"
            :image-url="pantheon.emblem_url"
            :placeholder="placeholderUrl('deity')"
            eyebrow="Pantheon"
          >
            <template #actions-end="{ artFree }">
              <div @click.prevent.stop>
                <AudienceRevealControl
                  :name="pantheon.name"
                  :visible-to="pantheon.player_visible_to"
                  :book-entry="{ type: 'pantheon', id: pantheon.id }"
                  :form="artFree ? 'inline' : 'overlay'"
                  @change="(next) => revealPantheon(pantheon.id, next)"
                />
              </div>
            </template>
            <template #body="{ artFree }">
              <p v-if="!artFree" class="truncate text-heading-xs font-bold text-foreground">{{ pantheon.name }}</p>
              <p class="text-label text-muted-foreground">{{ deityCountLabel(pantheon.id) }}</p>
              <TagChips v-if="!artFree" :tags="pantheon.tags" :max="3" class="mt-auto pt-1" />
            </template>
            <template #foot>
              <span v-if="pantheon.tags.length" class="line-clamp-1 text-label text-muted-foreground">{{ pantheon.tags.slice(0, 3).join(" · ") }}</span>
            </template>
          </EntityGridCard>
        </template>
        <template #row="{ item: pantheon }">
          <EntityListRow
            :to="`/pantheons/${pantheon.id}`"
            :title="pantheon.name"
            :subtitle="deityCountLabel(pantheon.id)"
            :image-url="pantheon.emblem_url"
            :fallback-icon="IconFire"
            :tags="pantheon.tags"
            :cells="[deityCountLabel(pantheon.id)]"
          >
            <template #actions>
              <AudienceRevealControl
                :name="pantheon.name"
                :visible-to="pantheon.player_visible_to"
                :book-entry="{ type: 'pantheon', id: pantheon.id }"
                form="inline"
                @change="(next) => revealPantheon(pantheon.id, next)"
              />
            </template>
          </EntityListRow>
        </template>
      </EntityCollection>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="pantheons" />
</template>

<script setup lang="ts">
import { artFreeSkeleton } from "@/components/common/list/ledger";
import TagChips from "@/components/common/TagChips.vue";
import { computed } from "vue";
import { IconAdd, IconFire, IconNavPantheon, IconSun } from '@/lib/icons';
import { useAllPantheons, useAllDeities, useUpdatePantheon } from "@/composables/deities/useDeities";
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ListFilterBar from "@/components/common/list/ListFilterBar.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import { useCreateGate } from "@/composables/billing/useCreateGate";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import EntityCollection from "@/components/common/list/EntityCollection.vue";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useDeitiesUiStore } from "@/stores/ui/deities";
import { useLowArt } from "@/composables/useLowArt";

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
// The page header's toggle writes the same key. Rows is today's look.
const layout = useListLayout("pantheons", "rows");
const { lowArt } = useLowArt();
const skeletonVariant = computed(() => {
  if (lowArt.value) return artFreeSkeleton(layout.value);
  return layout.value === "grid" ? "grid" : "tiles";
});
// Low art (#1179, frame 03): the deity count the row shows as its subtitle. A pantheon has no source.
const LEDGER = [{ label: "Deities", track: "minmax(0,1fr)" }];
const pantheonKey = (pantheon: { id: string }) => pantheon.id;

// Row height before a row is measured (px): 86px measured at a 390px
// phone, 8 Oct 2026. It decides where a restored scroll lands, since coming
// back from a detail re-renders every unmeasured row above the viewport.
const ROW_PX = 86;
// Grid card height before it is measured (px): border + artwork + padding + body.
const GRID_ROW_PX = 230;

function deityCountLabel(pantheonId: string): string {
  const n = (deities.value ?? []).filter((d) => d.pantheon_id === pantheonId).length;
  return `${n} ${n === 1 ? "deity" : "deities"}`;
}
</script>
