<template>
  <div>
    <BulkScopeBar
      v-if="bulk.selecting.value && !selectMode"
      :count="bulk.count.value"
      :selectable-count="selectableIds.length"
      :busy="bulkScope.isPending.value"
      :campaign-name="activeCampaign?.name ?? null"
      class="mb-3"
      @select-all="selectAllShown"
      @clear="bulk.clear"
      @stop="bulk.stop"
      @move="moveSelection"
    />

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Nothing to pick: the DM disabled every species for this campaign. The
         codex CTA below is DM-only, so select mode gets its own message. -->
    <EmptyState
      v-else-if="!filtered.length && !ui.speciesHasActiveFilters && selectMode"
      title="No species available"
      description="Your DM hasn't enabled any species for this campaign yet."
    />

    <EmptyState
      v-else-if="!filtered.length && !ui.speciesHasActiveFilters"
      title="No species yet"
      description="Build your own or import from Open5e."
    >
      <template #action>
        <RouterLink
          to="/species/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first species
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No species match your filters.
    </p>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <BulkSelectableCard
        v-for="s in visibleItems"
        :key="s.id"
        :selected="bulk.isSelected(s.id)"
        :selecting="bulk.selecting.value && !selectMode && isUuid(s.id)"
        @toggle="bulk.toggle(s.id)"
      >
        <div
          class="group relative flex flex-col rounded-lg border bg-card transition-colors overflow-hidden"
          :class="[
            selectMode ? 'cursor-pointer' : '',
            selectedId && s.id === selectedId
              ? 'border-primary ring-1 ring-primary/20'
              : 'border-border hover:border-primary/50',
          ]"
        >
          <!-- Card link / select overlay -->
          <RouterLink v-if="!selectMode" :to="`/species/${s.id}`" class="absolute inset-0 z-2" />
          <button v-else type="button" class="absolute inset-0 z-2" @click="emit('select', s)" />

          <!-- Selected badge -->
          <div
            v-if="selectedId && s.id === selectedId"
            class="absolute top-2 right-2 z-10 flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground"
          >
            <IconCheck class="size-3" />
          </div>

          <!-- Portrait / placeholder -->
          <div class="relative h-36 bg-muted overflow-hidden shrink-0">
            <FocalImage
              v-if="s.image_url"
              :src="s.image_url"
              :alt="s.name"
              format="landscape"
              :focal-point="s.focal_point"
              class="group-hover:scale-105 transition-transform duration-300"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-display font-bold text-primary/30"
            >
              {{ s.name.charAt(0).toUpperCase() }}
            </div>
          </div>

          <div class="p-3 flex flex-col gap-2 flex-1">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-1">
              {{ s.name }}
            </h3>

            <p class="text-caption text-muted-foreground italic capitalize">
              {{ s.size ?? "—" }}
              <span v-if="s.speed?.walk"> · {{ s.speed.walk }} ft</span>
            </p>

            <p v-if="s.source" class="text-label text-muted-foreground">
              {{ s.source }}
            </p>

            <!-- Tags -->
            <div v-if="s.tags.length" class="flex flex-wrap gap-1 mt-auto">
              <span
                v-for="tag in s.tags.slice(0, 3)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
              >
                {{ tag }}
              </span>
            </div>

            <!-- Select button (shown in selectMode) -->
            <AppButton
              v-if="selectMode"
              variant="tinted"
              tone="primary"
              emphasis="soft"
              size="sm"
              block
              class="relative z-10 mt-2"
              label="Select"
              @click.stop="emit('select', s)"
            />
          </div>

          <!-- Edit button — DM mode only, not shown for srd (shared) species cards -->
          <RouterLink
            v-if="!readonly && !selectMode && isUuid(s.id)"
            :to="`/species/${s.id}?edit=true`"
            class="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 text-label font-semibold text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit species"
          >
            <IconEdit class="max-md:h-4 max-md:w-4 h-3 w-3" />
            Edit
          </RouterLink>
        </div>
      </BulkSelectableCard>
    </div>

    <div ref="sentinelRef" />

    <p
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} species
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { IconCheck, IconEdit } from '@/lib/icons';
import type { Species } from "@/types/species.types";
import { useUiStore } from "@/stores/ui";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { isUuid } from "@/lib/library/contentIdentity";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";
import { storeToRefs } from "pinia";
import BulkScopeBar from "@/components/common/BulkScopeBar.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useBulkCampaignScope } from "@/composables/campaign/useBulkCampaignScope";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";

const { selectMode } = defineProps<{ readonly?: boolean; selectMode?: boolean; selectedId?: string }>();
const emit = defineEmits<{ select: [species: Species] }>();

const ui = useUiStore();
// Picking (select mode) obeys the campaign's blocklist; browsing the codex does
// not — the DM still needs to open and edit a species they switched off (#566).
const { data: campaignSpecies, all: allSpecies, isLoading } = useCampaignSpecies();

const filtered = computed(() => {
  let list = selectMode ? campaignSpecies.value : (allSpecies.value ?? []);

  if (ui.speciesFilterSize !== "all") {
    list = list.filter((s) => s.size === ui.speciesFilterSize);
  }

  if (ui.speciesFilterSource !== "all") {
    const q = ui.speciesFilterSource.toLowerCase();
    list = list.filter((s) => s.source?.toLowerCase().includes(q));
  }

  if (ui.speciesSearch.trim()) {
    const q = ui.speciesSearch.trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return list;
});

const { savedCount, linkCount } = useScrollRestore("species");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

// ── Bulk selection (#875) — the DM's codex tool ─────────────────────────────
//
// Named and gated apart from the player picker's own `selectMode`/`select`
// (added earlier for `PlayerSpeciesPickerView`, a single-pick flow with a
// different meaning): `bulk` is a separate composable instance, every
// bulk-affordance is additionally gated on `!selectMode`, and a card's
// `selecting` prop is only ever true when `selectMode` is falsy — so the
// picker keeps emitting `select` on a plain click exactly as before, and the
// bulk tool never renders while a player is picking. Shared/library species
// (a slug id rather than a uuid, `isUuid(s.id)`) are excluded from selection —
// the same distinction the Edit button above already uses.
const bulk = useBulkSelection();
const bulkScope = useBulkCampaignScope();
const toast = useToast();
const { activeCampaign } = storeToRefs(useCampaignStore());

// Every row a bulk move may legally touch: passes the current filters and
// has a real uuid (not shared/library content). Reused by "select all" and
// by the prune below, so both always agree on what's selectable.
const selectableIds = computed(() => filtered.value.filter((s) => isUuid(s.id)).map((s) => s.id));

// The filters (or `selectMode`/campaign switch) can change while rows are
// selected; prune whenever the selectable set changes so a stale id from a
// now-hidden row never lingers in the selection or reaches the mutation
// (#875).
watch(selectableIds, (ids) => bulk.pruneTo(ids));

function selectAllShown() {
  bulk.selectAll(selectableIds.value);
}

async function moveSelection(campaignId: string | null) {
  const ids = bulk.pruneTo(selectableIds.value);
  if (!ids.length) return;
  try {
    const { moved } = await bulkScope.mutateAsync({ table: "species", ids, campaignId });
    // "Species" is its own plural — no noun-count branch needed here.
    toast.success(
      campaignId
        ? `Moved ${moved} species to ${activeCampaign.value?.name ?? "the campaign"}.`
        : `Made ${moved} species available in all campaigns.`,
    );
    bulk.stop();
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

function toggleBulkSelectMode() {
  if (selectMode) return; // the player picker never enters bulk mode
  if (bulk.selecting.value) bulk.stop();
  else bulk.selecting.value = true;
}

defineExpose({ bulkSelecting: bulk.selecting, toggleBulkSelectMode });
</script>
