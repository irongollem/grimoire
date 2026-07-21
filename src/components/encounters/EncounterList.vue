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
      <template #icon><IconNavEncounters class="h-16 w-16" /></template>
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
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No encounters match your search.
    </p>

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
          <p class="text-label font-semibold text-muted-foreground">Locked</p>
          <RouterLink to="/billing" class="text-label text-primary/80 hover:text-primary transition-colors">
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
              class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-label font-bold text-muted-foreground bg-muted/60 border border-border"
            >
              <IconCheckDouble class="h-3 w-3" />
              Done
            </span>
            <span
              v-else-if="isEncounterRunning(encounter.id)"
              class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-label font-bold text-green-400 bg-green-500/15 border border-green-500/30"
            >
              <span
                class="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"
              />
              Live
            </span>
            <span
              v-else
              class="shrink-0 px-2 py-0.5 rounded text-label font-bold text-white"
              :style="{ backgroundColor: encounterDifficultyColor(encounter) }"
            >
              {{ encounterDifficultyLabel(encounter) }}
            </span>
          </div>

          <!-- Description -->
          <p
            v-if="descriptionText(encounter.description)"
            class="text-caption text-muted-foreground italic line-clamp-2"
          >
            {{ descriptionText(encounter.description) }}
          </p>

          <!-- Stats row -->
          <div
            class="flex gap-4 mt-auto font-cinzel text-xs text-muted-foreground"
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
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ encounters?.length ?? 0 }} encounters
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconCheckDouble, IconLock, IconMonster, IconNavEncounters, IconParty } from '@/lib/icons';
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

const { data: encounters, isLoading } = useEncounters();
const { data: monsters } = useAllMonsters();
const { data: questLinks } = useEncounterQuestLinks();
const { isEncounterRunning } = useRunningEncounters();
const rollTableEncounterIds = useEncountersInRollTables();

// "Assigned" = linked to at least one quest OR cited by at least one roll table.
// The Unassigned filter hides any encounter that's claimed by either, so a DM
// only sees orphans they still need to slot somewhere.
const linkedEncounterIds = computed(() => {
  const ids = new Set<string>(rollTableEncounterIds.value);
  for (const link of questLinks.value ?? []) ids.add(link.encounterId);
  return ids;
});

// Map from questId → Set of encounter IDs
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

  // Only enemy-faction combatants count
  const enemyFactionIds = new Set(
    encounter.factions
      .filter((f) => f.hostile_to.includes("players"))
      .map((f) => f.id),
  );
  // Also include "enemy" by default
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

  // No party info in the list — just show based on raw XP
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
</script>
