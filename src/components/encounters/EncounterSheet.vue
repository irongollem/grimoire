<template>
  <div class="flex flex-col gap-6">
    <!-- Top action bar -->
    <div class="flex flex-wrap items-center gap-2">
      <RouterLink
        to="/encounters"
        class="inline-flex items-center gap-1 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconChevronLeft class="h-3.5 w-3.5" />
        All Encounters
      </RouterLink>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <span
          v-if="thisIsLive"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/15 border border-green-500/30 text-label-lg font-semibold text-green-500 animate-pulse"
        >● In Progress</span>

        <!-- Difficulty badge -->
        <span
          class="inline-flex items-center px-2.5 py-1.5 rounded-md text-label-lg font-semibold text-white"
          :style="{ backgroundColor: difficultyColor }"
        >{{ difficulty.label }}</span>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 font-cinzel text-xs font-semibold transition-colors"
          :class="encounter.is_finished
            ? 'border-border text-muted-foreground hover:text-foreground'
            : 'border-primary/40 text-primary hover:bg-primary/10'"
          @click="toggleFinished"
        >
          <IconCheckDouble class="h-3.5 w-3.5" />
          {{ encounter.is_finished ? "Reopen" : "Mark Done" }}
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          :disabled="deleteEncounter.isPending.value"
          @click="handleDelete"
        >
          <IconClose class="h-3.5 w-3.5" />
          Delete
        </button>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          @click="router.push({ query: { ...route.query, edit: 'true' } })"
        >
          <IconEdit class="h-3.5 w-3.5" />
          Edit
        </button>

        <!-- Live controls -->
        <template v-if="thisIsLive">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
            @click="handleRestart"
          >
            <IconReset class="h-3.5 w-3.5" />
            Restart
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            @click="handleStop"
          >
            <IconStop class="h-3.5 w-3.5" />
            Stop
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            @click="handleRunEncounter"
          >
            <IconPlay class="h-3.5 w-3.5" />
            Resume
          </button>
        </template>

        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          @click="handleRunEncounter"
        >
          <IconPlay class="h-3.5 w-3.5" />
          Run Encounter
        </button>
      </div>
    </div>

    <!-- Header + description -->
    <div class="flex flex-col gap-2">
      <h1 class="font-cinzel text-2xl font-bold text-foreground leading-tight">{{ encounter.name }}</h1>
      <div v-if="encounterLocation" class="flex items-center gap-2">
        <IconLocation class="h-3.5 w-3.5 text-muted-foreground" />
        <RouterLink
          :to="`/locations/${encounterLocation.id}`"
          class="font-fell text-sm text-muted-foreground hover:text-foreground transition-colors"
        >{{ encounterLocation.name }}</RouterLink>
      </div>
      <div v-if="hasDescription" class="mt-2">
        <RichTextViewer :content="encounter.description" />
      </div>
    </div>

    <!-- Linked Quests -->
    <section v-if="linkedQuests?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Part of Quest
        <span class="font-fell font-normal text-muted-foreground">({{ linkedQuests.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="q in linkedQuests"
          :key="q.id"
          :to="`/quests/${q.id}`"
          class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <IconScrollText class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="font-fell text-xs text-foreground truncate max-w-64">{{ q.title }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Factions -->
    <section v-if="encounter.factions?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Factions
        <span class="font-fell font-normal text-muted-foreground">({{ encounter.factions.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="f in encounter.factions"
          :key="f.id"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: f.color ?? '#64748b' }"
          />
          <span class="font-fell text-xs text-foreground">{{ f.name }}</span>
        </span>
      </div>
    </section>

    <!-- Party + companions -->
    <section v-if="partyRoster.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Party
        <span class="font-fell font-normal text-muted-foreground">({{ partyRoster.length }})</span>
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <RouterLink
          v-for="m in partyRoster"
          :key="m.key"
          :to="m.route"
          class="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 hover:border-primary/50 transition-colors"
        >
          <IconUserRound class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ m.name }}</p>
            <p v-if="m.factionName" class="font-fell text-2xs text-muted-foreground italic truncate">
              {{ m.factionName }}
            </p>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- Combatants -->
    <section v-if="encounter.combatants?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Combatants
        <span class="font-fell font-normal text-muted-foreground">({{ totalMonsters }})</span>
      </h2>
      <div class="flex flex-col gap-1">
        <RouterLink
          v-for="c in combatantRows"
          :key="c.id"
          :to="c.route ?? '/monsters'"
          class="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 hover:border-primary/50 transition-colors"
        >
          <IconMonster class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span class="font-cinzel text-sm font-bold text-primary shrink-0 w-8 text-right">{{ c.count }}×</span>
          <span class="flex-1 font-fell text-sm text-foreground truncate">{{ c.name }}</span>
          <span
            v-if="c.factionName"
            class="text-label text-muted-foreground"
          >{{ c.factionName }}</span>
          <span
            v-if="c.cr"
            class="text-label rounded px-1.5 py-0.5 bg-muted text-muted-foreground"
          >CR {{ c.cr }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Difficulty Analysis -->
    <EncounterDifficulty
      :difficulty="difficulty"
      :threshold-tiers="thresholdTiers"
      :enemy-entries="enemyEntries"
    />

    <!-- Loot -->
    <section v-if="hasLoot" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Loot</h2>
      <div v-if="coinSummary" class="font-fell text-sm text-foreground">{{ coinSummary }}</div>
      <div v-if="lootItems.length" class="flex flex-wrap gap-2">
        <RouterLink
          v-for="it in lootItems"
          :key="it.id"
          :to="`/vault/${it.id}`"
          class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <IconPackage class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="font-fell text-xs text-foreground">{{ it.name }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Traps -->
    <section v-if="encounterTraps.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Traps
        <span class="font-fell font-normal text-muted-foreground">({{ encounterTraps.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="t in encounterTraps"
          :key="t.id"
          :to="`/traps/${t.id}`"
          class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <IconTrap class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="font-fell text-xs text-foreground">{{ t.name }}</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { IconCheckDouble, IconChevronLeft, IconClose, IconEdit, IconLocation, IconMonster, IconPackage, IconPlay, IconReset, IconScrollText, IconStop, IconTrap, IconUserRound } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { supabase } from "@/lib/supabase";
import {
  useUpdateEncounter,
  useDeleteEncounter,
} from "@/composables/useEncounters";
import {
  useRunningEncounters,
  useEncounterLive,
} from "@/composables/useEncounterLive";
import { useQuestsForEncounter } from "@/composables/useQuests";
import { useParty } from "@/composables/useParty";
import { useCompanions } from "@/composables/useCompanions";
import { useAllMonsters } from "@/composables/useMonsters";
import { useNpcs } from "@/composables/useNpcs";
import { useItems } from "@/composables/useItems";
import { useTraps } from "@/composables/useTraps";
import { useAllLocations } from "@/composables/useLocations";
import { useEncounterDifficulty } from "@/composables/useEncounterDifficulty";
import { formatCoinParts } from "@/lib/currency";
import { DIFFICULTY_COLORS } from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import EncounterDifficulty from "@/components/encounters/EncounterDifficulty.vue";

const props = defineProps<{ encounter: Encounter }>();
const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

// ── Live state ─────────────────────────────────────────────────────────────
const updateEncounter = useUpdateEncounter();
const deleteEncounter = useDeleteEncounter();
const { firstRunning, isEncounterRunning } = useRunningEncounters();
const { endLive } = useEncounterLive(props.encounter.id);

const thisIsLive   = computed(() => isEncounterRunning(props.encounter.id));
const otherIsLive  = computed(() => firstRunning.value !== null && !thisIsLive.value);

// ── Linked data ────────────────────────────────────────────────────────────
const { data: linkedQuests } = useQuestsForEncounter(props.encounter.id);
const { data: party }        = useParty();
const { data: companions }   = useCompanions();
const { data: monsters }     = useAllMonsters();
const { data: npcs }         = useNpcs();
const { data: allItems }     = useItems();
const { data: traps }        = useTraps();
const { data: allLocs }      = useAllLocations();

// ── Difficulty ─────────────────────────────────────────────────────────────
const { difficulty, thresholdTiers, enemyEntries } = useEncounterDifficulty({
  combatants:     computed(() => props.encounter.combatants ?? []),
  factions:       computed(() => props.encounter.factions ?? []),
  partyMemberIds: computed(() => props.encounter.party_member_ids ?? []),
  companionIds:   computed(() => props.encounter.companion_ids ?? []),
  trapIds:        computed(() => props.encounter.trap_ids ?? []),
  monsters:       computed(() => monsters.value ?? []),
  npcs:           computed(() => npcs.value ?? []),
  party,
  companions,
  allTraps: traps,
});

const difficultyColor = computed(
  () => DIFFICULTY_COLORS[difficulty.value.label] ?? "#6B7280",
);

const encounterLocation = computed(
  () => (allLocs.value ?? []).find((l) => l.id === props.encounter.location_id) ?? null,
);

// ── Party + companions, with faction badge ─────────────────────────────────
type Roster = { key: string; name: string; route: string; factionName: string | null };

function factionName(id: string | undefined): string | null {
  if (!id || id === "players") return null;
  const f = props.encounter.factions.find((x) => x.id === id);
  return f?.name ?? null;
}

const partyRoster = computed<Roster[]>(() => {
  const rows: Roster[] = [];
  for (const id of props.encounter.party_member_ids ?? []) {
    const member = (party.value ?? []).find((m) => m.id === id);
    if (!member) continue;
    rows.push({
      key: `pm-${id}`,
      name: member.name,
      route: `/party/${member.id}`,
      factionName: factionName(props.encounter.party_member_factions?.[id]),
    });
  }
  for (const id of props.encounter.companion_ids ?? []) {
    const comp = (companions.value ?? []).find((c) => c.id === id);
    if (!comp) continue;
    rows.push({
      key: `c-${id}`,
      name: comp.name,
      route: `/companions/${comp.id}`,
      factionName: factionName(props.encounter.party_member_factions?.[id]),
    });
  }
  return rows;
});

// ── Combatants ──────────────────────────────────────────────────────────────
type Combatant = { id: string; name: string; count: number; cr: string | null; factionName: string | null; route: string | null };

const combatantRows = computed<Combatant[]>(() =>
  (props.encounter.combatants ?? []).map((c) => {
    const monster = c.monster_id ? (monsters.value ?? []).find((m) => m.id === c.monster_id) : null;
    const npc     = c.npc_id ? (npcs.value ?? []).find((n) => n.id === c.npc_id) : null;
    const name = c.custom_name || monster?.name || npc?.name || "Unknown";
    const cr = monster?.stat_block?.challenge_rating ?? null;
    const route = monster ? `/monsters/${monster.id}` : npc ? `/npcs/${npc.id}` : null;
    return {
      id: c.id,
      name,
      count: c.count,
      cr,
      factionName: factionName(c.faction_id),
      route,
    };
  }),
);

const totalMonsters = computed(() =>
  (props.encounter.combatants ?? []).reduce((s, c) => s + c.count, 0),
);

// ── Loot ────────────────────────────────────────────────────────────────────
const lootItems = computed(() =>
  (props.encounter.item_ids ?? [])
    .map((id) => (allItems.value ?? []).find((it) => it.id === id))
    .filter((it): it is NonNullable<typeof it> => !!it),
);

const coinSummary = computed(() => {
  const pools = props.encounter.reward_currency_pools ?? [];
  if (!pools.length) return "";
  const sum = pools.reduce(
    (acc, p) => ({
      pp: acc.pp + (p.pp ?? 0),
      gp: acc.gp + (p.gp ?? 0),
      ep: acc.ep + (p.ep ?? 0),
      sp: acc.sp + (p.sp ?? 0),
      cp: acc.cp + (p.cp ?? 0),
    }),
    { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  );
  const parts = formatCoinParts(sum.pp, sum.gp, sum.ep, sum.sp, sum.cp);
  return parts.join(" ");
});

const hasLoot = computed(
  () => lootItems.value.length > 0 || !!coinSummary.value,
);

// ── Traps ───────────────────────────────────────────────────────────────────
const encounterTraps = computed(() =>
  (props.encounter.trap_ids ?? [])
    .map((id) => (traps.value ?? []).find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t),
);

// ── Description guard ──────────────────────────────────────────────────────
const hasDescription = computed(() => {
  const d = props.encounter.description;
  if (!d) return false;
  try {
    const doc = JSON.parse(d);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(d).trim().length > 0;
  }
});

// ── Action handlers (mirrored from EncounterDetail) ─────────────────────────
async function toggleFinished() {
  await updateEncounter.mutateAsync({
    id: props.encounter.id,
    update: { is_finished: !props.encounter.is_finished },
  });
}

async function handleDelete() {
  if (!(await confirm(`Delete encounter "${props.encounter.name}"? This cannot be undone.`))) return;
  router.push("/encounters");
  try {
    await deleteEncounter.mutateAsync(props.encounter.id);
  } catch {
    // swallow — the route push already moved the DM off the deleted page
  }
}

async function handleRunEncounter() {
  if (otherIsLive.value && firstRunning.value) {
    const other = firstRunning.value.encounter_id;
    if (!(await confirm(`Another encounter is active. Stop it and run this one?`))) return;
    await supabase.from("encounter_state").update({ is_running: false }).eq("encounter_id", other);
  }
  router.push(`/encounters/${props.encounter.id}/run`);
}

async function handleStop() {
  if (!(await confirm("Stop this encounter? Party stats will NOT be updated."))) return;
  await endLive();
}

async function handleRestart() {
  if (!(await confirm("Restart this encounter from scratch?"))) return;
  await endLive();
  router.push(`/encounters/${props.encounter.id}/run`);
}
</script>
