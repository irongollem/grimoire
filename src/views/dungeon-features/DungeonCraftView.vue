<template>
  <PageHeader title="Dungeon Craft" description="Secret doors, traps, hazards & dungeon enigmas">
    <template #actions>
      <!-- Features tab actions -->
      <template v-if="activeTab === 'features'">
        <ListActionButton
          :icon="featuresPopulate.isPending.value ? Loader2 : BookOpen"
          :label="featuresPopulateLabel"
          :disabled="featuresPopulate.isPending.value"
          @click="handleFeaturesPopulate"
        />
        <ListActionButton
          :icon="Plus"
          label="New Feature"
          mobile-label="Feature"
          variant="primary"
          @click="router.push('/dungeon-features/new')"
        />
      </template>

      <!-- Traps tab actions -->
      <template v-else-if="activeTab === 'traps'">
        <ListActionButton
          :icon="trapsPopulate.isPending.value ? Loader2 : BookOpen"
          :label="trapsPopulateLabel"
          :disabled="trapsPopulate.isPending.value"
          @click="handleTrapsPopulate"
        />
        <ListActionButton
          :icon="Sparkles"
          label="Generate"
          @click="ui.trapGeneratorOpen = true"
        />
        <ListActionButton
          :icon="Plus"
          label="New Trap"
          mobile-label="Trap"
          variant="primary"
          @click="router.push('/traps/new')"
        />
      </template>

      <!-- Roll Tables tab actions -->
      <template v-else-if="activeTab === 'roll-tables'">
        <template v-if="!selectedRollTableId && !inlineNewRollTable">
          <ListActionButton
            :icon="rollTablesPopulate.isPending.value ? Loader2 : BookOpen"
            :label="rollTablesPopulateLabel"
            :disabled="rollTablesPopulate.isPending.value"
            @click="handleRollTablesPopulate"
          />
          <ListActionButton
            :icon="Plus"
            label="New Roll Table"
            mobile-label="Roll Table"
            variant="primary"
            @click="inlineNewRollTable = true"
          />
        </template>
        <ListActionButton
          v-else
          label="← All Tables"
          :collapse-on-mobile="false"
          @click="closeInlineRollTable"
        />
      </template>

      <!-- Loot Tables tab actions -->
      <template v-else-if="activeTab === 'loot-tables'">
        <ListActionButton
          :icon="Plus"
          label="New Loot Table"
          mobile-label="Loot Table"
          variant="primary"
          @click="router.push('/loot-tables/new')"
        />
      </template>

      <!-- Puzzles tab actions -->
      <template v-else>
        <ListActionButton
          :icon="puzzlesPopulate.isPending.value ? Loader2 : BookOpen"
          :label="puzzlesPopulateLabel"
          :disabled="puzzlesPopulate.isPending.value"
          @click="handlePuzzlesPopulate"
        />
        <ListActionButton
          :icon="Sparkles"
          label="Generate"
          @click="ui.puzzleGeneratorOpen = true"
        />
        <ListActionButton
          :icon="Plus"
          label="New Puzzle"
          mobile-label="Puzzle"
          variant="primary"
          @click="router.push('/puzzles/new')"
        />
      </template>
    </template>

    <!-- Tab bar -->
    <div class="flex gap-1 mb-5 border-b border-border">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors border-b-2 -mb-px"
        :class="activeTab === tab.id
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="setTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ── Features tab ──────────────────────────────────────────────────── -->
    <template v-if="activeTab === 'features'">
      <div v-if="featuresLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>
      <template v-else-if="features?.length">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <input
            v-model="featuresSearch"
            type="search"
            placeholder="Search features…"
            class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            v-model="featuresTypeFilter"
            class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Types</option>
            <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <p v-if="!filteredFeatures.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
          No features match your filter.
        </p>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <RouterLink
            v-for="feature in filteredFeatures"
            :key="feature.id"
            :to="`/dungeon-features/${feature.id}`"
            class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
          >
            <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
              <FocalImage
                v-if="feature.image_url"
                :src="feature.image_url"
                :alt="feature.name"
                format="portrait"
                :focal-point="feature.image_focal_point"
                class="group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20">
                <DoorOpenIcon class="h-10 w-10" />
              </div>
              <span
                class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
                :style="{ backgroundColor: DUNGEON_FEATURE_TYPE_COLORS[feature.feature_type] + 'DD' }"
              >{{ feature.feature_type }}</span>
            </div>
            <div class="p-2.5 flex flex-col gap-0.5">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ feature.name }}</h3>
              <div class="flex items-center gap-2">
                <span v-if="feature.trigger_type" class="font-fell text-[10px] text-muted-foreground italic truncate">
                  {{ feature.trigger_type }}
                </span>
                <span v-if="feature.perception_dc" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
                  Perc {{ feature.perception_dc }}
                </span>
              </div>
            </div>
          </RouterLink>
        </div>
      </template>
      <EmptyState
        v-else
        icon="DoorOpen"
        title="No dungeon features yet"
        description="Add secret doors, hidden passages, treasure chests and more."
        action-label="New Feature"
        @action="router.push('/dungeon-features/new')"
      />
    </template>

    <!-- ── Traps tab ─────────────────────────────────────────────────────── -->
    <template v-else-if="activeTab === 'traps'">
      <div v-if="trapsLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>
      <template v-else-if="traps?.length">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <input
            v-model="trapsSearch"
            type="search"
            placeholder="Search traps…"
            class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            v-model="trapsTypeFilter"
            class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Types</option>
            <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <p v-if="!filteredTraps.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
          No traps match your filter.
        </p>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <RouterLink
            v-for="trap in filteredTraps"
            :key="trap.id"
            :to="`/traps/${trap.id}`"
            class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
          >
            <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
              <FocalImage
                v-if="trap.image_url"
                :src="trap.image_url"
                :alt="trap.name"
                format="portrait"
                :focal-point="trap.image_focal_point"
                class="group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20">
                <CrosshairIcon class="h-10 w-10" />
              </div>
              <span
                class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
                :style="{ backgroundColor: TRAP_TYPE_COLORS[trap.trap_type] + 'DD' }"
              >{{ trap.trap_type }}</span>
            </div>
            <div class="p-2.5 flex flex-col gap-0.5">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ trap.name }}</h3>
              <div class="flex items-center gap-2">
                <span v-if="trap.cr" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">CR {{ trap.cr }}</span>
                <span v-if="trap.trigger_type" class="font-fell text-[10px] text-muted-foreground italic truncate">{{ trap.trigger_type }}</span>
              </div>
            </div>
          </RouterLink>
        </div>
      </template>
      <EmptyState
        v-else
        icon="Crosshair"
        title="No traps yet"
        description="Build your first trap — set the trigger, DCs, damage, and CR."
        action-label="New Trap"
        @action="router.push('/traps/new')"
      />
    </template>

    <!-- ── Roll Tables tab ───────────────────────────────────────────────── -->
    <template v-else-if="activeTab === 'roll-tables'">
      <!-- Inline detail: editing or creating a table -->
      <RollTableDetailView
        v-if="selectedRollTableId || inlineNewRollTable"
        :inline-id="selectedRollTableId ?? undefined"
        :inline-new="inlineNewRollTable"
        @done="closeInlineRollTable"
      />

      <!-- List -->
      <template v-else>
        <div v-if="rollTablesLoading" class="flex justify-center py-16">
          <LoadingSpinner />
        </div>
        <template v-else-if="rollTables?.length">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <input
              v-model="rollTablesSearch"
              type="search"
              placeholder="Search roll tables…"
              class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <select
              v-model="rollTablesDieFilter"
              class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Dice</option>
              <option v-for="d in ROLL_TABLE_DICE" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <p v-if="!filteredRollTables.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
            No roll tables match your filter.
          </p>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              v-for="t in filteredRollTables"
              :key="t.id"
              type="button"
              class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors text-left"
              @click="selectedRollTableId = t.id"
            >
              <div class="flex items-start justify-between gap-2 mb-1">
                <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
                <span class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wider shrink-0">{{ t.dice }}</span>
              </div>
              <p v-if="t.description" class="font-fell text-xs text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
              <p class="font-fell text-[10px] text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "entry" : "entries" }}</p>
            </button>
          </div>
        </template>
        <EmptyState
          v-else
          icon="Dices"
          title="No roll tables yet"
          description="Build a wandering monster table or two — the DM rolls live during play to surface what shows up."
          action-label="New Roll Table"
          @action="inlineNewRollTable = true"
        />
      </template>
    </template>

    <!-- ── Loot Tables tab ───────────────────────────────────────────────── -->
    <template v-else-if="activeTab === 'loot-tables'">
      <div v-if="lootTablesLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>
      <template v-else-if="lootTables?.length">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <input
            v-model="lootTablesSearch"
            type="search"
            placeholder="Search loot tables…"
            class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            v-model="lootTablesTierFilter"
            class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Tiers</option>
            <option v-for="t in LOOT_CR_TIERS" :key="t" :value="t">{{ LOOT_CR_TIER_LABELS[t] }}</option>
          </select>
        </div>
        <p v-if="!filteredLootTables.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
          No loot tables match your filter.
        </p>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <RouterLink
            v-for="t in filteredLootTables"
            :key="t.id"
            :to="`/loot-tables/${t.id}`"
            class="flex flex-col rounded-lg border border-border bg-card p-3 hover:border-primary/50 transition-colors"
          >
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ t.name }}</h3>
              <span v-if="t.cr_tier !== 'any'" class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold tracking-wider shrink-0">{{ LOOT_CR_TIER_LABELS[t.cr_tier] }}</span>
            </div>
            <p v-if="t.description" class="font-fell text-xs text-muted-foreground italic line-clamp-2">{{ t.description }}</p>
            <p class="font-fell text-[10px] text-muted-foreground mt-2">{{ t.entries.length }} {{ t.entries.length === 1 ? "item" : "items" }}</p>
          </RouterLink>
        </div>
      </template>
      <EmptyState
        v-else
        icon="Coins"
        title="No loot tables yet"
        description="Build your first hoard — add Vault items with their own drop chances and quantities."
        action-label="New Loot Table"
        @action="router.push('/loot-tables/new')"
      />
    </template>

    <!-- ── Puzzles tab ───────────────────────────────────────────────────── -->
    <template v-else>
      <div v-if="puzzlesLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>
      <template v-else-if="puzzles?.length">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <input
            v-model="puzzlesSearch"
            type="search"
            placeholder="Search puzzles…"
            class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            v-model="puzzlesTypeFilter"
            class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Types</option>
            <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <select
            v-model="puzzlesDifficultyFilter"
            class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Difficulties</option>
            <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
        <p v-if="!filteredPuzzles.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
          No puzzles match your filter.
        </p>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <RouterLink
            v-for="puzzle in filteredPuzzles"
            :key="puzzle.id"
            :to="`/puzzles/${puzzle.id}`"
            class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
          >
            <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
              <FocalImage
                v-if="puzzle.image_url"
                :src="puzzle.image_url"
                :alt="puzzle.name"
                format="portrait"
                :focal-point="puzzle.image_focal_point"
                class="group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20">
                <PuzzleIcon class="h-10 w-10" />
              </div>
              <span
                class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
                :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
              >{{ puzzle.puzzle_type }}</span>
              <span
                class="absolute bottom-2 right-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
                :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
              >{{ puzzle.difficulty }}</span>
            </div>
            <div class="p-2.5 flex flex-col gap-0.5">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
              <div class="flex items-center gap-2">
                <span class="font-fell text-[10px] text-muted-foreground italic">
                  {{ puzzle.hints.length }} hint{{ puzzle.hints.length === 1 ? '' : 's' }}
                </span>
                <span v-if="puzzle.skill_checks.length" class="font-fell text-[10px] text-muted-foreground italic truncate">
                  · {{ puzzle.skill_checks.map((s) => s.skill).join(', ') }}
                </span>
              </div>
            </div>
          </RouterLink>
        </div>
      </template>
      <EmptyState
        v-else
        icon="Puzzle"
        title="No puzzles yet"
        description="Build your first puzzle room — set the riddle, add tiered hints, and record the solution."
        action-label="New Puzzle"
        @action="router.push('/puzzles/new')"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  DoorOpen as DoorOpenIcon,
  Crosshair as CrosshairIcon,
  Puzzle as PuzzleIcon,
  Loader2,
  BookOpen,
  Sparkles,
  Plus,
} from "lucide-vue-next";

import { useDungeonFeatures, usePopulateDungeonFeatures } from "@/composables/useDungeonFeatures";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TYPE_COLORS } from "@/types/dungeonFeature.types";

import { useTraps, usePopulateTraps } from "@/composables/useTraps";
import { TRAP_TYPES, TRAP_TYPE_COLORS } from "@/types/trap.types";

import { usePuzzles, usePopulatePuzzles } from "@/composables/usePuzzles";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";

import { useRollTables, usePopulateRollTables } from "@/composables/useRollTables";
import { ROLL_TABLE_DICE } from "@/types/rollTable.types";

import { useLootTables } from "@/composables/useLootTables";
import { LOOT_CR_TIERS, LOOT_CR_TIER_LABELS } from "@/types/lootTable.types";

import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import RollTableDetailView from "@/views/dungeon-features/RollTableDetailView.vue";

const route  = useRoute();
const router = useRouter();
const ui     = useUiStore();

type Tab = "features" | "traps" | "puzzles" | "roll-tables" | "loot-tables";
const TABS: { id: Tab; label: string }[] = [
  { id: "features",    label: "Features" },
  { id: "traps",       label: "Traproom" },
  { id: "puzzles",     label: "Enigmarium" },
  { id: "roll-tables", label: "Roll Tables" },
  { id: "loot-tables", label: "Loot Tables" },
];

const VALID_TABS: Tab[] = ["features", "traps", "puzzles", "roll-tables", "loot-tables"];
const rawTab = route.query.tab as string | undefined;
const activeTab = ref<Tab>(
  VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "features",
);

function setTab(tab: Tab) {
  activeTab.value = tab;
  closeInlineRollTable();
  router.replace({ query: tab === "features" ? {} : { tab } });
}

// ── Features ─────────────────────────────────────────────────────────────────
const { data: features, isLoading: featuresLoading } = useDungeonFeatures();
const featuresSearch     = ref("");
const featuresTypeFilter = ref("");

const filteredFeatures = computed(() => {
  let list = features.value ?? [];
  if (featuresTypeFilter.value) list = list.filter((f) => f.feature_type === featuresTypeFilter.value);
  const q = featuresSearch.value.toLowerCase().trim();
  if (q) list = list.filter((f) =>
    f.name.toLowerCase().includes(q) ||
    (f.trigger_type ?? "").toLowerCase().includes(q) ||
    f.tags.some((t) => t.toLowerCase().includes(q)),
  );
  return list;
});

const featuresPopulate      = usePopulateDungeonFeatures();
const featuresPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const featuresPopulatedCount = ref(0);
const featuresPopulateError  = ref<string | null>(null);

const featuresPopulateLabel = computed(() => {
  if (featuresPopulate.isPending.value) return "Populating…";
  if (featuresPopulateError.value) return `Error: ${featuresPopulateError.value}`;
  if (featuresPopulateStatus.value === "done") return `Added ${featuresPopulatedCount.value} features`;
  if (featuresPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handleFeaturesPopulate() {
  featuresPopulateStatus.value = "idle";
  featuresPopulateError.value  = null;
  try {
    const count = await featuresPopulate.mutateAsync();
    featuresPopulatedCount.value = count;
    featuresPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    featuresPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { featuresPopulateStatus.value = "idle"; featuresPopulateError.value = null; }, 8000);
}

// ── Traps ─────────────────────────────────────────────────────────────────────
const { data: traps, isLoading: trapsLoading } = useTraps();
const trapsSearch     = ref("");
const trapsTypeFilter = ref("");

const filteredTraps = computed(() => {
  let list = traps.value ?? [];
  if (trapsTypeFilter.value) list = list.filter((t) => t.trap_type === trapsTypeFilter.value);
  const q = trapsSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.trigger_type ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});

const trapsPopulate      = usePopulateTraps();
const trapsPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const trapsPopulatedCount = ref(0);
const trapsPopulateError  = ref<string | null>(null);

const trapsPopulateLabel = computed(() => {
  if (trapsPopulate.isPending.value) return "Populating…";
  if (trapsPopulateError.value) return `Error: ${trapsPopulateError.value}`;
  if (trapsPopulateStatus.value === "done") return `Added ${trapsPopulatedCount.value} traps`;
  if (trapsPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Traproom";
});

async function handleTrapsPopulate() {
  trapsPopulateStatus.value = "idle";
  trapsPopulateError.value  = null;
  try {
    const count = await trapsPopulate.mutateAsync();
    trapsPopulatedCount.value = count;
    trapsPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    trapsPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { trapsPopulateStatus.value = "idle"; trapsPopulateError.value = null; }, 8000);
}

// ── Puzzles ───────────────────────────────────────────────────────────────────
const { data: puzzles, isLoading: puzzlesLoading } = usePuzzles();
const puzzlesSearch          = ref("");
const puzzlesTypeFilter      = ref("");
const puzzlesDifficultyFilter = ref("");

const filteredPuzzles = computed(() => {
  let list = puzzles.value ?? [];
  if (puzzlesTypeFilter.value) list = list.filter((p) => p.puzzle_type === puzzlesTypeFilter.value);
  if (puzzlesDifficultyFilter.value) list = list.filter((p) => p.difficulty === puzzlesDifficultyFilter.value);
  const q = puzzlesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.tags.some((t) => t.toLowerCase().includes(q)),
  );
  return list;
});

const puzzlesPopulate      = usePopulatePuzzles();
const puzzlesPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const puzzlesPopulatedCount = ref(0);
const puzzlesPopulateError  = ref<string | null>(null);

const puzzlesPopulateLabel = computed(() => {
  if (puzzlesPopulate.isPending.value) return "Populating…";
  if (puzzlesPopulateError.value) return `Error: ${puzzlesPopulateError.value}`;
  if (puzzlesPopulateStatus.value === "done") return `Added ${puzzlesPopulatedCount.value} puzzles`;
  if (puzzlesPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handlePuzzlesPopulate() {
  puzzlesPopulateStatus.value = "idle";
  puzzlesPopulateError.value  = null;
  try {
    const count = await puzzlesPopulate.mutateAsync();
    puzzlesPopulatedCount.value = count;
    puzzlesPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    puzzlesPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { puzzlesPopulateStatus.value = "idle"; puzzlesPopulateError.value = null; }, 8000);
}

// ── Roll Tables ──────────────────────────────────────────────────────────────
// Inline detail state — null/false = show list, otherwise show editor inside tab
const selectedRollTableId = ref<string | null>(null);
const inlineNewRollTable  = ref(false);

function closeInlineRollTable() {
  selectedRollTableId.value = null;
  inlineNewRollTable.value  = false;
}

const { data: rollTables, isLoading: rollTablesLoading } = useRollTables();
const rollTablesSearch    = ref("");
const rollTablesDieFilter = ref("");

const filteredRollTables = computed(() => {
  let list = rollTables.value ?? [];
  if (rollTablesDieFilter.value) list = list.filter((t) => t.dice === rollTablesDieFilter.value);
  const q = rollTablesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.description ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});

const rollTablesPopulate       = usePopulateRollTables();
const rollTablesPopulateStatus = ref<"idle" | "done" | "uptodate">("idle");
const rollTablesPopulatedCount = ref(0);
const rollTablesPopulateError  = ref<string | null>(null);

const rollTablesPopulateLabel = computed(() => {
  if (rollTablesPopulate.isPending.value) return "Populating…";
  if (rollTablesPopulateError.value) return `Error: ${rollTablesPopulateError.value}`;
  if (rollTablesPopulateStatus.value === "done") return `Added ${rollTablesPopulatedCount.value} tables`;
  if (rollTablesPopulateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handleRollTablesPopulate() {
  rollTablesPopulateStatus.value = "idle";
  rollTablesPopulateError.value  = null;
  try {
    const count = await rollTablesPopulate.mutateAsync();
    rollTablesPopulatedCount.value = count;
    rollTablesPopulateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    rollTablesPopulateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => { rollTablesPopulateStatus.value = "idle"; rollTablesPopulateError.value = null; }, 8000);
}

// ── Loot Tables ──────────────────────────────────────────────────────────────
const { data: lootTables, isLoading: lootTablesLoading } = useLootTables();
const lootTablesSearch     = ref("");
const lootTablesTierFilter = ref("");

const filteredLootTables = computed(() => {
  let list = lootTables.value ?? [];
  if (lootTablesTierFilter.value) list = list.filter((t) => t.cr_tier === lootTablesTierFilter.value);
  const q = lootTablesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((t) =>
    t.name.toLowerCase().includes(q) ||
    (t.description ?? "").toLowerCase().includes(q) ||
    t.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});
</script>
