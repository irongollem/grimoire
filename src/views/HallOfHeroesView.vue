<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="Hall of Heroes"
    description="Iconic characters importable into any campaign"
  >
    <template v-if="isAppAdmin" #actions>
      <ListActionButton
        :icon="IconGenerate"
        :label="populateLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Hero"
        mobile-label="Hero"
        variant="primary"
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
      <div v-if="isLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <EmptyState
        v-else-if="!filtered.length && !search && settingFilter === 'all'"
        title="No heroes yet"
        :description="isAppAdmin ? 'Add the first hero to the Hall.' : 'The Hall of Heroes is empty.'"
      >
        <RouterLink
          v-if="isAppAdmin"
          to="/hall-of-heroes/new"
          class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <IconAdd class="h-3.5 w-3.5" />
          Add Hero
        </RouterLink>
      </EmptyState>

      <p v-else-if="!filtered.length" class="py-10 text-center font-fell text-muted-foreground">
        No heroes match your filters.
      </p>

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div
          v-for="hero in filtered"
          :key="hero.id"
          class="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
        >
          <RouterLink :to="`/hall-of-heroes/${hero.id}`" class="flex flex-1 flex-col">
            <div class="relative h-36 shrink-0 overflow-hidden bg-muted">
              <FocalImage
                v-if="hero.portrait_url"
                :src="hero.portrait_url"
                :focal-point="hero.portrait_focal_point"
                format="portrait"
                :alt="hero.name"
                class="h-full w-full object-cover"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center text-2xl font-cinzel font-bold text-muted-foreground/40"
              >
                {{ hero.name.charAt(0) }}
              </div>

              <span
                class="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 font-cinzel text-[10px] font-semibold tracking-wider text-white uppercase backdrop-blur-sm"
              >
                {{ settingLabel(hero.setting) }}
              </span>

              <span
                v-if="campaignSetting && hero.setting === campaignSetting"
                class="absolute top-2 right-2 rounded-full bg-primary/80 px-1.5 py-0.5 font-cinzel text-[9px] font-semibold tracking-wider text-primary-foreground uppercase backdrop-blur-sm"
                title="Matches your campaign's setting"
              >
                ✦
              </span>
            </div>

            <div class="flex flex-1 flex-col gap-1 p-3 min-h-18">
              <p class="font-cinzel text-sm font-semibold leading-tight line-clamp-1">{{ hero.name }}</p>
              <p v-if="hero.race || hero.occupation" class="font-fell text-xs text-muted-foreground line-clamp-1">
                {{ [hero.race, hero.occupation].filter(Boolean).join(' · ') }}
              </p>
              <div v-if="hero.tags.length" class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="tag in hero.tags.slice(0, 3)"
                  :key="tag"
                  class="rounded-full bg-muted px-2 py-0.5 font-fell text-[10px] text-muted-foreground"
                >{{ tag }}</span>
                <span v-if="hero.tags.length > 3" class="font-fell text-[10px] text-muted-foreground">+{{ hero.tags.length - 3 }}</span>
              </div>
            </div>
          </RouterLink>

          <div class="flex items-center gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              :disabled="!hasCampaign || isImporting === hero.id"
              :title="hasCampaign ? 'Add to current campaign' : 'No active campaign'"
              class="flex-1 rounded-md bg-primary/10 px-2 py-1.5 font-cinzel text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              @click="handleImport(hero)"
            >
              {{ isImporting === hero.id ? 'Adding…' : 'Add to Campaign' }}
            </button>

            <template v-if="isAppAdmin">
              <RouterLink
                :to="`/hall-of-heroes/${hero.id}/edit`"
                class="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Edit"
              >
                <IconEdit class="h-3.5 w-3.5" />
              </RouterLink>
              <button
                type="button"
                class="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete"
                @click="handleDelete(hero)"
              >
                <IconDelete class="h-3.5 w-3.5" />
              </button>
            </template>
          </div>
        </div>
      </div>
    </div><!-- /listRef -->

    <template v-if="filtered.length" #footer>
      <p class="text-center font-fell text-xs text-muted-foreground">
        {{ filtered.length }} of {{ heroes?.length ?? 0 }} heroes
      </p>
    </template>
  </ListPageLayout>

  <!-- ══ Mobile (<md): purpose-built list chrome ════════════════════════════ -->
  <div v-else class="flex h-full flex-col">
    <!-- Search row: search input + Filters button + overflow ⋮ -->
    <div class="shrink-0 px-4 pt-3">
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="search"
            type="search"
            inputmode="search"
            placeholder="Search heroes…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            v-if="search"
            type="button"
            class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            @click="search = ''"
          >
            <IconClose class="size-4" />
          </button>
        </div>

        <button
          type="button"
          class="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="Filters"
          @click="filtersOpen = true"
        >
          <IconFilter class="size-5" />
          <span
            v-if="activeFilterCount"
            class="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-cinzel text-2xs font-bold text-primary-foreground"
          >
            {{ activeFilterCount }}
          </span>
        </button>

        <!-- Overflow ⋮ (admin-only actions: New Hero + Sync) -->
        <button
          v-if="isAppAdmin"
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="More actions"
          @click="overflowOpen = true"
        >
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>

      <!-- Active-filter chips -->
      <div v-if="activeChips.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="chip in activeChips"
          :key="chip.key"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 font-fell text-xs text-foreground"
          @click="chip.clear()"
        >
          {{ chip.label }}
          <IconClose class="size-3 text-muted-foreground" />
        </button>
        <button
          type="button"
          class="font-cinzel text-xs font-semibold tracking-wider text-primary"
          @click="clearFilters"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- List body (scrolls) -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <div v-if="isLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <EmptyState
        v-else-if="!filtered.length && !search && settingFilter === 'all'"
        title="No heroes yet"
        :description="isAppAdmin ? 'Add the first hero to the Hall.' : 'The Hall of Heroes is empty.'"
      />

      <p v-else-if="!filtered.length" class="py-10 text-center font-fell text-sm italic text-muted-foreground">
        No heroes match your filters.
      </p>

      <template v-else>
        <MobileEntityMetaRow
          v-model:layout="layout"
          :shown="filtered.length"
          :total="heroes?.length ?? 0"
          plural="heroes"
        />
        <div
          :class="layout === 'gallery'
            ? 'grid grid-cols-2 gap-3 pb-2'
            : 'flex flex-col gap-2 pb-2'"
        >
          <EntityMobileCard
            v-for="hero in filtered"
            :key="hero.id"
            :layout="layout"
            :to="`/hall-of-heroes/${hero.id}`"
            :title="hero.name"
            :subtitle="[hero.race, hero.occupation].filter(Boolean).join(' · ') || undefined"
            :image-url="hero.portrait_url"
            :focal-point="hero.portrait_focal_point"
            placeholder="/assets/placeholders/npc.webp"
            :badge-text="settingLabel(hero.setting)"
            :badge-color="'#374151'"
          />
        </div>
      </template>
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter Heroes">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">Setting</p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :class="settingFilter === 'all'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'"
              @click="settingFilter = 'all'"
            >
              All
            </button>
            <button
              v-for="s in SETTINGS"
              :key="s.value"
              type="button"
              class="rounded-full border px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :class="settingFilter === s.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground'"
              @click="settingFilter = s.value"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-11 flex-1 rounded-xl border border-border bg-card font-cinzel text-sm font-semibold tracking-wider text-muted-foreground"
            @click="clearFilters"
          >
            Clear all
          </button>
          <button
            type="button"
            class="h-11 flex-1 rounded-xl bg-primary font-cinzel text-sm font-semibold tracking-wider text-primary-foreground"
            @click="filtersOpen = false"
          >
            Show {{ filtered.length }}
          </button>
        </div>
      </template>
    </MobileSheet>

    <!-- Overflow ⋮ sheet (admin-only) -->
    <MobileSheet v-model:open="overflowOpen" title="More">
      <div class="flex flex-col gap-1 py-1">
        <RouterLink
          to="/hall-of-heroes/new"
          class="flex items-center gap-3 rounded-lg px-2 py-3 font-fell text-sm text-foreground active:bg-muted/50"
          @click="overflowOpen = false"
        >
          <IconAdd class="size-5 shrink-0 text-muted-foreground" /> New Hero
        </RouterLink>
        <button
          type="button"
          :disabled="populateMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handlePopulate()"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" />
          {{ populateLabel }}
        </button>
      </div>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { useScrollRestore } from "@/composables/useScrollRestore";
import {
  IconAdd, IconClose, IconDelete, IconEdit, IconGenerate, IconSearch, IconSettings,
} from "@/lib/icons";
import { useHallOfHeroes, useDeleteHero, useImportHero, usePopulateAllSettingHeroes } from "@/composables/useHallOfHeroes";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import type { HallOfHero } from "@/types/npc.types";
import { DND_SETTINGS } from "@/data/dndSettings";

const IconFilter = IconSettings;

const SETTINGS = DND_SETTINGS;

const settingLabelMap: Record<string, string> = Object.fromEntries(
  SETTINGS.map((s) => [s.value, s.label]),
);
function settingLabel(val: string) {
  return settingLabelMap[val] ?? val;
}

const router = useRouter();
const listRef = ref<HTMLElement | null>(null);
useScrollRestore("hall-of-heroes", listRef);

const auth = useAuthStore();
const campaign = useCampaignStore();
const ui = useUiStore();

const isMobile = useMediaQuery("(max-width: 767px)");
const filtersOpen = ref(false);
const overflowOpen = ref(false);

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

const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

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

// ── Mobile filter chips ──────────────────────────────────────────────────────
const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (search.value) chips.push({ key: "search", label: `"${search.value}"`, clear: () => { search.value = ""; } });
  if (settingFilter.value !== "all") {
    const lbl = settingLabelMap[settingFilter.value] ?? settingFilter.value;
    chips.push({ key: "setting", label: lbl, clear: () => { settingFilter.value = "all"; } });
  }
  return chips;
});

const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);

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
