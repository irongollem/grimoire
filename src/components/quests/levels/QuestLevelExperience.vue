<template>
  <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
    <div class="flex flex-col gap-2.5">
      <span class="text-caption text-muted-foreground">The party, toward its next level</span>
      <div class="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-body">
        <template v-for="row in rows" :key="row.id">
          <span class="truncate">{{ row.name }}</span>
          <span
            role="meter"
            :aria-label="`${row.name}: ${row.xp} of ${row.next ?? row.xp} XP`"
            :aria-valuenow="row.xp"
            :aria-valuemin="row.floor"
            :aria-valuemax="row.next ?? row.xp"
            class="block h-1.5 bg-muted"
          >
            <span class="block h-1.5 bg-primary" :style="{ width: `${row.pct}%` }" />
          </span>
          <span v-if="row.ready" class="text-caption font-semibold text-primary">Ready ↑</span>
          <span v-else class="text-caption tabular-nums">{{ row.xp.toLocaleString() }}<template v-if="row.next !== null"> / {{ row.next.toLocaleString() }}</template></span>
        </template>
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <span class="text-caption text-muted-foreground">What the open quests are worth, shared by {{ party.length }}</span>
      <p v-if="worths.length === 0" class="text-body italic text-muted-foreground">No open quests.</p>
      <ul v-else class="space-y-1.5 text-body">
        <li v-for="w in worths" :key="w.questId" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,9rem)] items-baseline gap-3">
          <RouterLink :to="`/quests/${w.questId}`" class="truncate hover:underline">{{ w.title }}</RouterLink>
          <span class="text-caption tabular-nums" :class="w.xp === null ? 'text-muted-foreground' : ''">
            {{ w.xp === null ? "no worth set" : `${w.xp.toLocaleString()} XP` }}
          </span>
          <RouterLink v-if="w.xp === null" :to="`/quests/${w.questId}`" class="text-caption text-primary hover:underline">Set it</RouterLink>
          <span v-else-if="w.bringsAllTo !== null" class="text-caption text-primary">brings all to level {{ w.bringsAllTo }}</span>
          <span v-else class="text-caption text-muted-foreground">{{ w.each?.toLocaleString() }} each</span>
        </li>
      </ul>
      <QuestLevelFlags
        v-if="openQuests.length && party.length"
        :quest-ids="openQuests.map((q) => q.id)"
        :level="lowestLevel"
        :party-ids="party.map((m) => m.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import QuestLevelFlags from "./QuestLevelFlags.vue";
import { questWorths } from "@/lib/quests/levelPlan";
import { levelForXp, xpForLevel, xpForNextLevel, type PartyMember } from "@/types/party.types";
import type { Quest } from "@/types/quest.types";

/**
 * The Level Plan in a campaign that levels by experience (#1021 row 27, canvas frame 02): each character toward the
 * next level, and what each open quest is worth to them, shared as the database shares it.
 */
const { party, quests } = defineProps<{ party: PartyMember[]; quests: Quest[] }>();

const rows = computed(() =>
  party.map((m) => {
    const xp = m.experience_points ?? 0;
    const floor = xpForLevel(m.level);
    const next = xpForNextLevel(m.level);
    const pct = next === null || next <= floor ? 100 : Math.max(0, Math.min(100, ((xp - floor) / (next - floor)) * 100));
    return { id: m.id, name: m.name, xp, floor, next, pct, ready: levelForXp(xp) > m.level };
  }),
);

const openQuests = computed(() => quests.filter((q) => q.status === "active" || q.status === "undiscovered"));
const worths = computed(() =>
  questWorths(openQuests.value, party.map((m) => ({ level: m.level, experience_points: m.experience_points ?? 0 })))
    // The quests worth the most first; the ones with no worth last, where Set it asks for it.
    .sort((a, b) => (b.xp ?? -1) - (a.xp ?? -1)),
);
/** Judged at the lowest level in the party: the fight is as hard as it is for the one who is behind. */
const lowestLevel = computed(() => Math.min(...party.map((m) => m.level)));
</script>
