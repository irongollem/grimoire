<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && questFilter === 'all'"
      title="No encounters yet"
      description="Build encounters to plan combat — monsters, factions, difficulty analysis, and live tracking."
    >
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="handleNew"
        >
          Build your first encounter
        </button>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No encounters match your search.
    </p>

    <!-- ── Mobile list (<md): compact rows / gallery ─────────────────────── -->
    <template v-else-if="isMobile">
      <MobileEntityMetaRow
        v-model:layout="layout"
        :shown="filtered.length"
        :total="encounters?.length ?? 0"
        plural="encounters"
      />
      <div
        :class="layout === 'gallery'
          ? 'grid grid-cols-2 gap-3 pb-2'
          : 'flex flex-col gap-2 pb-2'"
      >
        <EntityMobileCard
          v-for="encounter in filtered"
          :key="encounter.id"
          :layout="layout"
          :to="`/encounters/${encounter.id}`"
          :title="encounter.name"
          :subtitle="encounterSubtitle(encounter)"
          :image-url="null"
          placeholder="/assets/placeholders/dungeonfeature.webp"
          :badge-text="encounter.is_finished ? 'Done' : (isEncounterRunning(encounter.id) ? 'Live' : encounterDifficultyLabel(encounter))"
          :badge-color="encounter.is_finished ? '#6b7280' : (isEncounterRunning(encounter.id) ? '#22c55e' : encounterDifficultyColor(encounter))"
        />
      </div>
    </template>

    <!-- ── Desktop grid (≥md): unchanged ─────────────────────────────────── -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div
        v-for="encounter in filtered"
        :key="encounter.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay (disabled for locked items) -->
        <RouterLink v-if="!lockedEncounterIds.has(encounter.id)" :to="`/encounters/${encounter.id}`" class="absolute inset-0 z-2" />

        <!-- Locked overlay for over-quota items -->
        <div
          v-if="lockedEncounterIds.has(encounter.id)"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
        >
          <IconLock class="h-4 w-4 text-muted-foreground" />
          <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">Locked</p>
          <RouterLink to="/billing" class="font-cinzel text-[9px] tracking-wider text-primary/80 hover:text-primary transition-colors">
            Upgrade to access
          </RouterLink>
        </div>

        <!-- Difficulty colour bar -->
        <div
          class="h-1.5 w-full shrink-0"
          :style="{ backgroundColor: encounterDifficultyColor(encounter) }"
        />

        <div class="p-4 flex flex-col gap-3 flex-1">
          <!-- Name -->
          <div class="flex items-start justify-between gap-2">
            <h3
              class="font-cinzel text-sm font-bold text-foreground leading-tight flex-1 line-clamp-1"
            >
              {{ encounter.name }}
            </h3>
            <span
              v-if="encounter.is_finished"
              class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground bg-muted/60 border border-border"
            >
              <IconCheckDouble class="h-3 w-3" />
              Done
            </span>
            <span
              v-else-if="isEncounterRunning(encounter.id)"
              class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider text-green-400 bg-green-500/15 border border-green-500/30"
            >
              <span
                class="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"
              />
              Live
            </span>
            <span
              v-else
              class="shrink-0 px-2 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider text-white"
              :style="{ backgroundColor: encounterDifficultyColor(encounter) }"
            >
              {{ encounterDifficultyLabel(encounter) }}
            </span>
          </div>

          <!-- Description -->
          <p
            v-if="descriptionText(encounter.description)"
            class="font-fell text-xs text-muted-foreground italic line-clamp-2"
          >
            {{ descriptionText(encounter.description) }}
          </p>

          <!-- Stats row -->
          <div
            class="flex gap-4 mt-auto font-cinzel text-[11px] text-muted-foreground"
          >
            <span class="flex items-center gap-1">
              <IconMonster class="h-3 w-3" />
              {{ totalMonsterCount(encounter) }} monster{{
                totalMonsterCount(encounter) !== 1 ? "s" : ""
              }}
            </span>
            <span class="flex items-center gap-1">
              <IconParty class="h-3 w-3" />
              {{ encounter.party_member_ids.length }} player{{
                encounter.party_member_ids.length !== 1 ? "s" : ""
              }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <p
      v-if="filtered.length && !isMobile"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ encounters?.length ?? 0 }} encounters
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconCheckDouble, IconLock, IconMonster, IconParty } from '@/lib/icons';
import { useEncounters } from "@/composables/useEncounters";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import {
  DIFFICULTY_COLORS,
  calculateDifficulty,
  crToXp,
} from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import { useAllMonsters } from "@/composables/useMonsters";
import { useEncounterQuestLinks } from "@/composables/useQuests";
import { useEncountersInRollTables } from "@/composables/useRollTables";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate, quota: encounterQuota } = useQuota("encounters");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/encounters/new");
}

const ui = useUiStore();
const search = computed(() => ui.encountersSearch);
const hideFinished = computed(() => ui.encountersHideFinished);
const questFilter = computed(() => ui.encountersFilterQuestId);

const isMobile = useMediaQuery("(max-width: 767px)");
const layout = computed({
  get: () => ui.entityListLayout,
  set: (v: "rows" | "gallery") => { ui.entityListLayout = v; },
});

const { data: encounters, isLoading } = useEncounters();
const { data: monsters } = useAllMonsters();
const { data: questLinks } = useEncounterQuestLinks();
const { isEncounterRunning } = useRunningEncounters();
const rollTableEncounterIds = useEncountersInRollTables();

const linkedEncounterIds = computed(() => {
  const ids = new Set<string>(rollTableEncounterIds.value);
  for (const link of questLinks.value ?? []) ids.add(link.encounterId);
  return ids;
});

const questEncounterMap = computed(() => {
  const map = new Map<string, Set<string>>();
  for (const link of questLinks.value ?? []) {
    if (!map.has(link.questId)) map.set(link.questId, new Set());
    map.get(link.questId)!.add(link.encounterId);
  }
  return map;
});

const filtered = computed(() => {
  let list = encounters.value ?? [];
  if (hideFinished.value) list = list.filter((e) => !e.is_finished);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter((e) => e.name.toLowerCase().includes(q));
  }
  if (questFilter.value === "unassigned") {
    list = list.filter((e) => !linkedEncounterIds.value.has(e.id));
  } else if (questFilter.value !== "all") {
    const ids = questEncounterMap.value.get(questFilter.value) ?? new Set<string>();
    list = list.filter((e) => ids.has(e.id));
  }
  return list;
});

const lockedEncounterIds = computed((): Set<string> => {
  const q = encounterQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(encounters.value ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((e) => e.id));
});

function descriptionText(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const doc = JSON.parse(raw);
    const texts: string[] = [];
    function extract(node: { text?: string; content?: unknown[] }) {
      if (node.text) texts.push(node.text);
      node.content?.forEach((child) => extract(child as typeof node));
    }
    extract(doc);
    return texts.join(" ").trim();
  } catch {
    return raw;
  }
}

function totalMonsterCount(encounter: Encounter): number {
  return encounter.combatants.reduce((s, c) => s + c.count, 0);
}

function encounterDifficultyLabel(encounter: Encounter): string {
  if (!encounter.combatants.length) return "Trivial";
  const monsterMap = new Map((monsters.value ?? []).map((m) => [m.id, m]));

  const enemyFactionIds = new Set(
    encounter.factions
      .filter((f) => f.hostile_to.includes("players"))
      .map((f) => f.id),
  );
  enemyFactionIds.add("enemy");

  const enemyEntries = encounter.combatants
    .filter((c) => enemyFactionIds.has(c.faction_id))
    .map((c) => ({
      cr:
        (c.monster_id
          ? monsterMap.get(c.monster_id)?.stat_block.challenge_rating
          : null) ?? null,
      count: c.count,
    }))
    .filter((e) => crToXp(e.cr) > 0);

  if (!enemyEntries.length) return "Trivial";

  const result = calculateDifficulty(
    enemyEntries,
    Array(Math.max(encounter.party_member_ids.length, 1)).fill(3),
  );
  return result.label;
}

function encounterDifficultyColor(encounter: Encounter): string {
  const label = encounterDifficultyLabel(encounter);
  return (
    DIFFICULTY_COLORS[label as keyof typeof DIFFICULTY_COLORS] ?? "#6B7280"
  );
}

function encounterSubtitle(encounter: Encounter): string {
  const count = totalMonsterCount(encounter);
  return `${count} monster${count !== 1 ? "s" : ""} · ${encounter.party_member_ids.length} player${encounter.party_member_ids.length !== 1 ? "s" : ""}`;
}
</script>
