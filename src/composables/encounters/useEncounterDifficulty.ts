import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import { useAllCampaignCharacterClasses } from "@/composables/party/useCharacterClasses";
import { crToXp } from "@/types/encounter.types";
import {
  difficultyLookups,
  encounterDifficulty,
  enemyFactionIds,
  type DifficultyLookups,
} from "@/lib/encounters/difficulty";
import type { CombatantDef, FactionDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { Companion } from "@/types/companion.types";
import type { Trap } from "@/types/trap.types";
import type { PartyMember } from "@/types/party.types";

export interface EnemyEntry {
  id: string;
  name: string;
  cr: string;
  count: number;
  xpEach: number;
}

export interface ThresholdTier {
  label: string;
  value: number;
  color: string;
  pct: number;
}

export function useEncounterDifficulty(params: {
  combatants: Ref<CombatantDef[]> | ComputedRef<CombatantDef[]>;
  factions: Ref<FactionDef[]> | ComputedRef<FactionDef[]>;
  partyMemberIds: Ref<string[]> | ComputedRef<string[]>;
  companionIds: Ref<string[]> | ComputedRef<string[]>;
  trapIds: Ref<string[]> | ComputedRef<string[]>;
  monsters: Ref<Monster[]> | ComputedRef<Monster[]>;
  npcs: Ref<Npc[]> | ComputedRef<Npc[]>;
  party: Ref<PartyMember[] | null | undefined> | ComputedRef<PartyMember[] | null | undefined>;
  companions: Ref<Companion[] | null | undefined> | ComputedRef<Companion[] | null | undefined>;
  allTraps: Ref<Trap[] | null | undefined> | ComputedRef<Trap[] | null | undefined>;
}) {
  const {
    combatants,
    factions,
    partyMemberIds,
    companionIds,
    trapIds,
    monsters,
    npcs,
    party,
    companions,
    allTraps,
  } = params;

  const monsterMap = computed(
    () => new Map(monsters.value.map((m) => [m.id, m])),
  );
  const npcMap = computed(
    () => new Map(npcs.value.map((n) => [n.id, n])),
  );

  function monsterCr(monsterId: string | null): string {
    if (!monsterId) return "0";
    return monsterMap.value.get(monsterId)?.stat_block.challenge_rating ?? "0";
  }
  function crXp(monsterId: string | null): number {
    if (!monsterId) return 0;
    return crToXp(monsterMap.value.get(monsterId)?.stat_block.challenge_rating);
  }
  function npcCr(npcId: string | null): string {
    if (!npcId) return "0";
    return npcMap.value.get(npcId)?.stat_block?.challenge_rating ?? "0";
  }
  function npcCrXp(npcId: string | null): number {
    if (!npcId) return 0;
    return crToXp(npcMap.value.get(npcId)?.stat_block?.challenge_rating);
  }
  function combatantLabel(entry: CombatantDef): string {
    if (entry.npc_id)
      return entry.custom_name || (npcMap.value.get(entry.npc_id)?.name ?? "Unknown");
    return entry.custom_name || (monsterMap.value.get(entry.monster_id ?? "")?.name ?? "Unknown");
  }

  const enemies = computed(() => enemyFactionIds(factions.value));

  const enemyEntries = computed<EnemyEntry[]>(() =>
    combatants.value
      .filter((c) => enemies.value.has(c.faction_id))
      .map((c) => ({
        id: c.id,
        name: combatantLabel(c),
        cr: c.npc_id ? npcCr(c.npc_id) : monsterCr(c.monster_id),
        count: c.count,
        xpEach: c.npc_id ? npcCrXp(c.npc_id) : crXp(c.monster_id),
      })),
  );

  const { data: allCharacterClasses } = useAllCampaignCharacterClasses();

  const lookups = computed<DifficultyLookups>(() =>
    difficultyLookups({
      monsters: monsters.value,
      npcs: npcs.value,
      party: party.value ?? [],
      characterClasses: allCharacterClasses.value ?? [],
      companions: companions.value ?? [],
      traps: allTraps.value ?? [],
    }),
  );

  // The same calculation the Encounters list uses (`lib/encounters/difficulty`).
  const difficulty = computed(() =>
    encounterDifficulty(
      {
        combatants: combatants.value,
        factions: factions.value,
        party_member_ids: partyMemberIds.value,
        companion_ids: companionIds.value,
        trap_ids: trapIds.value,
      },
      lookups.value,
    ),
  );

  const thresholdTiers = computed<ThresholdTier[]>(() => {
    const t = difficulty.value.partyThresholds;
    const max = t.deadly * 1.5 || 1;
    return [
      { label: "Easy",   value: t.easy,   color: "#16A34A", pct: Math.min(100, (t.easy   / max) * 100) },
      { label: "Medium", value: t.medium, color: "#CA8A04", pct: Math.min(100, (t.medium / max) * 100) },
      { label: "Hard",   value: t.hard,   color: "#EA580C", pct: Math.min(100, (t.hard   / max) * 100) },
      { label: "Deadly", value: t.deadly, color: "#DC2626", pct: Math.min(100, (t.deadly / max) * 100) },
    ];
  });

  return { difficulty, thresholdTiers, enemyEntries };
}
