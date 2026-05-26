<template>
  <ListPageLayout title="Hall of Heroes" description="Iconic characters importable into any campaign">
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
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { IconAdd, IconDelete, IconEdit, IconGenerate } from '@/lib/icons';
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
