<template>
  <ListPageLayout title="Hall of Heroes" description="Iconic characters importable into any campaign">
    <template #title-suffix>
      <ManualHelpLink page="hall-of-heroes" />
    </template>

    <template v-if="isAppAdmin" #actions>
      <ListActionButton
        :icon="IconGenerate"
        :label="populateLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Hero"
        mobile-label="Hero"
        to="/hall-of-heroes/new"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="hasActiveFilters"
        @clear="clearFilters"
      >
        <ListSearchInput v-model="search" placeholder="Search heroes…" />
        <ListFilterSelect v-model="settingFilter" aria-label="Setting filter">
          <option value="all">All Settings</option>
          <option v-for="s in SETTINGS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div ref="listRef">
    <ListSkeleton v-if="isLoading" variant="grid" :count="12" />

    <EmptyState
      v-else-if="!filtered.length && !search && settingFilter === 'all'"
      title="No heroes yet"
      :description="isAppAdmin ? 'Add the first hero to the Hall.' : 'The Hall of Heroes is empty.'"
    >
      <AppButton
        v-if="isAppAdmin"
        to="/hall-of-heroes/new"
        variant="primary"
        size="md"
        :icon="IconAdd"
        label="Add Hero"
        class="mt-4"
      />
    </EmptyState>

    <p v-else-if="!filtered.length" class="py-10 text-center font-fell text-muted-foreground">
      No heroes match your filters.
    </p>

    <VirtualGrid
      v-else
      :items="filtered"
      :item-key="heroKey"
      :columns="columns"
      :gap="1"
      :estimate-row-height="HERO_ROW_PX"
    >
      <!-- Same card shell as NPCs and monsters (EntityGridCard), so heroes get
           the same artwork plate, corner chips and, in Vellum, the poster. -->
      <template #default="{ item: hero }">
      <EntityGridCard
        :to="`/hall-of-heroes/${hero.id}`"
        :title="hero.name"
        :image-url="hero.portrait_url"
        :focal-point="hero.portrait_focal_point"
        :placeholder="placeholderUrl('npc')"
        :badge-text="settingLabel(hero.setting)"
        :badge-class="campaignSetting && hero.setting === campaignSetting ? 'bg-primary' : undefined"
      >
        <template #body>
          <div class="flex items-start justify-between gap-1">
            <h3 class="line-clamp-1 flex-1 text-heading-xs leading-tight font-bold text-foreground">
              {{ hero.name }}
            </h3>
          </div>
          <p v-if="hero.race || hero.occupation" class="truncate text-caption text-muted-foreground italic">
            {{ [hero.race, hero.occupation].filter(Boolean).join(" · ") }}
          </p>
          <div v-if="hero.tags.length" class="flex flex-wrap gap-1 pt-1">
            <span
              v-for="tag in hero.tags.slice(0, 3)"
              :key="tag"
              class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
            >{{ tag }}</span>
            <span v-if="hero.tags.length > 3" class="self-center text-caption-sm text-muted-foreground italic">
              +{{ hero.tags.length - 3 }}
            </span>
          </div>
          <!-- Above the whole-card link (z-2), like the corner chips. -->
          <AppButton
            class="relative z-10 mt-auto w-full"
            variant="tinted"
            tone="primary"
            size="sm"
            :disabled="!hasCampaign || isImporting === hero.id"
            :tooltip="hasCampaign ? 'Add to current campaign' : 'No active campaign'"
            :label="isImporting === hero.id ? 'Adding…' : 'Add to Campaign'"
            @click="handleImport(hero)"
          />
        </template>

        <template v-if="isAppAdmin" #actions-start>
          <AppButton
            variant="ghost"
            size="icon-xs"
            :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
            :icon="IconEdit"
            :to="`/hall-of-heroes/${hero.id}/edit`"
            tooltip="Edit hero"
            aria-label="Edit hero"
          />
          <AppButton
            variant="ghost"
            size="icon-xs"
            :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
            :icon="IconDelete"
            tooltip="Delete hero"
            aria-label="Delete hero"
            @click="handleDelete(hero)"
          />
        </template>
      </EntityGridCard>
      </template>
    </VirtualGrid>
    </div><!-- /listRef -->

    <template v-if="filtered.length" #footer>
      <p class="text-center text-caption text-muted-foreground">
        {{ filtered.length }} of {{ heroes?.length ?? 0 }} heroes
      </p>
    </template>
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { IconAdd, IconDelete, IconEdit, IconGenerate } from '@/lib/icons';
import { useHallOfHeroes, useDeleteHero, useImportHero, usePopulateAllSettingHeroes } from "@/composables/party/useHallOfHeroes";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import AppButton from "@/components/common/AppButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import { CARD_OVERLAY_ACTION } from "@/components/common/appButtonVariants";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { HallOfHero } from "@/types/npc.types";
import { DND_SETTINGS } from "@/data/dndSettings";

const SETTINGS = DND_SETTINGS;

const settingLabelMap: Record<string, string> = Object.fromEntries(
  SETTINGS.map((s) => [s.value, s.label])
);
function settingLabel(val: string) {
  return settingLabelMap[val] ?? val;
}

const router = useRouter();

// Mirrors the `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (gap-4) this grid used to carry.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const heroKey = (hero: HallOfHero) => hero.id;

// Row height before a row is measured (px): 273-295px across 162 heroes, 295 the median, measured at a 390px
// phone on 8 Oct 2026 over the dev:campaigns fixture. It decides where a
// restored scroll lands, since coming back from a detail re-renders every
// unmeasured row above the viewport.
const HERO_ROW_PX = 295;
const listRef = ref<HTMLElement | null>(null);
useScrollRestore("hall-of-heroes", listRef);

const auth = useAuthStore();
const campaign = useCampaignStore();
const ui = useUiStore();

const isAppAdmin = computed(() => auth.isAppAdmin);
const hasCampaign = computed(() => !!campaign.activeCampaignId);
const campaignSetting = computed(() => campaign.activeCampaign?.calendar_id ?? null);

const search = computed({
  get: () => ui.hallOfHeroesSearch,
  set: (v) => { ui.hallOfHeroesSearch = v; },
});
const settingFilter = computed({
  get: () => ui.hallOfHeroesFilterSetting,
  set: (v) => { ui.hallOfHeroesFilterSetting = v; },
});
const hasActiveFilters = computed(() => ui.hallOfHeroesHasActiveFilters);

function clearFilters() {
  ui.resetHallOfHeroesFilters();
}

const { data: heroes, isLoading } = useHallOfHeroes();
const { mutate: deleteHero } = useDeleteHero();
const { mutate: importHero } = useImportHero();
const isImporting = ref<string | null>(null);

const populateMutation = usePopulateAllSettingHeroes();
const populateResult = ref<{ inserted: number; updated: number } | null>(null);

const populateLabel = computed(() => {
  if (populateMutation.isPending.value) return "Syncing…";
  if (populateMutation.error.value) return `Error: ${populateMutation.error.value.message}`;
  if (populateResult.value) return `+${populateResult.value.inserted} / ↻${populateResult.value.updated}`;
  return "Sync All Settings";
});

async function handlePopulate() {
  populateResult.value = null;
  try {
    populateResult.value = await populateMutation.mutateAsync();
  } catch {
    // error tracked by populateMutation.error
  }
}

const filtered = computed(() => {
  let list = heroes.value ?? [];

  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.race?.toLowerCase().includes(q) ||
        h.occupation?.toLowerCase().includes(q) ||
        h.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  if (settingFilter.value !== "all") {
    list = list.filter((h) => h.setting === settingFilter.value);
  }

  const cs = campaignSetting.value;
  if (cs) {
    list = [...list].sort((a, b) => {
      const aMatch = a.setting === cs ? 0 : 1;
      const bMatch = b.setting === cs ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.name.localeCompare(b.name);
    });
  }

  return list;
});

function handleImport(hero: HallOfHero) {
  isImporting.value = hero.id;
  importHero(hero, {
    onSuccess: () => {
      isImporting.value = null;
      router.push("/npcs");
    },
    onError: () => {
      isImporting.value = null;
    },
  });
}

function handleDelete(hero: HallOfHero) {
  if (!confirm(`Delete "${hero.name}" from the Hall of Heroes?`)) return;
  deleteHero(hero);
}
</script>
