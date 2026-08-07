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
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="pantheon in filtered"
          :key="pantheon.id"
          :to="`/pantheons/${pantheon.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
        >
          <div class="shrink-0 h-12 w-12 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            <FocalImage v-if="pantheon.emblem_url" :src="pantheon.emblem_url" alt="" format="square" />
            <IconFire v-else class="h-5 w-5 text-muted-foreground/40" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-cinzel text-sm font-bold text-foreground truncate flex-1">{{ pantheon.name }}</p>
              <IconReveal v-if="pantheon.player_visible_to?.length" class="h-3 w-3 shrink-0 text-elven-green" />
            </div>
            <p class="text-label text-muted-foreground mt-0.5">
              {{ deityCount(pantheon.id) }} {{ deityCount(pantheon.id) === 1 ? 'deity' : 'deities' }}
            </p>
            <div v-if="pantheon.tags.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in pantheon.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
              >{{ tag }}</span>
            </div>
          </div>

          <IconChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
        </RouterLink>
      </div>
    </template>
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="pantheons" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd, IconChevronRight, IconFire, IconNavPantheon, IconReveal, IconSun } from '@/lib/icons';
import { useAllPantheons, useAllDeities } from "@/composables/useDeities";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { useCreateGate } from "@/composables/useCreateGate";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const { data: pantheons, isLoading } = useAllPantheons();
const { data: deities } = useAllDeities();

const { showPaywall, handleNew } = useCreateGate("pantheons", "/pantheons/new");

const filtered = computed(() => {
  const q = ui.pantheonsSearch.trim().toLowerCase();
  return (pantheons.value ?? []).filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.tags.some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
});

function deityCount(pantheonId: string): number {
  return (deities.value ?? []).filter((d) => d.pantheon_id === pantheonId).length;
}
</script>
