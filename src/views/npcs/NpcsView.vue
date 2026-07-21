<template>
  <!-- ══ Desktop (≥md): existing ListPageLayout chrome — unchanged ══════════ -->
  <ListPageLayout
    v-if="!isMobile"
    title="NPC Tracker"
    description="The denizens of your realm — allies, enemies, and unknowns"
  >
    <template #title-suffix>
      <ManualHelpLink page="npc-tracker-overview" />
    </template>

    <template #actions>
      <ListActionButton :icon="IconLayers" label="Sets" to="/npcs/sets" />
      <ListActionButton :icon="IconNetwork" label="Web" to="/npcs/web" />
      <ListActionButton
        v-if="hasSetting"
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.npcGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New NPC"
        mobile-label="NPC"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <template #filters>
      <ListFilterBar
        :has-active-filters="hasActiveFilters"
        @clear="clearFilters"
      >
        <!-- Row 1: search (full width) -->
        <template #above>
          <ListSearchInput
            v-model="search"
            placeholder="Search NPCs…"
            :inline="false"
          />
        </template>

        <!-- Row 2: filters + sort (rendered inside the flex-wrap row) -->
        <ListFilterGroup
          v-model="statusFilter"
          :options="STATUS_OPTIONS"
          aria-label="Status filter"
        />
        <ListFilterGroup
          v-model="relFilter"
          :options="REL_OPTIONS"
          aria-label="Relationship filter"
        />

        <EntityCombobox
          :model-value="locationFilter"
          :options="locationOptions"
          placeholder="All locations"
          class="flex-1 min-w-36"
          @update:model-value="locationFilter = $event"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>

        <EntityCombobox
          :model-value="partyMemberFilter"
          :options="partyOptions"
          placeholder="Connected to…"
          class="flex-1 min-w-36"
          @update:model-value="partyMemberFilter = $event"
        />

        <ListFilterGroup
          v-model="sortBy"
          :options="SORT_OPTIONS"
          aria-label="Sort by"
        />
      </ListFilterBar>
    </template>

    <NpcList
      :search="search"
      :status-filter="statusFilter"
      :rel-filter="relFilter"
      :location-filter="locationFilter"
      :party-member-filter="partyMemberFilter"
      :sort-by="sortBy"
    />
  </ListPageLayout>

  <!-- ══ Mobile (<md): purpose-built list chrome ═══════════════════════════ -->
  <div v-else class="flex h-full flex-col">
    <div class="shrink-0 px-4 pt-3">
      <!-- Search row: search input + Filters button + overflow ⋮ -->
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <IconSearch
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="search"
            type="search"
            inputmode="search"
            placeholder="Search NPCs…"
            class="h-11 w-full rounded-full border border-border bg-card pl-9 pr-9 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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

        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground"
          aria-label="More actions"
          @click="overflowOpen = true"
        >
          <!-- Vertical ⋮ — no kebab glyph in the icon set, so render inline -->
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      </div>

      <!-- Active-filter chips (wrap, no horizontal scroll) -->
      <div v-if="activeChips.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="chip in activeChips"
          :key="chip.key"
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 text-caption text-foreground"
          @click="chip.clear()"
        >
          {{ chip.label }}
          <IconClose class="size-3 text-muted-foreground" />
        </button>
        <button
          type="button"
          class="text-label-lg font-semibold text-primary"
          @click="clearFilters"
        >
          Clear all
        </button>
      </div>
    </div>

    <!-- List body (scrolls). The docked DM bottom nav owns the create "+"
         (Prep mode), so this view no longer has its own bottom New bar.
         The shell's <main> already reserves space for the docked bar. -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
      <NpcList
        :search="search"
        :status-filter="statusFilter"
        :rel-filter="relFilter"
        :location-filter="locationFilter"
        :party-member-filter="partyMemberFilter"
        :sort-by="sortBy"
      />
    </div>

    <!-- Filters bottom sheet -->
    <MobileSheet v-model:open="filtersOpen" title="Filter NPCs">
      <div class="flex flex-col gap-4 py-1">
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Status</p>
          <ListFilterGroup v-model="statusFilter" :options="STATUS_OPTIONS" aria-label="Status filter" />
        </div>
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Relationship</p>
          <NpcRelationshipFilter v-model="relFilter" />
        </div>
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Location</p>
          <EntityCombobox
            :model-value="locationFilter"
            :options="locationOptions"
            placeholder="All locations"
            class="w-full"
            @update:model-value="locationFilter = $event"
          >
            <template #option="{ opt }">
              <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
            </template>
          </EntityCombobox>
        </div>
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Connected to</p>
          <EntityCombobox
            :model-value="partyMemberFilter"
            :options="partyOptions"
            placeholder="Connected to…"
            class="w-full"
            @update:model-value="partyMemberFilter = $event"
          />
        </div>
        <div>
          <p class="mb-1.5 text-label-lg font-semibold text-muted-foreground">Sort by</p>
          <ListFilterGroup v-model="sortBy" :options="SORT_OPTIONS" aria-label="Sort by" />
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
            Show {{ matchCount }}
          </button>
        </div>
      </template>
    </MobileSheet>

    <!-- Overflow ⋮ sheet -->
    <MobileSheet v-model:open="overflowOpen" title="More">
      <div class="flex flex-col gap-1 py-1">
        <RouterLink
          to="/npcs/sets"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-body text-foreground hover:bg-muted/50"
          @click="overflowOpen = false"
        >
          <IconLayers class="size-5 shrink-0 text-muted-foreground" /> Sets
        </RouterLink>
        <RouterLink
          to="/npcs/web"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-body text-foreground hover:bg-muted/50"
          @click="overflowOpen = false"
        >
          <IconNetwork class="size-5 shrink-0 text-muted-foreground" /> Web
        </RouterLink>
        <button
          type="button"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-body text-foreground hover:bg-muted/50"
          @click="overflowOpen = false; ui.npcGeneratorOpen = true"
        >
          <IconGenerate class="size-5 shrink-0 text-muted-foreground" /> Generate
        </button>
        <button
          v-if="hasSetting"
          type="button"
          :disabled="populateMutation.isPending.value"
          class="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-body text-foreground hover:bg-muted/50 disabled:opacity-50"
          @click="overflowOpen = false; handlePopulate()"
        >
          <component :is="populateMutation.isPending.value ? IconLoading : IconPopulate" class="size-5 shrink-0 text-muted-foreground" />
          {{ populateStatusLabel }}
        </button>
      </div>
    </MobileSheet>
  </div>

  <PaywallModal v-model="showPaywall" resource="npcs" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import {
  IconAdd, IconClose, IconGenerate, IconLayers, IconLoading,
  IconNetwork, IconPopulate, IconSearch, IconSettings,
} from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import NpcRelationshipFilter from "@/components/npcs/NpcRelationshipFilter.vue";
import NpcList from "@/components/npcs/NpcList.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/useLocations";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import { usePopulateSettingNpcs } from "@/composables/useNpcs";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useCreateGate } from "@/composables/useCreateGate";

// IconSettings (sliders) reads as "filters". The overflow ⋮ has no kebab glyph
// in the icon set, so it is rendered as an inline SVG in the template.
const IconFilter = IconSettings;

type LocationOption = { id: string; name: string; depth: number };

const ui = useUiStore();
const campaign = useCampaignStore();
const { showPaywall, handleNew, gateQuotaError } = useCreateGate("npcs", "/npcs/new");
const isMobile = useMediaQuery("(max-width: 767px)");

const filtersOpen = ref(false);
const overflowOpen = ref(false);
const { locationOptions, getDescendantIds } = useLocationTree();
const { data: party } = useParty();
const { data: npcs } = useNpcs();

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const populateMutation = usePopulateSettingNpcs();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} NPC${populatedCount.value !== 1 ? "s" : ""}`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    if (gateQuotaError(e)) return; // free-tier cap hit → show paywall, not a raw error
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
  { value: "missing", label: "Missing" },
  { value: "unknown", label: "?" },
] as const satisfies ReadonlyArray<{ value: NpcStatus | "all"; label: string }>;

const REL_OPTIONS = [
  { value: "all", label: "All" },
  { value: "helpful", label: "Helpful" },
  { value: "friendly", label: "Friendly" },
  { value: "indifferent", label: "Indifferent" },
  { value: "unfriendly", label: "Unfriendly" },
  { value: "hostile", label: "Hostile" },
  { value: "unknown", label: "Unknown" },
] as const satisfies ReadonlyArray<{ value: NpcRelationship | "all"; label: string }>;

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "location", label: "Location" },
] as const satisfies ReadonlyArray<{ value: "name" | "location"; label: string }>;

const search = computed({ get: () => ui.npcsSearchQuery, set: (v) => { ui.npcsSearchQuery = v; } });
const statusFilter = computed({ get: () => ui.npcsFilterStatus, set: (v: NpcStatus | "all") => { ui.npcsFilterStatus = v; } });
const relFilter = computed({ get: () => ui.npcsFilterRelationship, set: (v: NpcRelationship | "all") => { ui.npcsFilterRelationship = v; } });
const locationFilter = computed({ get: () => ui.npcsFilterLocation, set: (v) => { ui.npcsFilterLocation = v; } });
const partyMemberFilter = computed({ get: () => ui.npcsFilterPartyMember, set: (v) => { ui.npcsFilterPartyMember = v; } });
const sortBy = computed({ get: () => ui.npcsFilterSortBy, set: (v) => { ui.npcsFilterSortBy = v; } });

const partyOptions = computed(() => (party.value ?? []).map((m) => ({ id: m.id, name: m.name })));

const hasActiveFilters = computed(() => ui.npcsHasActiveFilters);
function clearFilters() { ui.resetNpcsFilters(); }

// ── Mobile filter chrome ────────────────────────────────────────────────────

const statusLabel = (v: string) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
const relLabel = (v: string) => REL_OPTIONS.find((o) => o.value === v)?.label ?? v;
const locationLabel = (id: string) => locationOptions.value.find((l) => l.id === id)?.name ?? "Location";
const partyLabel = (id: string) => partyOptions.value.find((p) => p.id === id)?.name ?? "Connected";

// One chip per active filter; each removes only its own filter.
const activeChips = computed(() => {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (search.value) chips.push({ key: "search", label: `"${search.value}"`, clear: () => { search.value = ""; } });
  if (statusFilter.value !== "all") chips.push({ key: "status", label: statusLabel(statusFilter.value), clear: () => { statusFilter.value = "all"; } });
  if (relFilter.value !== "all") chips.push({ key: "rel", label: relLabel(relFilter.value), clear: () => { relFilter.value = "all"; } });
  if (locationFilter.value) chips.push({ key: "loc", label: locationLabel(locationFilter.value), clear: () => { locationFilter.value = ""; } });
  if (partyMemberFilter.value) chips.push({ key: "party", label: partyLabel(partyMemberFilter.value), clear: () => { partyMemberFilter.value = ""; } });
  if (sortBy.value !== "location") chips.push({ key: "sort", label: `Sort: ${sortBy.value}`, clear: () => { sortBy.value = "location"; } });
  return chips;
});

// Badge count on the Filters button (search is shown as its own chip, so it
// is excluded here to keep the badge reflecting "filters" not "search").
const activeFilterCount = computed(() =>
  activeChips.value.filter((c) => c.key !== "search").length,
);

// Live "Show N" count for the filter sheet footer — mirrors NpcList filtering.
const matchCount = computed(() => {
  let list = npcs.value ?? [];
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.disguise_name?.toLowerCase().includes(q) ||
        n.race?.toLowerCase().includes(q) ||
        n.occupation?.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (statusFilter.value !== "all") list = list.filter((n) => n.status === statusFilter.value);
  if (relFilter.value !== "all") list = list.filter((n) => n.relationship === relFilter.value);
  if (locationFilter.value) {
    const ids = getDescendantIds(locationFilter.value);
    list = list.filter((n) => n.location_id && ids.has(n.location_id));
  }
  return list.length;
});
</script>
