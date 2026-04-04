<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search"
      title="No encounters yet"
      description="Build encounters to plan combat — monsters, factions, difficulty analysis, and live tracking."
    >
      <template #action>
        <RouterLink
          to="/encounters/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Build your first encounter
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No encounters match your search.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <RouterLink
        v-for="encounter in filtered"
        :key="encounter.id"
        :to="`/encounters/${encounter.id}`"
        class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
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
              <CheckCheck class="h-3 w-3" />
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
              <Skull class="h-3 w-3" />
              {{ totalMonsterCount(encounter) }} monster{{
                totalMonsterCount(encounter) !== 1 ? "s" : ""
              }}
            </span>
            <span class="flex items-center gap-1">
              <Users class="h-3 w-3" />
              {{ encounter.party_member_ids.length }} player{{
                encounter.party_member_ids.length !== 1 ? "s" : ""
              }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>

    <p
      v-if="filtered.length"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ encounters?.length ?? 0 }} encounters
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Skull, Users, CheckCheck } from "lucide-vue-next";
import { useEncounters } from "@/composables/useEncounters";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import {
  DIFFICULTY_COLORS,
  calculateDifficulty,
  crToXp,
} from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import { useAllMonsters } from "@/composables/useMonsters";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const ui = useUiStore();
const search = computed(() => ui.encountersSearch);
const hideFinished = computed(() => ui.encountersHideFinished);

const { data: encounters, isLoading } = useEncounters();
const { data: monsters } = useAllMonsters();
const { isEncounterRunning } = useRunningEncounters();

const filtered = computed(() => {
  let list = encounters.value ?? [];
  if (hideFinished.value) list = list.filter((e) => !e.is_finished);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter((e) => e.name.toLowerCase().includes(q));
  }
  return list;
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
